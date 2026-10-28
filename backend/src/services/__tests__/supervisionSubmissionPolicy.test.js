import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ types: vi.fn() }));
vi.mock('../../models/PayrollIndirectServiceType.model.js', () => ({ default: { findByIds: m.types } }));
import { assertNoManualSupervisionClaim, supervisorsMeetingSubmissionMessage } from '../supervisionSubmissionPolicy.js';
beforeEach(() => { vi.clearAllMocks(); m.types.mockResolvedValue([]); });
it.each([
 { source: 'supervision_session_finalize' }, { source: 'supervision_payroll_correction' },
 { supervisionSessionId: 42 }, { serviceCode: '99415' }, { serviceCode: '99416' },
 { allocations: [{ serviceTypeKey: 'clinical_supervision_sa' }] },
 { allocations: [{ typeKey: 'supervision' }] }
])('rejects payroll submissions impersonating session time: %j', async payload => {
 await expect(assertNoManualSupervisionClaim(payload)).rejects.toMatchObject({ status: 403 });
});
it('resolves database type IDs so a renamed or omitted key cannot bypass the guard', async () => {
 m.types.mockResolvedValue([{ id: 7, typeKey: 'clinical_supervision_sa' }]);
 await expect(assertNoManualSupervisionClaim({ allocations: [{ serviceTypeId: 7, serviceTypeKey: 'other' }] })).rejects.toMatchObject({ status: 403 });
 expect(m.types).toHaveBeenCalledWith([7]);
});
it('preserves supervision note work and other support activities', async () => {
 m.types.mockResolvedValue([{ id: 8, typeKey: 'supervision_note_time' }]);
 await expect(assertNoManualSupervisionClaim({ serviceCode: 'Admin Time', allocations: [{ serviceTypeId: 8, serviceTypeKey: 'supervision_note_time' }] })).resolves.toBeUndefined();
});
it.each([
 { allocationKey: 'supervisors_meeting' },
 { serviceCode: 'Supervisor meeting' },
 { activityCode: 'SN-02' },
 { allocations: [{ serviceTypeKey: 'supervisors_meeting' }] },
 { allocations: [{ typeKey: ' SUPERVISORS_MEETING ' }] },
 { allocations: [{ activityCode: 'SN-02' }] }
])('rejects manual supervisors meeting time: %j', async payload => {
 await expect(assertNoManualSupervisionClaim(payload)).rejects.toMatchObject({ status: 403, message: supervisorsMeetingSubmissionMessage });
});
it('rejects the meeting category by database ID even when the supplied key is note time', async () => {
 m.types.mockResolvedValue([{ id: 9, typeKey: 'supervisors_meeting' }]);
 await expect(assertNoManualSupervisionClaim({ allocations: [{ serviceTypeId: 9, serviceTypeKey: 'supervision_note_time' }] })).rejects.toMatchObject({ status: 403, message: supervisorsMeetingSubmissionMessage });
});
