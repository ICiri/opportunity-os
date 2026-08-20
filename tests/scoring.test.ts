import {describe, it, expect} from 'vitest';
import {expectedValue, expectedValuePerHour} from '../src/lib/scoring/economic';
describe('economic scoring', () => {
  it('calculates EV', () => expect(expectedValue(12000, 18)).toBe(2160));
  it('calculates EV/h', () => expect(expectedValuePerHour(12000, 18, 6)).toBe(360));
});
