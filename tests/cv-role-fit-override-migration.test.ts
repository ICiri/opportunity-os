import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

describe('CV role-fit override persistence', () => {
  const migration = readFileSync('supabase/migrations/20260820185053_cv_agent_v2_role_fit_overrides.sql', 'utf8');
  it('is append-only, ownership-scoped and bound to an analysis hash', () => {
    expect(migration).toContain('analysis_hash text not null');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('auth.uid())=user_id');
    expect(migration).toContain('before update or delete');
    expect(migration).toContain('CV_ROLE_FIT_OVERRIDE_IMMUTABLE');
  });
});
