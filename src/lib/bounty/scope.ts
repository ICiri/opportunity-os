export type AuthorizedScope = 'YES' | 'NO' | 'UNKNOWN';
export function assertAuthorizedScope(scope: AuthorizedScope) {
  if (scope !== 'YES') throw new Error(`BOUNTY_RESEARCH_BLOCKED:${scope}`);
  return true;
}
