import { expect, it, vi } from 'vitest';
import { apiLimiter, clinicalWorkspaceLimiter } from '../rateLimiter.middleware.js';

async function request(limiter, userId) {
  const req = { user: { id: userId }, ip: '192.0.2.25', headers: {}, app: { get: () => false } };
  const res = { setHeader: vi.fn(), status: vi.fn(), send: vi.fn() };
  const next = vi.fn();
  await limiter(req, res, next);
  return { res, next };
}

it('isolates note traffic from other activity and from other staff at the same address', async () => {
  for (let count = 0; count < 100; count++) await request(apiLimiter, 11);
  expect((await request(apiLimiter, 12)).res.status).toHaveBeenCalledWith(429);

  for (let count = 0; count < 300; count++) {
    expect((await request(clinicalWorkspaceLimiter, 11)).next).toHaveBeenCalledWith();
  }
  expect((await request(clinicalWorkspaceLimiter, 11)).res.status).toHaveBeenCalledWith(429);
  expect((await request(clinicalWorkspaceLimiter, 12)).next).toHaveBeenCalledWith();
});
