import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  pending: vi.fn(),
  dismiss: vi.fn()
}));

vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: mocks.access }));
vi.mock('../../services/clientAlerts.service.js', () => ({
  saveClientAlert: mocks.save,
  listClientAlerts: mocks.list,
  listPendingClientAlerts: mocks.pending,
  dismissClientAlert: mocks.dismiss
}));

import { createClientAlertHandler } from '../clientAlerts.controller.js';

const response = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ ok: true, client: { id: 4 } });
  mocks.save.mockResolvedValue({ id: 3, body: 'no contact info' });
});

it('does not give school staff the client alert composer API', async () => {
  const res = response();
  await createClientAlertHandler({
    user: { id: 12, role: 'school_staff' },
    params: { id: '4' },
    body: { body: 'school staff should not write this' }
  }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
});

it('lets someone who can open the messages window save a client alert', async () => {
  const res = response();
  await createClientAlertHandler({
    user: { id: 9, role: 'provider' },
    params: { id: '4' },
    body: { body: 'please inquire with the referral contact' }
  }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mocks.save).toHaveBeenCalledWith(null, {
    clientId: 4,
    body: 'please inquire with the referral contact',
    createdByUserId: 9
  });
});
