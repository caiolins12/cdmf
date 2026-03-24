import { ClientApiError, apiGet, apiPost } from "./apiClient";
import { initializeApp, type CompatApp } from "./appCompat";
import { getFunctions } from "./functionsCompat";
import { getFirestore } from "./postgresFirestoreCompat";

type GoogleCodeResponse = {
  code?: string;
  error?: string;
  error_description?: string;
};

type GoogleCredentialResponse = {
  credential?: string;
  select_by?: string;
  state?: string;
};

type GoogleCodeClient = {
  requestCode: () => void;
};

type GoogleButtonHandlers = {
  onStart?: () => void;
  onSuccess?: (user: UnifiedUser) => void;
  onError?: (error: unknown) => void;
};

type OneTapNotification = {
  isDisplayMoment(): boolean;
  isDisplayed(): boolean;
  isNotDisplayed(): boolean;
  getNotDisplayedReason(): string;
  isSkippedMoment(): boolean;
  getSkippedReason(): string;
  isDismissedMoment(): boolean;
  getDismissedReason(): string;
  getMomentType(): string;
};

type GoogleIdConfiguration = {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void | Promise<void>;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: "signin" | "signup" | "use";
  itp_support?: boolean;
  ux_mode?: "popup" | "redirect";
  use_fedcm_for_button?: boolean;
  button_auto_select?: boolean;
};

type GoogleButtonConfiguration = {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
  locale?: string;
  state?: string;
  click_listener?: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            callback: (response: GoogleCodeResponse) => void;
            error_callback?: (response: { type: string }) => void;
            select_account?: boolean;
          }) => GoogleCodeClient;
        };
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonConfiguration) => void;
          prompt: (momentListener?: (notification: OneTapNotification) => void) => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

export type UnifiedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  providerData?: Array<{ providerId: string }>;
};

type AuthStateCallback = (user: UnifiedUser | null) => void;

function wrapAuthError(error: unknown): never {
  if (error instanceof ClientApiError) {
    const wrapped = new Error(error.message) as Error & {
      code?: string;
      details?: unknown;
    };
    wrapped.code = error.code || "auth/internal";
    wrapped.details = error.details;
    throw wrapped;
  }

  throw error;
}

function getGoogleClientId(): string {
  const clientId =
    import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ||
    import.meta.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!clientId) {
    throw Object.assign(
      new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID nao configurado"),
      {
        code: "auth/missing-client-id",
      }
    );
  }
  return clientId;
}

let currentUser: UnifiedUser | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let gisScriptPromise: Promise<void> | null = null;
let identityInitPromise: Promise<void> | null = null;
let googleButtonSequence = 0;
const listeners = new Set<AuthStateCallback>();
const googleButtonHandlers = new Map<string, GoogleButtonHandlers>();

// Pending handlers for the signInWithGooglePrompt() (One Tap / FedCM) flow
let pendingOneTabResolve: ((user: UnifiedUser) => void) | null = null;
let pendingOneTabReject: ((error: unknown) => void) | null = null;

function emitAuthState(): void {
  for (const listener of listeners) {
    listener(currentUser);
  }
}

async function hydrateSession(): Promise<void> {
  try {
    const data = await apiGet<{ user: UnifiedUser | null }>("/api/auth/session");
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  initialized = true;
  emitAuthState();
}

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = hydrateSession();
  }
  return initPromise;
}

function setCurrentUser(user: UnifiedUser | null): void {
  currentUser = user;
  initialized = true;
  emitAuthState();
}

function loadGoogleScript(): Promise<void> {
  if (gisScriptPromise) {
    return gisScriptPromise;
  }

  gisScriptPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Google Sign-In disponivel apenas na web"));
      return;
    }

    if (window.google?.accounts?.id && window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-gsi="true"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Falha ao carregar Google Identity Services")),
        {
          once: true,
        }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = "true";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Falha ao carregar Google Identity Services"));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

async function signInWithGoogleCredentialRequest(
  credential: string
): Promise<{ user: UnifiedUser }> {
  const result = await apiPost<{ user: UnifiedUser }>(
    "/api/auth/google-signin",
    { credential },
    { "X-Requested-With": "XmlHttpRequest" }
  );
  setCurrentUser(result.user);
  return { user: result.user };
}

async function ensureGoogleIdentityInitialized(): Promise<void> {
  if (identityInitPromise) {
    return identityInitPromise;
  }

  identityInitPromise = (async () => {
    await loadGoogleScript();

    const googleIdentity = window.google?.accounts?.id;
    if (!googleIdentity) {
      throw Object.assign(new Error("Google Identity Services indisponivel"), {
        code: "auth/google-unavailable",
      });
    }

    googleIdentity.initialize({
      client_id: getGoogleClientId(),
      ux_mode: "popup",
      auto_select: false,
      context: "signin",
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_button: false,
      button_auto_select: false,
      callback: async (response) => {
        const handler =
          typeof response.state === "string"
            ? googleButtonHandlers.get(response.state)
            : undefined;

        // Grab the pending One Tap / FedCM resolver (if any)
        const oneTabResolve = pendingOneTabResolve;
        const oneTabReject = pendingOneTabReject;
        pendingOneTabResolve = null;
        pendingOneTabReject = null;

        if (!response.credential) {
          const error = Object.assign(
            new Error("Credencial Google nao recebida"),
            { code: "auth/google-credential-missing" }
          );
          handler?.onError?.(error);
          oneTabReject?.(error);
          return;
        }

        try {
          const result = await signInWithGoogleCredentialRequest(
            response.credential
          );
          handler?.onSuccess?.(result.user);
          oneTabResolve?.(result.user);
        } catch (error) {
          if (error instanceof ClientApiError) {
            const wrapped = Object.assign(new Error(error.message), {
              code: error.code || "auth/google-signin-failed",
            });
            handler?.onError?.(wrapped);
            oneTabReject?.(wrapped);
            return;
          }
          handler?.onError?.(error);
          oneTabReject?.(error);
        }
      },
    });
  })();

  return identityInitPromise;
}

void ensureInitialized();
// Eagerly preload the GIS script and initialize Google Identity so the
// prompt() / requestCode() calls can happen synchronously on user click.
if (typeof document !== "undefined") {
  void ensureGoogleIdentityInitialized().catch(() => {});
}

export const isWeb = true;
export const app: CompatApp = initializeApp();
export const db = getFirestore(app);
export const functions = getFunctions(app);

export const auth = {
  onAuthStateChanged(callback: AuthStateCallback) {
    listeners.add(callback);
    void ensureInitialized().then(() => callback(currentUser));
    return () => {
      listeners.delete(callback);
    };
  },

  async signInWithEmailAndPassword(email: string, password: string) {
    try {
      const result = await apiPost<{ user: UnifiedUser }>(
        "/api/auth/password-signin",
        { email, password }
      );
      setCurrentUser(result.user);
      return { user: result.user };
    } catch (error) {
      wrapAuthError(error);
    }
  },

  async createUserWithEmailAndPassword(email: string, password: string) {
    try {
      const result = await apiPost<{ user: UnifiedUser }>(
        "/api/auth/create-user",
        { email, password }
      );
      return { user: result.user };
    } catch (error) {
      wrapAuthError(error);
    }
  },

  async signOut() {
    try {
      await apiPost("/api/auth/signout", {});
      window.google?.accounts?.id?.disableAutoSelect?.();
      setCurrentUser(null);
    } catch (error) {
      wrapAuthError(error);
    }
  },

  async renderGoogleSignInButton(
    container: HTMLElement,
    handlers: GoogleButtonHandlers = {}
  ) {
    await ensureInitialized();
    await ensureGoogleIdentityInitialized();

    const googleIdentity = window.google?.accounts?.id;
    if (!googleIdentity) {
      throw Object.assign(new Error("Google Identity Services indisponivel"), {
        code: "auth/google-unavailable",
      });
    }

    const state = `google-button-${++googleButtonSequence}`;
    googleButtonHandlers.set(state, handlers);

    const width = Math.max(
      260,
      Math.min(340, Math.round(container.getBoundingClientRect().width || 340))
    );

    googleIdentity.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      logo_alignment: "center",
      width,
      locale:
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "pt-BR",
      state,
      click_listener: () => handlers.onStart?.(),
    });

    return () => {
      googleButtonHandlers.delete(state);
    };
  },

  // Shows the native Google bottom sheet (Android FedCM) or One Tap overlay (desktop).
  // Rejects with code "auth/one-tap-not-shown" if the prompt cannot be displayed,
  // so the caller can fall back to the oauth2 popup flow.
  async signInWithGooglePrompt(): Promise<{ user: UnifiedUser }> {
    try {
      await ensureGoogleIdentityInitialized();
    } catch {
      throw Object.assign(new Error("one-tap-not-shown"), { code: "auth/one-tap-not-shown" });
    }

    return new Promise<{ user: UnifiedUser }>((resolve, reject) => {
      const googleId = window.google?.accounts?.id;
      if (!googleId) {
        reject(Object.assign(new Error("one-tap-not-shown"), { code: "auth/one-tap-not-shown" }));
        return;
      }

      pendingOneTabResolve = (user) => resolve({ user });
      pendingOneTabReject = reject;

      googleId.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Prompt won't show — clear pending and signal fallback
          if (pendingOneTabReject === reject) {
            pendingOneTabResolve = null;
            pendingOneTabReject = null;
            reject(Object.assign(new Error("one-tap-not-shown"), { code: "auth/one-tap-not-shown" }));
          }
        }
      });
    });
  },

  signInWithGoogle(): Promise<{ user: UnifiedUser }> {
    // IMPORTANT: this method must NOT be async and must NOT await anything
    // before calling client.requestCode(). The Promise constructor runs
    // synchronously, keeping requestCode() within the browser's user-gesture
    // context so the popup is not blocked.
    return new Promise<{ user: UnifiedUser }>((resolve, reject) => {
      const googleOauth = window.google?.accounts?.oauth2;
      if (!googleOauth) {
        reject(
          Object.assign(
            new Error("Google Identity Services indisponivel. Recarregue a pagina."),
            { code: "auth/google-unavailable" }
          )
        );
        return;
      }

      const client = googleOauth.initCodeClient({
        client_id: getGoogleClientId(),
        scope: "openid email profile",
        ux_mode: "popup",
        select_account: true,
        callback: async (response) => {
          if (!response.code) {
            reject(
              Object.assign(
                new Error(
                  response.error_description ||
                    response.error ||
                    "Falha ao autenticar com Google"
                ),
                { code: `auth/${response.error || "google-signin-failed"}` }
              )
            );
            return;
          }

          try {
            const result = await apiPost<{ user: UnifiedUser }>(
              "/api/auth/google-signin",
              { code: response.code },
              { "X-Requested-With": "XmlHttpRequest" }
            );
            setCurrentUser(result.user);
            resolve({ user: result.user });
          } catch (error) {
            if (error instanceof ClientApiError) {
              reject(
                Object.assign(new Error(error.message), {
                  code: error.code || "auth/google-signin-failed",
                })
              );
              return;
            }
            reject(error);
          }
        },
        error_callback: (response) => {
          if (response.type === "popup_closed") {
            reject(
              Object.assign(new Error("Login cancelado pelo usuario"), {
                code: "auth/popup-closed-by-user",
              })
            );
            return;
          }

          if (response.type === "popup_failed_to_open") {
            reject(
              Object.assign(
                new Error("Popup bloqueado. Permita popups para este site."),
                { code: "auth/popup-blocked" }
              )
            );
            return;
          }

          reject(
            Object.assign(new Error("Falha ao abrir autenticacao Google"), {
              code: "auth/google-popup-failed",
            })
          );
        },
      });

      client.requestCode();
    });
  },

  async signInWithCredential() {
    throw Object.assign(
      new Error("signInWithCredential nao e suportado neste build web"),
      {
        code: "auth/unsupported-operation",
      }
    );
  },

  get currentUser(): UnifiedUser | null {
    return currentUser;
  },
};

export const GoogleAuthProvider = null;


