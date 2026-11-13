import { createSchedulingWorkerGate } from './schedulingWorkerGate.js';

// The API can run locally against a shared database for explicit requests. It
// must never silently become a second dispatcher for that database's jobs.
export function shouldStartServerBackgroundJobs(env = process.env) {
  return env.NODE_ENV === 'production'
    && ['K_SERVICE', 'K_REVISION', 'APP_BUILD_ID'].every(key => String(env[key] || '').trim());
}

export function createServerBackgroundTickGuard({ env = process.env,
  canRunCurrentRevision = createSchedulingWorkerGate({ env, requireRevisionMatch: true }) } = {}) {
  return async () => shouldStartServerBackgroundJobs(env) && await canRunCurrentRevision();
}

export const canRunServerBackgroundTick = createServerBackgroundTickGuard();
