import {
  SOCIAL_PLATFORMS,
  listAgencySocialLinks,
  listWebsiteSocialLinks,
  getAgencySignatureTagline,
  upsertAgencySignatureTagline,
  replaceAgencySocialLinks,
  upsertAgencySocialLink,
  deleteAgencySocialLink
} from '../services/agencySocialLinks.service.js';
import User from '../models/User.model.js';

async function assertAgencyAccess(req, agencyId) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'support') return true;
  if (role !== 'admin') {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('You do not have access to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

export const getAgencySocialLinksAdmin = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || req.params.id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    await assertAgencyAccess(req, agencyId);
    const [links, signatureTagline] = await Promise.all([
      listAgencySocialLinks(agencyId),
      getAgencySignatureTagline(agencyId)
    ]);
    res.json({
      agencyId,
      platforms: SOCIAL_PLATFORMS,
      links,
      signatureTagline
    });
  } catch (e) {
    next(e);
  }
};

/** Public-ish branding payload: website-facing links only. */
export const getAgencySocialLinksPublic = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || req.params.id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const links = await listWebsiteSocialLinks(agencyId);
    res.json({
      agencyId,
      links: links.map((l) => ({
        platform: l.platform,
        label: l.label || l.platform,
        url: l.url
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const putAgencySocialLinksAdmin = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || req.params.id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    await assertAgencyAccess(req, agencyId);
    const body = req.body || {};
    const result = await replaceAgencySocialLinks(agencyId, body.links || [], {
      signatureTagline: Object.prototype.hasOwnProperty.call(body, 'signatureTagline')
        ? body.signatureTagline
        : undefined
    });
    res.json({
      agencyId,
      platforms: SOCIAL_PLATFORMS,
      ...result
    });
  } catch (e) {
    next(e);
  }
};

export const upsertAgencySocialLinkAdmin = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || req.params.id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    await assertAgencyAccess(req, agencyId);
    const link = await upsertAgencySocialLink(agencyId, req.body || {});
    res.json({ link });
  } catch (e) {
    next(e);
  }
};

export const deleteAgencySocialLinkAdmin = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || req.params.id || 0);
    const linkId = Number(req.params.linkId || 0);
    if (!agencyId || !linkId) return res.status(400).json({ error: { message: 'agencyId and linkId required' } });
    await assertAgencyAccess(req, agencyId);
    const ok = await deleteAgencySocialLink(agencyId, linkId);
    if (!ok) return res.status(404).json({ error: { message: 'Link not found' } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const putAgencySignatureTaglineAdmin = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || req.params.id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    await assertAgencyAccess(req, agencyId);
    const signatureTagline = await upsertAgencySignatureTagline(agencyId, req.body?.signatureTagline);
    res.json({ agencyId, signatureTagline });
  } catch (e) {
    next(e);
  }
};
