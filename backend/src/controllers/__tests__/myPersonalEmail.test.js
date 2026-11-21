import { beforeEach, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({ findById: vi.fn(), findByEmail: vi.fn(), update: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: model }));
vi.mock('../../services/googleWorkspaceDirectory.service.js', () => ({ default: {} }));
vi.mock('../../services/qaSeededEmail.service.js', () => ({ seededQaEmailAccount: vi.fn() }));

import { updateMyPersonalEmail } from '../myPersonalEmail.controller.js';

const actor = { id: 44, role: 'provider' };
const response = () => ({ status: vi.fn().mockReturnThis(), set: vi.fn(), json: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  model.findById.mockResolvedValue({ ...actor, work_email: 'provider@itsco.health', email: 'provider@itsco.health', personal_email: 'old@example.test' });
  model.findByEmail.mockResolvedValue(null);
});

it('updates the signed-in staff contact field without changing work or login addresses', async () => {
  const res = response();
  const next = vi.fn();
  await updateMyPersonalEmail({ user: actor, body: { personalEmail: ' New@Example.test ', id: 99, workEmail: 'different@example.test' } }, res, next);
  expect(model.update).toHaveBeenCalledWith(44, { personalEmail: 'new@example.test' });
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  expect(res.json).toHaveBeenCalledWith({ personalEmail: 'new@example.test' });
  expect(next).not.toHaveBeenCalled();
});

it('rejects a switched session and a contact address occupied by another account', async () => {
  const switched = response();
  await updateMyPersonalEmail({ user: { ...actor, switchedFromUserId: 4 }, body: { personalEmail: 'new@example.test' } }, switched, vi.fn());
  expect(switched.status).toHaveBeenCalledWith(403);
  expect(model.findById).not.toHaveBeenCalled();

  model.findByEmail.mockResolvedValueOnce({ id: 45 });
  const duplicate = response();
  await updateMyPersonalEmail({ user: actor, body: { personalEmail: 'new@example.test' } }, duplicate, vi.fn());
  expect(duplicate.status).toHaveBeenCalledWith(409);
  expect(model.update).not.toHaveBeenCalled();
});
