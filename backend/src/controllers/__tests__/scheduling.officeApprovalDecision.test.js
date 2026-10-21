import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  find: vi.fn(),
  context: vi.fn(),
  resolve: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn()
}));
vi.mock('../../services/officeApprovalWorkflow.service.js', () => ({
  listOfficeApprovals: vi.fn(),
  findOfficeApproval: m.find,
  officeApprovalContext: m.context,
  withOfficeDecisionLock: (fn) => fn(),
  resolveOfficeRequestAlerts: m.resolve,
  officeDecisionAgency: vi.fn(async () => 2),
  notifyOfficeDecision: m.notify
}));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/AdminAuditLog.model.js', () => ({
  default: { logAction: m.audit }
}));
import { runOfficeDecision } from '../officeApprovalWorkflow.controller.js';
const request = {
  id: 878,
  source: 'intake',
  key: 'intake:878',
  providerId: 525,
  agencyId: 2,
  roomRequest: true,
  roomId: 5
};
const room = {
  roomId: 6,
  officeId: 1,
  available: true,
  window: { startDate: '2026-10-30', startHour: 17, endHour: 19, weekday: 5 }
};
const req = () => ({
  user: { id: 465, role: 'clinical_practice_assistant' },
  params: { id: '878' },
  query: {},
  body: { roomId: 6, approverComment: 'Use this room' }
});
const res = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
});
beforeEach(() => {
  vi.clearAllMocks();
  m.find.mockResolvedValue(request);
  m.context.mockResolvedValue({ rooms: [room], warnings: [] });
});
it('rechecks availability on confirmation and passes the exact reviewed room/window to the original writer', async () => {
  const handler = vi.fn(async (r, response) => response.json({ ok: true })),
    response = res();
  await runOfficeDecision(
    req(),
    response,
    (error) => {
      throw error;
    },
    { source: 'intake', action: 'approve', handler }
  );
  expect(m.context).toHaveBeenCalledWith(expect.anything(), 'intake:878', {
    roomId: 6,
    selectedOnly: true
  });
  expect(handler.mock.calls[0][0]).toMatchObject({
    body: { roomId: 6, officeId: 1, hour: 17, endHour: 19 },
    officeApprovalWindow: room.window
  });
  expect(m.resolve).toHaveBeenCalledWith('intake:878');
  expect(m.audit).toHaveBeenCalled();
  expect(m.notify).toHaveBeenCalled();
});
it('does not write or resolve alerts when a room was taken since the review', async () => {
  m.context.mockResolvedValue({
    rooms: [{ ...room, available: false, reason: 'Now booked' }],
    warnings: []
  });
  const handler = vi.fn(),
    response = res();
  await runOfficeDecision(req(), response, vi.fn(), {
    source: 'intake',
    action: 'approve',
    handler
  });
  expect(response.status).toHaveBeenCalledWith(409);
  expect(handler).not.toHaveBeenCalled();
  expect(m.resolve).not.toHaveBeenCalled();
});
it('requires review of conflicting provider commitments', async () => {
  m.context.mockResolvedValue({
    rooms: [room],
    warnings: [{ kind: 'calendar' }]
  });
  const handler = vi.fn(),
    response = res();
  await runOfficeDecision(req(), response, vi.fn(), {
    source: 'intake',
    action: 'approve',
    handler
  });
  expect(handler).not.toHaveBeenCalled();
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({ code: 'OFFICE_EXISTING_RESERVATION' })
    })
  );
});
it('denial can close an expired request without requiring an available room', async () => {
  const handler = vi.fn(async (r, response) => response.json({ ok: true }));
  await runOfficeDecision(
    req(),
    res(),
    (error) => {
      throw error;
    },
    { source: 'intake', action: 'deny', handler }
  );
  expect(m.context).not.toHaveBeenCalled();
  expect(handler).toHaveBeenCalled();
});
it('never repeats a successful decision because notification delivery failed', async () => {
  m.notify.mockRejectedValue(new Error('offline'));
  const response = res(),
    handler = vi.fn(async (r, rsp) => rsp.json({ ok: true }));
  await runOfficeDecision(
    req(),
    response,
    (error) => {
      throw error;
    },
    { source: 'intake', action: 'approve', handler }
  );
  expect(handler).toHaveBeenCalledOnce();
  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: true,
      warning: expect.stringContaining('Do not submit it again')
    })
  );
});
