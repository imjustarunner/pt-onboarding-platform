import {
  getPublicAgencySupportConfig,
  createPublicAgencySupportTicket,
  updatePublicAgencySupportSettings
} from '../services/publicAgencySupport.service.js';

export async function getPublicAgencySupport(req, res) {
  try {
    const data = await getPublicAgencySupportConfig(req.params.agencySlug);
    return res.json({ ok: true, ...data });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: { message: e.message || 'Unable to load support' } });
  }
}

export async function postPublicAgencySupportTicket(req, res) {
  try {
    const result = await createPublicAgencySupportTicket(req.params.agencySlug, req.body || {}, req);
    return res.status(201).json(result);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({
      error: { message: e.message || 'Unable to send your message', code: e.code || null }
    });
  }
}

export async function postItscoInternshipInquiry(req, res) {
  try {
    const result = await createPublicAgencySupportTicket('itsco', { ...req.body, category: 'careers' }, req, { internshipInquiry: true });
    return res.status(201).json(result);
  } catch (e) {
    return res.status(e.status || 400).json({ error: { message: e.message || 'Unable to send your inquiry', code: e.code || null } });
  }
}

export async function patchPublicAgencySupportSettings(req, res) {
  try {
    const data = await updatePublicAgencySupportSettings(
      req.params.agencySlug,
      req.body || {},
      req.user
    );
    return res.json({ ok: true, ...data });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: { message: e.message || 'Unable to save support settings' } });
  }
}
