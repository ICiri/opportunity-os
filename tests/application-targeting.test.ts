import {describe, expect, it} from 'vitest';
import {APPLICATION_BATCH_LIMIT, applicationKey, assessFractionalTarget} from '../src/lib/applications/targeting';

const job = (description: string) => ({title: 'Backend Engineer', location: 'Remote — US', description});

describe('fractional application targeting', () => {
  it('accepts explicit remote contract work', () => {
    expect(assessFractionalTarget(job('Remote B2B contract, 10-20 hours per week, flexible US hours.'))).toMatchObject({
      eligible: true,
      track: 'ADDITIONAL_FREELANCE',
      weeklyHours: 20,
      schedule: 'AFTER_16_COMPATIBLE',
    });
  });

  it('does not require hours when a remote freelance or contract engagement is explicit', () => {
    expect(assessFractionalTarget(job('Remote freelance engagement.'))).toMatchObject({
      eligible: true,
      track: 'ADDITIONAL_FREELANCE',
      weeklyHours: null,
    });
    expect(assessFractionalTarget(job('Remote B2B contract, 30 hours per week.'))).toMatchObject({
      eligible: true,
      track: 'ADDITIONAL_FREELANCE',
      reasons: ['WEEKLY_HOURS_TO_NEGOTIATE'],
    });
  });

  it('puts remote full-time roles in a separate eligible track', () => {
    expect(assessFractionalTarget(job('Remote full-time backend role.'))).toMatchObject({
      eligible: true,
      track: 'FULL_TIME',
    });
  });

  it('uses a stable company and posting application key and a fixed batch cap', () => {
    expect(applicationKey({company: 'Example Co', canonicalKey: 'role-1'})).toBe('example co::role-1');
    expect(APPLICATION_BATCH_LIMIT).toBe(20);
  });
});
