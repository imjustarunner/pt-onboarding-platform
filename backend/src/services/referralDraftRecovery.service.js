import User from '../models/User.model.js';

// A draft may contain PHI. Agency membership is required even for backoffice roles.
export async function recoveryAgencyIds(user, requestedAgencyId = null) {
  if (!user?.id || !['admin', 'super_admin'].includes(user.role)) return [];
  const requested = requestedAgencyId == null ? null : Number(requestedAgencyId);
  if (user.role === 'super_admin') return requested ? [requested] : null;
  const agencies = await User.getAgencies(user.id);
  const ids = (agencies || []).filter(a => ![0, false, '0'].includes(a.membership_is_active ?? a.is_active)).map(a => Number(a.id)).filter(Boolean);
  return requested == null ? ids : ids.filter(id => id === requested);
}

export async function canRecoverReferralDraft(user, draft) {
  if (!user?.id || !draft) return false;
  if (Number(draft.uploaded_by_user_id) === Number(user.id)) return true;
  const ids = await recoveryAgencyIds(user);
  return ids === null || ids.includes(Number(draft.agency_id));
}

export function referralDraftResponse(draft) {
  return {
    id: draft.id,
    organizationId: draft.organization_id,
    agencyId: draft.agency_id,
    phiDocumentId: draft.phi_document_id || null,
    scanStatus: draft.scan_status || 'pending',
    submissionDate: draft.submission_date || null,
    uploadNote: draft.upload_note || '',
    firstName: draft.first_name || '',
    lastName: draft.last_name || '',
    initials: draft.initials || '',
    status: draft.status
  };
}
