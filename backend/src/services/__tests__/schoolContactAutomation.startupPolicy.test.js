import { expect, it, vi } from 'vitest';
import { shouldStartServerBackgroundJobs, createServerBackgroundTickGuard } from '../serverBackgroundJobsPolicy.js';
const live = { NODE_ENV: 'production', K_SERVICE: 'onboarding-backend', K_REVISION: 'onboarding-backend-current', APP_BUILD_ID: 'current-build' };
it.each([{}, { NODE_ENV: 'development' }, { NODE_ENV: 'production', DB_HOST: '127.0.0.1', DB_PORT: '3307', DB_NAME: 'shared-production' }])('does not start global jobs in a local API process: %j', async env => {
  const authority = vi.fn().mockResolvedValue(true);
  expect(shouldStartServerBackgroundJobs(env)).toBe(false);
  expect(await createServerBackgroundTickGuard({ env, canRunCurrentRevision: authority })()).toBe(false);
  expect(authority).not.toHaveBeenCalled();
});
it('keeps the managed production startup enabled', () => expect(shouldStartServerBackgroundJobs(live)).toBe(true));
it('keeps test imports passive even with copied runtime metadata', () => expect(shouldStartServerBackgroundJobs({ ...live, NODE_ENV: 'test' })).toBe(false));
it.each(['K_SERVICE', 'K_REVISION', 'APP_BUILD_ID'])('requires actual managed runtime metadata %s', key => expect(shouldStartServerBackgroundJobs({ ...live, [key]: ' ' })).toBe(false));
it('requires current-revision authority on every outreach tick, so a retired process cannot claim new work', async () => {
  const authority = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const guard = createServerBackgroundTickGuard({ env: live, canRunCurrentRevision: authority });
  expect(await guard()).toBe(true);
  expect(await guard()).toBe(false);
  expect(authority).toHaveBeenCalledTimes(2);
});
