import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), assignments: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/PhoneNumberAssignment.model.js', () => ({ default: { listByUserId: m.assignments } }));
vi.mock('../../services/clinicalSmsAccess.service.js', () => ({ assertClinicalSmsRecipient: vi.fn(), staffSmsIdentity: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../../models/Client.model.js', () => ({ default: {} }));
vi.mock('../../models/MessageLog.model.js', () => ({ default: {} }));
vi.mock('../../services/storage.service.js', () => ({ default: {} }));
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
vi.mock('../../models/UserCallSettings.model.js', () => ({ default: {} }));
vi.mock('../../models/SmsOptInState.model.js', () => ({ default: {} }));
vi.mock('../../services/notificationGatekeeper.service.js', () => ({ default: {} }));
vi.mock('../../services/vonage.service.js', () => ({ default: {} }));
vi.mock('../../services/smsManualSupportAlert.service.js', () => ({ sendManualSupportAlert: vi.fn() }));
vi.mock('../../services/communicationRouting.service.js', () => ({ resolveOutboundNumber: vi.fn() }));
vi.mock('../../models/SmsThreadEscalation.model.js', () => ({ default: {} }));
vi.mock('../../services/smsAutoReplyRule.service.js', () => ({ default: {} }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../models/AgencyContact.model.js', () => ({ default: {} }));
vi.mock('../../models/ContactCommunicationLog.model.js', () => ({ default: {} }));
import { getRecentMessages } from '../message.controller.js';
beforeEach(() => { vi.clearAllMocks(); m.execute.mockResolvedValue([[{ id: 1 }]]); m.assignments.mockResolvedValue([{ number_id: 7 }]); });
it.each(['admin', 'provider', 'school_staff'])('loads recent messages for %s with integer pagination and agency restrictions', async role => {
  const res = { json: vi.fn() }, next = vi.fn();
  await getRecentMessages({ user: { id: 42, role }, query: { limit: '999' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  const [sql, params] = m.execute.mock.calls[0];
  expect(sql).toContain('LIMIT 200'); expect(sql).not.toContain('LIMIT ?');
  expect(sql).toContain('ua.agency_id = ml.agency_id');
  expect(params).toEqual(role === 'admin' ? [42] : [42, 7, 42]);
  expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
});
it('bounds invalid and negative limits without adding SQL from the request', async () => {
  for (const [limit, expected] of [['invalid', 50], ['-10', 1], ['1; DELETE FROM message_logs', 1]]) {
    await getRecentMessages({ user: { id: 42, role: 'admin' }, query: { limit } }, { json: vi.fn() }, vi.fn());
    expect(m.execute.mock.lastCall[0]).toContain(`LIMIT ${expected}`);
    expect(m.execute.mock.lastCall[0]).not.toContain('DELETE');
  }
});
