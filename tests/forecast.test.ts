import {describe, it, expect} from 'vitest';
import {forecastAll, forecastPoint, requiredAccountsForRevenue, scenarios} from '../src/lib/planning/forecast';
describe('capacity-aware revenue forecast', () => {
  it('provides every required horizon', () =>
    expect(forecastAll(scenarios.base).map((p) => p.days)).toEqual([5, 15, 30, 90, 180, 365, 1095]));
  it('caps recognized revenue at physical delivery capacity', () => {
    const point = forecastPoint({...scenarios.growth, weeklyNewAccounts: 1000}, 365);
    const ceiling = scenarios.growth.deliveryCapacityHoursWeek * (365 / 7) * scenarios.growth.hourlyRate;
    expect(point.expectedRecognizedRevenue).toBeLessThanOrEqual(Math.ceil(ceiling));
    expect(point.capacityUtilization).toBe(100);
  });
  it('makes funnel assumptions explicit and reversible', () => {
    const input = scenarios.base;
    const accounts = requiredAccountsForRevenue(30_000, input);
    const value = input.hourlyRate * input.hoursPerClientWeek * input.engagementWeeks;
    expect(accounts * input.qualificationRate * input.proposalRate * input.winRate * value).toBeGreaterThanOrEqual(
      30_000,
    );
  });
  it('never produces negative outputs from invalid rates', () => {
    const point = forecastPoint({...scenarios.base, winRate: -1}, 30);
    expect(point.expectedNewClients).toBe(0);
    expect(point.expectedPipelineValue).toBe(0);
  });
});
