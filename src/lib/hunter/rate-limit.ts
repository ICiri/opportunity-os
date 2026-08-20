type RateLimitState = typeof globalThis & {__opportunitySearchRequests?: number[]};
const state = globalThis as RateLimitState;

export function consumeSearchRunToken(now = Date.now(), limit = 20, windowMs = 10_000) {
  const recent = (state.__opportunitySearchRequests ?? []).filter((timestamp) => timestamp > now - windowMs);
  if (recent.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    state.__opportunitySearchRequests = recent;
    return {allowed: false as const, retryAfterSeconds};
  }
  recent.push(now);
  state.__opportunitySearchRequests = recent;
  return {allowed: true as const, retryAfterSeconds: 0};
}

export function resetSearchRunRateLimit() {
  state.__opportunitySearchRequests = [];
}
