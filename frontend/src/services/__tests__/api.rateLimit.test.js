import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ request: null, error: null }));
vi.mock('axios', () => ({ default: { create: () => ({
  interceptors: {
    request: { use: handler => { m.request = handler; } },
    response: { use: (_ok, handler) => { m.error = handler; } }
  }
}) } }));
let api;
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T21:00:00Z'));
  localStorage.clear(); sessionStorage.clear();
  api = await import('../api.js');
});
afterEach(() => { vi.useRealTimers(); });
const request = () => m.request({ url: '/users/7/schedule-summary', headers: {}, skipGlobalLoading: true });
async function throttle(headers) {
  const error = { config: { url: '/supervision/sessions/9/activity' }, response: { status: 429, data: 'Rate exceeded.', headers } };
  await expect(m.error(error)).rejects.toBe(error);
  return error;
}
it.each([
  [{ 'retry-after': '90' }, 90000],
  [{ 'Retry-After': 'Tue, 27 Oct 2026 21:02:00 GMT' }, 120000],
  [{ get: () => '75' }, 75000],
  [{}, 5000],
  [{ 'retry-after': 'invalid' }, 5000]
])('honors server cooldowns before allowing a schedule request: %j', async (headers, wait) => {
  const start = Date.now();
  const error = await throttle(headers);
  expect(error.retryAt).toBe(start + wait);
  expect(api.apiRateLimitRetryAt()).toBe(start + wait);
  expect(api.isApiRateLimited()).toBe(true);
  expect(request).toThrow('cooling down');
  vi.advanceTimersByTime(wait - 1);
  expect(request).toThrow('cooling down');
  vi.advanceTimersByTime(1);
  expect(api.isApiRateLimited()).toBe(false);
  expect(request).not.toThrow();
});
it('passes the deadline to blocked calendar reads without extending it on synthetic 429s', async () => {
  await throttle({ 'retry-after': '60' });
  const deadline = api.apiRateLimitRetryAt();
  let blocked;
  try { request(); } catch (e) { blocked = e; }
  expect(blocked.retryAt).toBe(deadline);
  vi.advanceTimersByTime(10000);
  await expect(m.error(blocked)).rejects.toBe(blocked);
  expect(api.apiRateLimitRetryAt()).toBe(deadline);
});
it('never shortens an existing cooldown when another in-flight response has a shorter wait', async () => {
  await throttle({ 'retry-after': '120' });
  const deadline = api.apiRateLimitRetryAt();
  vi.advanceTimersByTime(1000);
  await throttle({ 'retry-after': '5' });
  expect(api.apiRateLimitRetryAt()).toBe(deadline);
});
it('retains the longer fallback for a burst of responses without Retry-After', async () => {
  await throttle({}); await throttle({}); await throttle({});
  expect(api.apiRateLimitRetryAt()).toBe(Date.now() + 20000);
});

it('allows session resume during background cooldown but respects a recovery-specific Retry-After', async () => {
 await throttle({'retry-after':'120'});
 const resume=()=>m.request({method:'post',url:'/auth/session-activity',headers:{},skipGlobalLoading:true});
 expect(request).toThrow('cooling down');expect(resume).not.toThrow();
 const error={config:{method:'post',url:'/auth/session-activity'},response:{status:429,headers:{'retry-after':'30'},data:'Rate exceeded.'}};
 await expect(m.error(error)).rejects.toBe(error);
 expect(resume).toThrow('cooling down');
 vi.advanceTimersByTime(30000);
 expect(resume).not.toThrow();expect(request).toThrow('cooling down');
});

it.each([
  '/supervision/join-info/9',
  '/supervision/sessions/9/video-token',
  '/supervision/join-info/personal-invitation',
  '/supervision/sessions/personal-invitation/video-token'
])('allows supervision entry during background cooldown, honoring its own deadline: %s', async url => {
  await throttle({ 'retry-after': '120' });
  const join = () => m.request({ method: 'get', url, headers: {}, skipGlobalLoading: true });
  expect(join).not.toThrow();
  expect(request).toThrow('cooling down');
  const error = { config: { method: 'get', url }, response: { status: 429, headers: { 'retry-after': '30' }, data: 'Rate exceeded.' } };
  await expect(m.error(error)).rejects.toBe(error);
  expect(join).toThrow('cooling down');
  vi.advanceTimersByTime(30000);
  expect(join).not.toThrow();
  expect(request).toThrow('cooling down');
});

it('keeps application-specific throttling from blocking unrelated requests', async () => {
  const url = '/clinical-note-generator/work-queue';
  for (let i = 0; i < 3; i++) {
    const error = { config: { method: 'get', url }, response: { status: 429, headers: { 'retry-after': '60' }, data: { error: { message: 'Too many requests, please try again later' } } } };
    await expect(m.error(error)).rejects.toBe(error);
  }
  const limited = () => m.request({ method: 'get', url, headers: {}, skipGlobalLoading: true });
  expect(limited).toThrow('cooling down');
  expect(api.isApiRateLimited()).toBe(false);
  expect(request).not.toThrow();
  expect(() => m.request({ url: '/supervision/sessions/9/video-token', headers: {}, skipGlobalLoading: true })).not.toThrow();
  vi.advanceTimersByTime(60000);
  expect(limited).not.toThrow();
});

it('keeps supervision background reads and heartbeats paused during edge overload', async () => {
  await throttle({ 'retry-after': '120' });
  for (const [method, url] of [
    ['get', '/supervision/sessions/9/activity'],
    ['get', '/supervision/sessions/9/admission-status'],
    ['post', '/supervision/sessions/9/join-presence']
  ]) {
    expect(() => m.request({ method, url, headers: {}, skipGlobalLoading: true })).toThrow('cooling down');
  }
});

it('still stops a runaway loop on a supervision entry endpoint', async () => {
  await throttle({ 'retry-after': '120' });
  const join = () => m.request({ url: '/supervision/sessions/9/video-token', headers: {}, skipGlobalLoading: true });
  for (let i = 0; i < 40; i++) expect(join).not.toThrow();
  expect(join).toThrow('Request circuit breaker tripped');
});
