export function expectedValue(potential: number, probabilityPct: number) {
  return potential * (probabilityPct / 100);
}
export function expectedValuePerHour(potential: number, probabilityPct: number, hours: number) {
  return hours <= 0 ? 0 : expectedValue(potential, probabilityPct) / hours;
}
