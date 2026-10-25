import { describe, it, expect } from 'vitest';
import { learningTipsEligible, learningWindowOpen } from '../dashboardLearningTips.js';
describe('dashboard learning eligibility', () => {
  it.each(['provider','provider_plus','staff','intern','supervisor','tutor'])('offers tips to %s', role => expect(learningTipsEligible({id:1,role})).toBe(true));
  it.each(['client','client_guardian','school_staff','super_admin','kiosk'])('does not show employee bubbles to %s', role => expect(learningTipsEligible({id:1,role})).toBe(false));
  it('stops automatic tips after sixty days while leaving hover eligibility intact', () => {
    const start = Date.parse('2026-01-01T00:00:00Z'), user = {id:1,role:'provider',created_at:'2026-01-01T00:00:00Z'};
    expect(learningWindowOpen(user,start,start+59*86400000)).toBe(true);
    expect(learningWindowOpen(user,start,start+60*86400000)).toBe(false);
    expect(learningTipsEligible(user)).toBe(true);
  });
});
