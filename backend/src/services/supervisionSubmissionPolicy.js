import PayrollIndirectServiceType from '../models/PayrollIndirectServiceType.model.js';

const sessionKeys = new Set(['supervision', 'clinical_supervision_sa']);
export const supervisionSubmissionMessage = 'Supervision must be submitted by the assigned supervisor in My Dashboard → Supervision → the supervisee’s area.';

// Automatic supervision claims are created by the finalization pipeline directly.
// Employee payroll endpoints must not accept their source, codes, or allocations.
export async function assertNoManualSupervisionClaim(payload = {}) {
  const allocations = Array.isArray(payload?.allocations) ? payload.allocations : [];
  const isSessionKey = key => sessionKeys.has(String(key || '').trim().toLowerCase());
  const denied = payload?.supervisionSessionId || String(payload?.source || '').startsWith('supervision_')
    || ['99415', '99416'].includes(String(payload?.serviceCode || '').trim())
    || isSessionKey(payload?.allocationKey)
    || allocations.some(row => isSessionKey(row?.serviceTypeKey || row?.typeKey));
  if (denied) throw Object.assign(new Error(supervisionSubmissionMessage), { status: 403 });
  const ids = [...new Set(allocations.map(row => Number(row?.serviceTypeId || row?.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (ids.length) {
    const types = await PayrollIndirectServiceType.findByIds(ids);
    if (types.some(type => isSessionKey(type.typeKey || type.type_key))) {
      throw Object.assign(new Error(supervisionSubmissionMessage), { status: 403 });
    }
  }
}
