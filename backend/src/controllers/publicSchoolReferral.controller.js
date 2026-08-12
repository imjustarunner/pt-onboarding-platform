import {
  listPublicReferralDirectory,
  createPublicSchoolReferralSupportTicket
} from '../services/publicSchoolReferral.service.js';

export async function getPublicSchoolReferralDirectory(req, res, next) {
  try {
    const data = await listPublicReferralDirectory(req.params.agencySlug, req);
    res.json(data);
  } catch (e) {
    if (e?.status === 404) {
      return res.status(404).json({ error: { message: e.message || 'Organization not found' } });
    }
    next(e);
  }
}

export async function createPublicSchoolReferralTicket(req, res, next) {
  try {
    const result = await createPublicSchoolReferralSupportTicket(req.params.agencySlug, req.body || {});
    res.status(201).json(result);
  } catch (e) {
    if (e?.status === 404) {
      return res.status(404).json({ error: { message: e.message || 'Organization not found' } });
    }
    if (e?.status === 400) {
      return res.status(400).json({ error: { message: e.message || 'Invalid request', code: e.code || null } });
    }
    next(e);
  }
}
