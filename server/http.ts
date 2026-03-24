import { randomUUID } from "crypto";
import { ApiError, toApiError } from "./errors";

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string | undefined };
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (value: unknown) => void;
  send: (value: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAge?: number;
};

export async function readJsonBody<T>(req: ApiRequest): Promise<T> {
  return (req.body ?? {}) as T;
}

export function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  res.status(status).json(payload);
}

export function sendOk(res: ApiResponse, data: unknown): void {
  sendJson(res, 200, { ok: true, data });
}

export function sendError(res: ApiResponse, error: unknown): void {
  const apiError = toApiError(error);
  sendJson(res, apiError.status, {
    ok: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      details: apiError.details,
    },
  });
}

export function assertMethod(req: ApiRequest, ...allowed: string[]): void {
  const method = (req.method || "GET").toUpperCase();
  if (!allowed.includes(method)) {
    throw new ApiError(405, "method-not-allowed", `Método ${method} não suportado`);
  }
}

export function getHeader(req: ApiRequest, name: string): string | undefined {
  const direct = req.headers[name];
  if (Array.isArray(direct)) {
    return direct[0];
  }
  if (typeof direct === "string") {
    return direct;
  }

  const lowered = req.headers[name.toLowerCase()];
  if (Array.isArray(lowered)) {
    return lowered[0];
  }
  if (typeof lowered === "string") {
    return lowered;
  }

  return undefined;
}

export function parseCookies(req: ApiRequest): Record<string, string> {
  const cookieHeader = getHeader(req, "cookie");
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, chunk) => {
    const [rawKey, ...rest] = chunk.split("=");
    const key = rawKey?.trim();
    if (!key) {
      return acc;
    }
    acc[key] = decodeURIComponent(rest.join("=").trim());
    return acc;
  }, {});
}

function formatCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (options.secure !== false) {
    parts.push("Secure");
  }
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  return parts.join("; ");
}

export function setCookie(
  req: ApiRequest,
  res: ApiResponse,
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  const secure = isSecureRequest(req);
  const cookie = formatCookie(name, value, {
    httpOnly: options.httpOnly,
    secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });
  res.setHeader("Set-Cookie", cookie);
}

export function clearCookie(req: ApiRequest, res: ApiResponse, name: string): void {
  setCookie(req, res, name, "", { maxAge: 0 });
}

export function getRequestIp(req: ApiRequest): string {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function isSecureRequest(req: ApiRequest): boolean {
  const forwardedProto = getHeader(req, "x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.includes("https");
  }
  const host = getHeader(req, "host") || "";
  return !host.includes("localhost");
}

export function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new ApiError(500, "failed-precondition", `Variável ${name} não configurada`);
  }
  return value;
}

export function maybeEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function sanitizeString(value: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid-argument", "Entrada inválida");
  }
  const trimmed = value.trim().replace(/[<>]/g, "");
  if (trimmed.length === 0) {
    throw new ApiError(400, "invalid-argument", "Texto obrigatório");
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid-argument", `Texto muito longo. Máximo: ${maxLength} caracteres.`);
  }
  return trimmed;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
