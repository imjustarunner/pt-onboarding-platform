import { rateLimitRetryAt } from './rateLimitRetry';

// A slow response must not create a queue of overlapping meeting polls.
// Callers retain the last successful state while the service recovers.
export function createMeetingRefresh() {
  let pending = null;
  let retryAt = 0;
  let failures = 0;
  return {
    run(task) {
      if (pending) return pending;
      if (Date.now() < retryAt) return Promise.resolve();
      const request = Promise.resolve().then(task).then(result => {
        failures = 0;
        retryAt = 0;
        return result;
      }).catch(error => {
        const delay = Math.min(30000, 5000 * 2 ** Math.min(failures++, 3));
        retryAt = Number(error?.response?.status) === 429
          ? rateLimitRetryAt(error, Date.now(), delay) : Date.now() + delay;
        throw error;
      }).finally(() => { if (pending === request) pending = null; });
      pending = request;
      return request;
    },
    async afterChange(task) {
      // Discard the pre-save read before fetching the confirmed new permission.
      try { await pending; } catch { /* The save succeeded; refresh its state. */ }
      retryAt = 0;
      return this.run(task);
    }
  };
}
