import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { ApiError } from "./errors";
import { JsonObject, query, withTransaction } from "./db";
import { getDocument, listDocuments, setDocument } from "./doc-store";
import {
  ApiRequest,
  ApiResponse,
  clearCookie,
  getHeader,
  getRequestIp,
  maybeEnv,
  setCookie,
  validateEmail,
} from "./http";

const SESSION_COOKIE_NAME = "cdmf_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_CACHE_TTL_MS = 30_000; // 30 seconds in-memory cache
const GOOGLE_SCOPE = "openid email profile";
let googleIdTokenClient: OAuth2Client | null = null;

// In-memory session cache to avoid a DB round-trip on every RPC call.
// Sessions are valid for 30 days; a 30-second cache is safe.
const sessionCache = new Map<string, { user: UnifiedUser; expiresAt: number }>();

function getCachedSession(sessionId: string): UnifiedUser | null {
  const entry = sessionCache.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    sessionCache.delete(sessionId);
    return null;
  }
  return entry.user;
}

function setCachedSession(sessionId: string, user: UnifiedUser): void {
  sessionCache.set(sessionId, { user, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
}

function evictCachedSession(sessionId: string): void {
  sessionCache.delete(sessionId);
}

type AuthUserRow = {
  uid: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  photo_url: string | null;
  phone_number: string | null;
  provider: string;
  google_sub: string | null;
};

export type UnifiedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  providerData: Array<{ providerId: string }>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function passwordProviderId(provider: string): string {
  return provider === "google" ? "google.com" : "password";
}

function toUnifiedUser(user: AuthUserRow): UnifiedUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.display_name,
    photoURL: user.photo_url,
    phoneNumber: user.phone_number,
    providerData: [{ providerId: passwordProviderId(user.provider) }],
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash) {
    return false;
  }

  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const candidate = scryptSync(password, salt, 64);
  const target = Buffer.from(hash, "hex");
  if (candidate.length !== target.length) {
    return false;
  }
  return timingSafeEqual(candidate, target);
}

async function getAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const result = await query<AuthUserRow>(
    `
      SELECT uid, email, password_hash, display_name, photo_url, phone_number, provider, google_sub
      FROM auth_users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizeEmail(email)]
  );
  return result.rows[0] ?? null;
}

async function getAuthUserById(uid: string): Promise<AuthUserRow | null> {
  const result = await query<AuthUserRow>(
    `
      SELECT uid, email, password_hash, display_name, photo_url, phone_number, provider, google_sub
      FROM auth_users
      WHERE uid = $1
      LIMIT 1
    `,
    [uid]
  );
  return result.rows[0] ?? null;
}

async function upsertAuthUser(user: {
  uid?: string;
  email: string;
  passwordHash?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  phoneNumber?: string | null;
  provider: "password" | "google";
  googleSub?: string | null;
}): Promise<AuthUserRow> {
  return withTransaction(async (client) => {
    const normalizedEmail = normalizeEmail(user.email);
    const existingByEmail = await query<AuthUserRow>(
      `
        SELECT uid, email, password_hash, display_name, photo_url, phone_number, provider, google_sub
        FROM auth_users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizedEmail],
      client
    );

    const current = existingByEmail.rows[0];
    const uid = current?.uid || user.uid || `usr_${randomUUID().replace(/-/g, "")}`;
    const passwordHash = user.passwordHash ?? current?.password_hash ?? null;
    const provider = user.provider;
    const googleSub = user.googleSub ?? current?.google_sub ?? null;
    const displayName = user.displayName ?? current?.display_name ?? null;
    const photoURL = user.photoURL ?? current?.photo_url ?? null;
    const phoneNumber = user.phoneNumber ?? current?.phone_number ?? null;

    await query(
      `
        INSERT INTO auth_users (
          uid, email, password_hash, display_name, photo_url, phone_number, provider, google_sub, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (uid)
        DO UPDATE
        SET email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            display_name = EXCLUDED.display_name,
            photo_url = EXCLUDED.photo_url,
            phone_number = EXCLUDED.phone_number,
            provider = EXCLUDED.provider,
            google_sub = EXCLUDED.google_sub,
            updated_at = NOW()
      `,
      [uid, normalizedEmail, passwordHash, displayName, photoURL, phoneNumber, provider, googleSub],
      client
    );

    const saved = await query<AuthUserRow>(
      `
        SELECT uid, email, password_hash, display_name, photo_url, phone_number, provider, google_sub
        FROM auth_users
        WHERE uid = $1
        LIMIT 1
      `,
      [uid],
      client
    );

    return saved.rows[0];
  });
}

async function createSession(req: ApiRequest, res: ApiResponse, userId: string): Promise<string> {
  const sessionId = `sess_${randomUUID().replace(/-/g, "")}`;
  const userAgent = getHeader(req, "user-agent") || "";
  const ipAddress = getRequestIp(req);

  await query(
    `
      INSERT INTO auth_sessions (session_id, user_id, expires_at, user_agent, ip_address)
      VALUES ($1, $2, NOW() + INTERVAL '30 days', $3, $4)
    `,
    [sessionId, userId, userAgent.slice(0, 1024), ipAddress.slice(0, 255)]
  );

  setCookie(req, res, SESSION_COOKIE_NAME, sessionId, { maxAge: SESSION_TTL_SECONDS });
  return sessionId;
}

export async function signOutUser(req: ApiRequest, res: ApiResponse): Promise<void> {
  const sessionId = getSessionId(req);
  if (sessionId) {
    evictCachedSession(sessionId);
    await query(`DELETE FROM auth_sessions WHERE session_id = $1`, [sessionId]);
  }
  clearCookie(req, res, SESSION_COOKIE_NAME);
}

function getSessionId(req: ApiRequest): string | undefined {
  const cookieHeader = getHeader(req, "cookie");
  if (!cookieHeader) {
    return undefined;
  }

  const entries = cookieHeader.split(";").map((part) => part.trim());
  const pair = entries.find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!pair) {
    return undefined;
  }
  return decodeURIComponent(pair.slice(SESSION_COOKIE_NAME.length + 1));
}

export async function getSessionUser(req: ApiRequest): Promise<UnifiedUser | null> {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return null;
  }

  const cached = getCachedSession(sessionId);
  if (cached) {
    return cached;
  }

  const result = await query<AuthUserRow>(
    `
      SELECT u.uid, u.email, u.password_hash, u.display_name, u.photo_url, u.phone_number, u.provider, u.google_sub
      FROM auth_sessions s
      JOIN auth_users u ON u.uid = s.user_id
      WHERE s.session_id = $1
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [sessionId]
  );

  const user = result.rows[0];
  if (!user) {
    return null;
  }

  const unifiedUser = toUnifiedUser(user);
  setCachedSession(sessionId, unifiedUser);
  return unifiedUser;
}

export async function requireSessionUser(req: ApiRequest): Promise<UnifiedUser> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new ApiError(401, "unauthenticated", "UsuÃ¡rio nÃ£o autenticado");
  }
  return user;
}

export async function requireRole(req: ApiRequest, roles: string[]): Promise<UnifiedUser> {
  const user = await requireSessionUser(req);
  const profile = await getDocument("profiles", user.uid);
  const role = typeof profile?.role === "string" ? profile.role : null;

  if (!role || !roles.includes(role)) {
    throw new ApiError(403, "permission-denied", "VocÃª nÃ£o tem permissÃ£o para executar esta aÃ§Ã£o");
  }

  return user;
}

export async function signInWithEmailPassword(
  req: ApiRequest,
  res: ApiResponse,
  email: string,
  password: string
): Promise<UnifiedUser> {
  const normalizedEmail = normalizeEmail(email);
  const user = await getAuthUserByEmail(normalizedEmail);

  if (!user) {
    throw new ApiError(401, "user-not-found", "Conta nÃ£o encontrada");
  }

  if (!verifyPassword(password, user.password_hash)) {
    throw new ApiError(401, "wrong-password", "Senha incorreta");
  }

  await createSession(req, res, user.uid);
  return toUnifiedUser(user);
}

export async function createPasswordUser(
  email: string,
  password: string,
  options?: { displayName?: string | null; provider?: "password" | "google"; googleSub?: string | null }
): Promise<UnifiedUser> {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail)) {
    throw new ApiError(400, "invalid-email", "Email invÃ¡lido");
  }

  const existing = await getAuthUserByEmail(normalizedEmail);
  if (existing && !options?.googleSub) {
    throw new ApiError(409, "email-already-in-use", "Email jÃ¡ cadastrado");
  }

  const saved = await upsertAuthUser({
    uid: existing?.uid,
    email: normalizedEmail,
    passwordHash: password ? hashPassword(password) : existing?.password_hash,
    displayName: options?.displayName ?? existing?.display_name ?? null,
    provider: options?.provider ?? "password",
    googleSub: options?.googleSub ?? existing?.google_sub ?? null,
  });

  return toUnifiedUser(saved);
}

export async function ensureMasterAccount(code: string, password: string): Promise<{ email: string }> {
  const expectedCode = maybeEnv("MASTER_CODE")?.trim().toUpperCase();
  const expectedPassword = maybeEnv("MASTER_PASSWORD")?.trim();

  if (!expectedCode || !expectedPassword) {
    throw new ApiError(500, "failed-precondition", "MASTER_CODE e MASTER_PASSWORD nÃ£o configurados");
  }

  if (code.trim().toUpperCase() !== expectedCode || password.trim() !== expectedPassword) {
    throw new ApiError(403, "permission-denied", "CÃ³digo ou senha incorretos");
  }

  const masterEmail = "master@cdmf.app";
  const user = await createPasswordUser(masterEmail, expectedPassword, {
    displayName: "Administrador",
  }).catch(async (error) => {
    if (!(error instanceof ApiError) || error.code !== "email-already-in-use") {
      throw error;
    }

    const existing = await getAuthUserByEmail(masterEmail);
    if (!existing) {
      throw error;
    }

    await upsertAuthUser({
      uid: existing.uid,
      email: masterEmail,
      passwordHash: hashPassword(expectedPassword),
      displayName: "Administrador",
      provider: "password",
    });

    return toUnifiedUser((await getAuthUserById(existing.uid)) as AuthUserRow);
  });

  await setDocument(
    "profiles",
    user.uid,
    {
      uid: user.uid,
      role: "master",
      name: "Administrador",
      email: masterEmail,
      createdAt: Date.now(),
      active: true,
    },
    { merge: true }
  );

  return { email: masterEmail };
}

export async function resolveTeacherEmailByCode(code: string): Promise<string | null> {
  const teachers = await listDocuments("profiles", [
    { type: "where", field: "teacherCode", op: "==", value: code.trim().toUpperCase() },
    { type: "where", field: "role", op: "==", value: "teacher" },
    { type: "where", field: "active", op: "==", value: true },
    { type: "limit", value: 1 },
  ]);

  const teacher = teachers[0]?.data;
  const email = typeof teacher?.email === "string" ? teacher.email : null;
  return email;
}

function getGoogleClientId(): string {
  const value = maybeEnv("GOOGLE_OAUTH_CLIENT_ID", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID");
  if (!value) {
    throw new ApiError(500, "failed-precondition", "GOOGLE_OAUTH_CLIENT_ID nÃ£o configurado");
  }
  return value;
}

function getGoogleClientSecret(): string {
  const value = maybeEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!value) {
    throw new ApiError(500, "failed-precondition", "GOOGLE_OAUTH_CLIENT_SECRET nÃ£o configurado");
  }
  return value;
}

function getGoogleIdTokenClient(): OAuth2Client {
  if (!googleIdTokenClient) {
    googleIdTokenClient = new OAuth2Client();
  }

  return googleIdTokenClient;
}

function getRequestOrigin(req: ApiRequest): string {
  const originHeader = getHeader(req, "origin");
  if (originHeader) {
    return originHeader;
  }

  const host = getHeader(req, "host");
  const proto = getHeader(req, "x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (!host) {
    throw new ApiError(400, "invalid-origin", "Origem da requisiÃ§Ã£o nÃ£o encontrada");
  }
  return `${proto}://${host}`;
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  id_token?: string;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new ApiError(
      401,
      "google-exchange-failed",
      payload.error_description || payload.error || "Falha ao validar login com Google"
    );
  }

  return {
    access_token: payload.access_token,
    id_token: payload.id_token,
  };
}

async function getGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    error?: string;
  };

  if (!response.ok || !payload.sub || !payload.email) {
    throw new ApiError(401, "google-userinfo-failed", payload.error || "Falha ao obter usuÃ¡rio do Google");
  }

  return {
    sub: payload.sub,
    email: normalizeEmail(payload.email),
    name: payload.name,
    picture: payload.picture,
  };
}

async function upsertGoogleProfile(user: UnifiedUser, userInfo: { email: string; name?: string; picture?: string }): Promise<void> {
  const existingProfile = (await getDocument("profiles", user.uid)) || ({} as JsonObject);
  const inferredName =
    typeof existingProfile.name === "string" && existingProfile.name.trim()
      ? existingProfile.name
      : userInfo.name || user.displayName || "";
  const inferredRole = typeof existingProfile.role === "string" ? existingProfile.role : "student";

  await setDocument(
    "profiles",
    user.uid,
    {
      uid: user.uid,
      role: inferredRole,
      name: inferredName,
      email: userInfo.email,
      createdAt: typeof existingProfile.createdAt === "number" ? existingProfile.createdAt : Date.now(),
      active: typeof existingProfile.active === "boolean" ? existingProfile.active : true,
      photoURL: userInfo.picture || user.photoURL || undefined,
    },
    { merge: true }
  );
}

async function finalizeGoogleSignIn(
  req: ApiRequest,
  res: ApiResponse,
  googleUser: {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  }
): Promise<UnifiedUser> {
  const existingByEmail = await getAuthUserByEmail(googleUser.email);
  const saved = await upsertAuthUser({
    uid: existingByEmail?.uid,
    email: googleUser.email,
    passwordHash: existingByEmail?.password_hash ?? null,
    displayName: googleUser.name ?? existingByEmail?.display_name ?? null,
    photoURL: googleUser.picture ?? existingByEmail?.photo_url ?? null,
    phoneNumber: existingByEmail?.phone_number ?? null,
    provider: "google",
    googleSub: googleUser.sub,
  });

  const unifiedUser = toUnifiedUser(saved);
  await upsertGoogleProfile(unifiedUser, googleUser);
  await createSession(req, res, saved.uid);
  return unifiedUser;
}

async function verifyGoogleCredential(credential: string): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  const ticket = await getGoogleIdTokenClient().verifyIdToken({
    idToken: credential,
    audience: getGoogleClientId(),
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new ApiError(401, "google-credential-invalid", "Credencial Google invÃ¡lida");
  }

  return {
    sub: payload.sub,
    email: normalizeEmail(payload.email),
    name: payload.name,
    picture: payload.picture,
  };
}

export async function signInWithGoogleCode(
  req: ApiRequest,
  res: ApiResponse,
  code: string
): Promise<UnifiedUser> {
  const requestedWith = getHeader(req, "x-requested-with");
  if (requestedWith !== "XmlHttpRequest") {
    throw new ApiError(400, "invalid-request", "CabeÃ§alho X-Requested-With ausente");
  }

  const origin = getRequestOrigin(req);
  const tokens = await exchangeGoogleCode(code, origin);
  const googleUser = await getGoogleUserInfo(tokens.access_token);
  return finalizeGoogleSignIn(req, res, googleUser);
}

export async function signInWithGoogleCredential(
  req: ApiRequest,
  res: ApiResponse,
  credential: string
): Promise<UnifiedUser> {
  const requestedWith = getHeader(req, "x-requested-with");
  if (requestedWith !== "XmlHttpRequest") {
    throw new ApiError(400, "invalid-request", "Cabecalho X-Requested-With ausente");
  }

  const googleUser = await verifyGoogleCredential(credential);
  return finalizeGoogleSignIn(req, res, googleUser);
}

export function mapAuthErrorCode(code: string): string {
  switch (code) {
    case "wrong-password":
      return "auth/wrong-password";
    case "user-not-found":
      return "auth/user-not-found";
    case "email-already-in-use":
      return "auth/email-already-in-use";
    case "invalid-email":
      return "auth/invalid-email";
    default:
      return `auth/${code}`;
  }
}

