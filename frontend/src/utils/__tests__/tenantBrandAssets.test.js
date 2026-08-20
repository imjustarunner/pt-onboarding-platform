import { describe, expect, it } from 'vitest';
import {
  currentBrandSeason,
  pathToSharePageKey,
  pickRotatedUrl,
  pickTenantBackgroundUrl,
  pickTenantWelcomeUrl,
  tenantSmsImage
} from '../tenantBrandAssets.js';

describe('tenantBrandAssets', () => {
  it('maps SMS pages per tenant', () => {
    expect(tenantSmsImage('itsco', 'support')).toContain('/SMSAssets/ITSCO/ITSCOSupport.png');
    expect(tenantSmsImage('itsco', 'district_schedule')).toContain('/SMSAssets/ITSCO/District11.png');
    expect(tenantSmsImage('itsco', 'counseling')).toContain('/SMSAssets/ITSCO/ITSCOJoinUs.png');
    expect(tenantSmsImage('nlu', 'counseling')).toContain('/SMSAssets/NLU/NLUCounseling.png');
    expect(tenantSmsImage('nlu', 'tutoring')).toContain('/SMSAssets/NLU/NLUTutoring.png');
    expect(tenantSmsImage('nlu', 'tutors')).toContain('/SMSAssets/NLU/NLUTutors.png');
    expect(tenantSmsImage('nlu', 'portal')).toContain('/SMSAssets/NLU/NLUPortal.png');
    expect(tenantSmsImage('nlu', 'providers')).toContain('/SMSAssets/NLU/NLUProviders.png');
    expect(tenantSmsImage('nlu', 'join')).toContain('/SMSAssets/NLU/NLUPortal.png');
    expect(tenantSmsImage('nlu', 'therapy_plus_tutoring')).toContain('/SMSAssets/NLU/NLUTherapyPlusTutoring.png');
    expect(tenantSmsImage('innerstrength', 'coaching')).toContain('/SMSAssets/InnerStrength/11_Coaching.png');
    expect(tenantSmsImage('risereviveco', 'join')).toContain('JoinUsRiseRevive.png');
  });

  it('uses fall and winter windows in America/Denver', () => {
    expect(currentBrandSeason(new Date('2026-09-01T12:00:00-06:00'))).toBe('fall');
    expect(currentBrandSeason(new Date('2026-11-30T12:00:00-07:00'))).toBe('fall');
    expect(currentBrandSeason(new Date('2026-12-01T12:00:00-07:00'))).toBe('winter');
    expect(currentBrandSeason(new Date('2027-02-28T12:00:00-07:00'))).toBe('winter');
    expect(currentBrandSeason(new Date('2026-08-16T12:00:00-06:00'))).toBe('default');
  });

  it('rotates through a pool', () => {
    const urls = ['a', 'b', 'c'];
    expect(pickRotatedUrl(urls, new Date(0))).toBe('a');
    expect(pickRotatedUrl(urls, new Date(86400000))).toBe('b');
  });

  it('shares NLU and Inner Strength welcome/backgrounds', () => {
    const date = new Date('2026-08-16T18:00:00Z');
    expect(pickTenantWelcomeUrl('nlu', date)).toBe(pickTenantWelcomeUrl('innerstrength', date));
    expect(pickTenantBackgroundUrl('nlu', date)).toBe(pickTenantBackgroundUrl('theinnerstrengthinstitute', date));
    expect(pickTenantWelcomeUrl('itsco', date)).toMatch(/WelcomeImages\/ITSCO/);
    expect(pickTenantWelcomeUrl('nlu', new Date('2026-10-15T18:00:00Z'))).toMatch(/WelcomeFall|PMfall/);
    expect(pickTenantWelcomeUrl('nlu', new Date('2027-01-10T18:00:00Z'))).toMatch(/WelcomeWinter/);
  });

  it('maps public paths to SMS page keys', () => {
    expect(pathToSharePageKey('/itsco/support')).toBe('support');
    expect(pathToSharePageKey('/join/itsco/counseling')).toBe('counseling');
    expect(pathToSharePageKey('/join/nlu/tutoring')).toBe('tutoring');
    expect(pathToSharePageKey('/join/innerstrength/coaching')).toBe('coaching');
    expect(pathToSharePageKey('/join/itsco')).toBe('join');
    expect(pathToSharePageKey('/nlu/school-referral')).toBe('school_referral');
    expect(pathToSharePageKey('/itsco/district-schedule/colorado-springs-school-district-11')).toBe('district_schedule');
    expect(pathToSharePageKey('/nlu/tutors')).toBe('tutors');
    expect(pathToSharePageKey('/nlu/find-tutor')).toBe('tutors');
    expect(pathToSharePageKey('/innerstrength/find-coach')).toBe('coaching');
    expect(pathToSharePageKey('/nlu/portal')).toBe('portal');
    expect(pathToSharePageKey('/nlu/therapy-plus-tutoring')).toBe('therapy_plus_tutoring');
  });
});
