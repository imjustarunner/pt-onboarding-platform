import { beforeEach, describe, expect, it } from 'vitest';
import { claimLoginBriefing } from '../loginBriefingGate';

beforeEach(() => sessionStorage.clear());
describe('login briefing consumption', () => {
  it('consumes a login once across component instances and trigger changes', () => {
    sessionStorage.setItem('justLoggedInAt', '1000');
    expect(claimLoginBriefing(7, 1)).toBe(true);
    expect(claimLoginBriefing(7, 2)).toBe(false);
    sessionStorage.setItem('justLoggedInAt', '2000');
    expect(claimLoginBriefing(7, 3)).toBe(true);
  });
  it('does not turn an ordinary authenticated page load into a fresh login', () => {
    expect(claimLoginBriefing(7, 0)).toBe(false);
    sessionStorage.setItem('justLoggedIn', 'true');
    sessionStorage.setItem('justLoggedInAt', '1000');
    expect(claimLoginBriefing(7, 0)).toBe(true);
    expect(claimLoginBriefing(7, 0)).toBe(false);
  });
});
