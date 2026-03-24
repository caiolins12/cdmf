import { ApiError } from "./errors";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

export function checkRateLimit(identifier: string): void {
  const now = Date.now();
  const current = rateLimitMap.get(identifier);

  if (!current || now > current.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + WINDOW_MS });
    return;
  }

  if (current.count >= MAX_REQUESTS) {
    throw new ApiError(429, "resource-exhausted", "Muitas requisições. Aguarde um momento e tente novamente.");
  }

  current.count += 1;
}
