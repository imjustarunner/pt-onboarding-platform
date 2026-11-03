import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { schoolAbsenceHistory } from '../services/schoolAbsenceHistory.service.js';

export async function listSchoolAbsenceHistory(req, res, next) {
  try {
    const clientId = Number(req.params.id);
    if (!Number.isSafeInteger(clientId) || clientId < 1) return res.status(400).json({ error: { message: 'Invalid client' } });
    if (req.guardianPreviewMode || !['super_admin','admin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant'].includes(req.user.role)) return res.status(403).json({ error: { message: 'Staff client-record access is required.' } });
    const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    res.json({ records: await schoolAbsenceHistory.list({ agencyId: Number(access.client.agency_id), clientId }) });
  } catch (error) { next(error); }
}
