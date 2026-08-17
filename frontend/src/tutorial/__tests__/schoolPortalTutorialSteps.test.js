import { describe, expect, it } from 'vitest';
import {
  findGuidedStepIndexForTip,
  schoolPortalGuidedSteps
} from '../schoolPortalTutorialSteps.js';

describe('schoolPortalGuidedSteps', () => {
  it('covers the condensed first-login beats', () => {
    const ids = schoolPortalGuidedSteps.map((step) => step.id);
    expect(ids).toEqual([
      'welcome',
      'nav-digital-forms',
      'nav-printable-forms',
      'nav-upload-packet',
      'nav-roster',
      'nav-waitlist',
      'nav-staff',
      'nav-providers',
      'nav-days',
      'nav-days-soft-schedule',
      'complete'
    ]);
  });

  it('mentions being seen after the first session', () => {
    const roster = schoolPortalGuidedSteps.find((step) => step.id === 'nav-roster');
    const soft = schoolPortalGuidedSteps.find((step) => step.id === 'nav-days-soft-schedule');
    expect(roster.popover.description).toMatch(/Being Seen/i);
    expect(soft.popover.description).toMatch(/Being Seen/i);
  });

  it('maps waitlist hover to the waitlist step', () => {
    const idx = findGuidedStepIndexForTip('school-roster-waitlist');
    expect(schoolPortalGuidedSteps[idx].id).toBe('nav-waitlist');
  });
});
