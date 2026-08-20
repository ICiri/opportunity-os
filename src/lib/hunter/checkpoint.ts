export type Checkpoint = {lastSuccessAt: string; lastExternalId?: string; cursor?: string};
export function overlapSince(cp: Checkpoint, minutes = 10) {
  return new Date(new Date(cp.lastSuccessAt).getTime() - minutes * 60_000).toISOString();
}
export function canAdvanceCheckpoint(persisted: boolean, audited: boolean) {
  return persisted && audited;
}
