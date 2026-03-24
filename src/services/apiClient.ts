type ApiErrorPayload = {
  ok: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type ApiOkPayload<T> = {
  ok: true;
  data: T;
};

const REQUEST_TIMEOUT_MS = 12_000;

function normalizeBaseUrl(value?: string): string {
  if (!value) {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

function resolveRequestUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (!apiBaseUrl) {
    return normalizedPath;
  }

  return `${apiBaseUrl}${normalizedPath}`;
}

export class ClientApiError extends Error {
  code?: string;
  details?: unknown;

  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ClientApiError";
    this.code = code;
    this.details = details;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (isJson) {
    const payload = (await response.json()) as ApiOkPayload<T> | ApiErrorPayload;
    if (!response.ok || !payload.ok) {
      const error = payload as ApiErrorPayload;
      throw new ClientApiError(
        error.error?.message || "Falha na requisição",
        error.error?.code,
        error.error?.details
      );
    }
    return (payload as ApiOkPayload<T>).data;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ClientApiError(text || "Falha na requisição");
  }

  return (await response.text()) as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestUrl = resolveRequestUrl(path);
  const headers = new Headers(init.headers || {});
  const requestController = new AbortController();
  let externalAbortHandler: (() => void) | null = null;

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (init.signal) {
    if (init.signal.aborted) {
      requestController.abort();
    } else {
      externalAbortHandler = () => requestController.abort();
      init.signal.addEventListener("abort", externalAbortHandler, { once: true });
    }
  }

  const timeoutHandle = setTimeout(() => {
    requestController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      ...init,
      headers,
      credentials: "include",
      signal: requestController.signal,
    });

    if (!response.ok && response.status === 404 && path.startsWith("/api/")) {
      throw new ClientApiError(
        "API nao encontrada neste dominio. Configure VITE_API_BASE_URL ou use o dominio do backend.",
        "network/api-not-found"
      );
    }

    return parseResponse<T>(response);
  } catch (error) {
    if (error instanceof ClientApiError) {
      throw error;
    }

    if (
      requestController.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new ClientApiError(
        "Tempo limite ao conectar com o servidor.",
        "network/timeout"
      );
    }

    throw new ClientApiError(
      "Nao foi possivel conectar com o servidor.",
      "network/unreachable"
    );
  } finally {
    clearTimeout(timeoutHandle);
    if (init.signal && externalAbortHandler) {
      init.signal.removeEventListener("abort", externalAbortHandler);
    }
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers = new Headers(extraHeaders || {});
  return apiRequest<T>(path, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
