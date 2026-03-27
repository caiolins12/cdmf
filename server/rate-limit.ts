import { ApiError } from "./errors";

// ── General rate limit ────────────────────────────────────────────────────────

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

// ── Auth rate limit (brute-force protection) ──────────────────────────────────
//
// Rules per IP:
//   • Up to AUTH_MAX_ATTEMPTS attempts within AUTH_WINDOW_MS (15 min).
//   • On the Nth consecutive failure the IP is locked for a progressively
//     longer duration:
//       failures  5–9  → 15 min lockout
//       failures 10–19 → 1 h  lockout
//       failures  20+  → 24 h lockout
//
// Calling recordAuthSuccess() resets the failure counter for that IP.

type AuthEntry = {
  failures: number;        // total consecutive failures
  windowStart: number;     // start of current 15-min window
  windowCount: number;     // attempts in this window
  lockedUntil: number;     // epoch ms, 0 = not locked
};

const authMap = new Map<string, AuthEntry>();

const AUTH_WINDOW_MS     = 15 * 60_000; //  15 minutes
const AUTH_MAX_ATTEMPTS  = 5;           //  attempts per window before lock
const LOCK_TIER_1_MS     = 15 * 60_000; //  15 min  (failures  5–9)
const LOCK_TIER_2_MS     = 60 * 60_000; //   1 hour (failures 10–19)
const LOCK_TIER_3_MS     = 24 * 3600_000; // 24 h   (failures  20+)

function getLockDuration(totalFailures: number): number {
  if (totalFailures >= 20) return LOCK_TIER_3_MS;
  if (totalFailures >= 10) return LOCK_TIER_2_MS;
  return LOCK_TIER_1_MS;
}

function humanizeLock(ms: number): string {
  if (ms >= 3600_000) return `${Math.round(ms / 3600_000)} hora(s)`;
  return `${Math.round(ms / 60_000)} minuto(s)`;
}

export function checkAuthRateLimit(ip: string): void {
  const now = Date.now();
  let entry = authMap.get(ip);

  if (!entry) {
    entry = { failures: 0, windowStart: now, windowCount: 0, lockedUntil: 0 };
    authMap.set(ip, entry);
  }

  // If currently locked, reject immediately
  if (entry.lockedUntil > now) {
    const remaining = humanizeLock(entry.lockedUntil - now);
    throw new ApiError(
      429,
      "resource-exhausted",
      `Muitas tentativas incorretas. Tente novamente em ${remaining}.`
    );
  }

  // Reset window counter if the window has expired
  if (now - entry.windowStart > AUTH_WINDOW_MS) {
    entry.windowStart = now;
    entry.windowCount = 0;
  }

  entry.windowCount += 1;

  // Too many attempts in this window → lock
  if (entry.windowCount > AUTH_MAX_ATTEMPTS) {
    entry.failures += 1;
    const lockMs = getLockDuration(entry.failures);
    entry.lockedUntil = now + lockMs;
    entry.windowCount = 0; // reset so next window starts clean after unlock
    const wait = humanizeLock(lockMs);
    throw new ApiError(
      429,
      "resource-exhausted",
      `Acesso bloqueado por ${wait} devido a muitas tentativas incorretas.`
    );
  }
}

/** Call after a successful authentication to clear the failure history for an IP. */
export function recordAuthSuccess(ip: string): void {
  authMap.delete(ip);
}

/** Increment the failure counter for an IP (call after a failed login attempt). */
export function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = authMap.get(ip);
  if (!entry) return;
  entry.failures += 1;
  // Apply lock immediately if we've crossed a tier threshold
  if (entry.failures >= AUTH_MAX_ATTEMPTS) {
    const lockMs = getLockDuration(entry.failures);
    entry.lockedUntil = now + lockMs;
    entry.windowCount = 0;
  }
}
