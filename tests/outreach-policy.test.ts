import {describe, expect, it} from 'vitest';
import {applicationMessagePreview, OUTREACH_PRINCIPLES} from '../src/lib/applications/outreach-policy';

describe('application outreach policy', () => {
  it('uses the declared ethical book framework', () => {
    expect(OUTREACH_PRINCIPLES.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'VOSS_CALIBRATED_QUESTION',
        'CIALDINI_AUTHORITY_TRUE',
        'GETTING_TO_YES_INTERESTS',
        'MOM_TEST_BEHAVIOR_EVIDENCE',
        'TRUSTED_ADVISOR_CLIENT_FIRST',
      ]),
    );
  });

  it('keeps the first-contact preview flexible, concrete and low pressure', () => {
    const message = applicationMessagePreview('Example', 'API Engineer');
    expect(message).toContain('alongside my existing commitments');
    expect(message).toContain('How flexible is the engagement structure');
    expect(message).not.toMatch(/guarantee|best candidate|urgent|limited time/i);
  });

  it('uses a separate full-time conversation', () => {
    const message = applicationMessagePreview('Example', 'API Engineer', 'FULL_TIME');
    expect(message).toContain('remote full-time opportunity');
    expect(message).not.toContain('existing commitments');
  });
});
