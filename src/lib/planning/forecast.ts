export type ForecastInputs = {
  weeklyNewAccounts: number;
  qualificationRate: number;
  proposalRate: number;
  winRate: number;
  hourlyRate: number;
  hoursPerClientWeek: number;
  engagementWeeks: number;
  deliveryCapacityHoursWeek: number;
  existingClients: number;
  monthlyRetentionRate: number;
};
export type ForecastPoint = {
  days: number;
  label: string;
  accountsContacted: number;
  qualified: number;
  proposals: number;
  expectedNewClients: number;
  retainedExistingClients: number;
  expectedRecognizedRevenue: number;
  expectedPipelineValue: number;
  capacityUtilization: number;
};
export const horizons = [
  {days: 5, label: '5 days'},
  {days: 15, label: '15 days'},
  {days: 30, label: '1 month'},
  {days: 90, label: 'Quarter'},
  {days: 180, label: 'Half-year'},
  {days: 365, label: '1 year'},
  {days: 1095, label: '3 years'},
] as const;
const clampRate = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number, digits = 0) => Number(n.toFixed(digits));
export function forecastPoint(input: ForecastInputs, days: number, label = `${days} days`): ForecastPoint {
  const weeks = days / 7,
    months = days / 30.4375;
  const qualification = clampRate(input.qualificationRate),
    proposal = clampRate(input.proposalRate),
    win = clampRate(input.winRate),
    retention = clampRate(input.monthlyRetentionRate);
  const accounts = input.weeklyNewAccounts * weeks,
    qualified = accounts * qualification,
    proposals = qualified * proposal,
    newClients = proposals * win;
  const retainedExisting = input.existingClients * Math.pow(retention, months);
  const newClientActiveWeeks = Math.min(input.engagementWeeks, weeks / 2);
  const existingDemandHours = retainedExisting * input.hoursPerClientWeek * weeks;
  const newDemandHours = newClients * input.hoursPerClientWeek * newClientActiveWeeks;
  const capacityHours = input.deliveryCapacityHoursWeek * weeks;
  const recognizedHours = Math.min(capacityHours, existingDemandHours + newDemandHours);
  const engagementValue = input.hourlyRate * input.hoursPerClientWeek * input.engagementWeeks;
  return {
    days,
    label,
    accountsContacted: round(accounts),
    qualified: round(qualified, 1),
    proposals: round(proposals, 1),
    expectedNewClients: round(newClients, 2),
    retainedExistingClients: round(retainedExisting, 2),
    expectedRecognizedRevenue: round(recognizedHours * input.hourlyRate),
    expectedPipelineValue: round(newClients * engagementValue),
    capacityUtilization: capacityHours
      ? round(Math.min(1, (existingDemandHours + newDemandHours) / capacityHours) * 100)
      : 0,
  };
}
export const forecastAll = (input: ForecastInputs) => horizons.map((h) => forecastPoint(input, h.days, h.label));
export function requiredAccountsForRevenue(targetRevenue: number, input: ForecastInputs) {
  const valuePerWin = input.hourlyRate * input.hoursPerClientWeek * input.engagementWeeks;
  const conversion = clampRate(input.qualificationRate) * clampRate(input.proposalRate) * clampRate(input.winRate);
  return conversion && valuePerWin ? Math.ceil(targetRevenue / (conversion * valuePerWin)) : Infinity;
}
export const scenarios: Record<'conservative' | 'base' | 'growth', ForecastInputs> = {
  conservative: {
    weeklyNewAccounts: 6,
    qualificationRate: 0.25,
    proposalRate: 0.4,
    winRate: 0.18,
    hourlyRate: 55,
    hoursPerClientWeek: 8,
    engagementWeeks: 8,
    deliveryCapacityHoursWeek: 16,
    existingClients: 0,
    monthlyRetentionRate: 0.88,
  },
  base: {
    weeklyNewAccounts: 12,
    qualificationRate: 0.35,
    proposalRate: 0.5,
    winRate: 0.25,
    hourlyRate: 60,
    hoursPerClientWeek: 10,
    engagementWeeks: 12,
    deliveryCapacityHoursWeek: 20,
    existingClients: 0,
    monthlyRetentionRate: 0.93,
  },
  growth: {
    weeklyNewAccounts: 20,
    qualificationRate: 0.4,
    proposalRate: 0.55,
    winRate: 0.3,
    hourlyRate: 70,
    hoursPerClientWeek: 12,
    engagementWeeks: 16,
    deliveryCapacityHoursWeek: 45,
    existingClients: 0,
    monthlyRetentionRate: 0.95,
  },
};
