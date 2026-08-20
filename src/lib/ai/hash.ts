import {createHash} from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown) {
  return sha256(JSON.stringify(canonicalize(value)));
}
