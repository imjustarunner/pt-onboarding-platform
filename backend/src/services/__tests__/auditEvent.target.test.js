import { expect, it, vi } from 'vitest';
vi.mock('../../models/UserActivityLog.model.js', () => ({ default: { logActivity: vi.fn() } }));
import UserActivityLog from '../../models/UserActivityLog.model.js';
import { logAuditEvent } from '../auditEvent.service.js';

it('retains the affected user separately from the actor', async () => {
  await logAuditEvent({ user: { id: 3 }, headers: {} }, {
    actionType: 'school_portal_school_staff_removed', targetType: 'user', targetId: 42,
    metadata: { schoolOrganizationId: 20, accountArchived: true }
  });
  expect(UserActivityLog.logActivity).toHaveBeenCalledWith(expect.objectContaining({
    userId: 3, metadata: { targetType: 'user', targetId: 42, schoolOrganizationId: 20, accountArchived: true }
  }));
});
