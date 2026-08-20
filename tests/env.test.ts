import {describe, expect, it} from 'vitest';
import {parseServerEnv} from '../src/server/env-schema';

describe('server environment contract', () => {
  it('accepts an empty local environment because integrations fail closed independently', () => {
    expect(parseServerEnv({})).toEqual({});
  });

  it('rejects malformed security-sensitive configuration', () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: 'not-a-url',
        HUNTER_CRON_SECRET: 'short',
        OPPORTUNITY_LOCAL_USER_ID: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('coerces bounded numeric provider settings', () => {
    expect(parseServerEnv({OPENAI_TIMEOUT_MS: '30000', OPENAI_MAX_RETRIES: '0'})).toMatchObject({
      OPENAI_TIMEOUT_MS: 30000,
      OPENAI_MAX_RETRIES: 0,
    });
  });
});
