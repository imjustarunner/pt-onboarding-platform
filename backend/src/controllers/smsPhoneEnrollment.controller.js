import { listPhoneEnrollments, phoneEnrollmentEvidence, reviewPhoneEnrollment } from '../services/smsPhoneEnrollment.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
const wrap = fn => async (req, res, next) => { try { res.set('Cache-Control', 'no-store'); res.json(await fn(req)); } catch (error) { next(error); } };
export const listPhoneEnrollmentQueue = wrap(async req => {
  const result = await listPhoneEnrollments(req.transitionAgencyId, { status: req.query.status || 'pending', beforeId: req.query.beforeId == null ? null : Number(req.query.beforeId) });
  await logAuditEvent(req, { actionType: 'sms_phone_enrollments_viewed', agencyId: req.transitionAgencyId, metadata: { count: result.items.length } });
  return result;
});
export const getPhoneEnrollmentEvidence = wrap(async req => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error('Invalid enrollment.'), { status: 400 });
  const result = await phoneEnrollmentEvidence(req.transitionAgencyId, id);
  await logAuditEvent(req, { actionType: 'sms_phone_enrollment_evidence_viewed', agencyId: req.transitionAgencyId, metadata: { id } });
  return result;
});
export const linkPhoneEnrollment = wrap(req => reviewPhoneEnrollment({ agencyId: req.transitionAgencyId, id: Number(req.params.id),
  userId: Number(req.body?.userId), clientId: Number(req.body?.clientId), identityVerified: req.body?.identityVerified, actorUserId: req.user.id }));
