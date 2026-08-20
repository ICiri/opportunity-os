import {beforeEach, describe, expect, it} from 'vitest';
import {consumeSearchRunToken, resetSearchRunRateLimit} from '../src/lib/hunter/rate-limit';

describe('Search Run rate limiter', () => {
  beforeEach(resetSearchRunRateLimit);

  it('allows the configured burst and returns a retry window after it', () => {
    for (let index = 0; index < 3; index += 1) expect(consumeSearchRunToken(1_000, 3, 10_000).allowed).toBe(true);
    expect(consumeSearchRunToken(1_000, 3, 10_000)).toEqual({allowed: false, retryAfterSeconds: 10});
  });

  it('recovers when the rolling window expires', () => {
    expect(consumeSearchRunToken(1_000, 1, 10_000).allowed).toBe(true);
    expect(consumeSearchRunToken(11_001, 1, 10_000).allowed).toBe(true);
  });
});
