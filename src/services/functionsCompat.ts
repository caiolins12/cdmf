import { ClientApiError, apiPost } from "./apiClient";

export type Functions = {
  kind: "compat-functions";
};

type CallableResult<T> = {
  data: T;
};

const functionsInstance: Functions = {
  kind: "compat-functions",
};

export function getFunctions(_app?: unknown, _region?: string): Functions {
  return functionsInstance;
}

export function httpsCallable<TInput, TOutput>(_functions: Functions, name: string) {
  return async (payload: TInput): Promise<CallableResult<TOutput>> => {
    try {
      const data = await apiPost<TOutput>(`/api/rpc/${encodeURIComponent(name)}`, payload);
      return { data };
    } catch (error) {
      if (error instanceof ClientApiError) {
        const wrapped = new Error(error.message) as Error & { code?: string; details?: unknown };
        wrapped.code = error.code ? `functions/${error.code}` : "functions/internal";
        wrapped.details = error.details;
        throw wrapped;
      }
      throw error;
    }
  };
}
