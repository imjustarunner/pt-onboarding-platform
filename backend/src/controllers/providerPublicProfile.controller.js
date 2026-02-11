import User from '../models/User.model.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';

function parseIntSafe(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function canManageProfile(actorRole) {
  const r = String(actorRole || '').toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff';
}

async function requireAgencyMembership(req, res, agencyId) {
  const aid = parseIntSafe(agencyId);
  if (!aid) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return false;
  }
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a?.id) === aid);
  if (!ok) {
    res.status(403).json({ error: { message: 'Access denied for this agency' } });
    return false;
  }
  return true;
}

export const getUserProviderPublicProfile = async (req, res, next) => {
  try {
    const userId = parseIntSafe(req.params.id);
    const agencyId = parseIntSafe(req.query.agencyId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const isSelf = Number(req.user?.id || 0) === Number(userId);
    if (!isSelf && !canManageProfile(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!(await requireAgencyMembership(req, res, agencyId))) return;

    const profile = await ProviderPublicProfile.getForProvider({ providerUserId: userId });
    const agencySettings = await ProviderPublicProfile.getAgencySettings({ agencyId });
    res.json({
      ok: true,
      userId,
      agencyId,
      profile: {
        publicBlurb: profile?.publicBlurb || '',
        insurances: Array.isArray(profile?.insurances) ? profile.insurances : [],
        selfPayRateCents: profile?.selfPayRateCents ?? null,
        selfPayRateNote: profile?.selfPayRateNote || '',
        acceptingNewClientsOverride: profile?.acceptingNewClientsOverride ?? null
      },
      agencyDefaults: {
        finderIntroBlurb: agencySettings?.finderIntroBlurb || '',
        defaultSelfPayRateCents: agencySettings?.defaultSelfPayRateCents ?? null,
        defaultSelfPayRateNote: agencySettings?.defaultSelfPayRateNote || ''
      }
    });
  } catch (e) {
    next(e);
  }
};

export const upsertUserProviderPublicProfile = async (req, res, next) => {
  try {
    const userId = parseIntSafe(req.params.id);
    const agencyId = parseIntSafe(req.body?.agencyId || req.query?.agencyId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!canManageProfile(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    if (!(await requireAgencyMembership(req, res, agencyId))) return;

    const saved = await ProviderPublicProfile.upsertForProvider({
      providerUserId: userId,
      publicBlurb: req.body?.publicBlurb ?? null,
      insurances: Array.isArray(req.body?.insurances) ? req.body.insurances : [],
      selfPayRateCents: req.body?.selfPayRateCents ?? null,
      selfPayRateNote: req.body?.selfPayRateNote ?? null,
      acceptingNewClientsOverride: req.body?.acceptingNewClientsOverride
    });
    res.json({ ok: true, userId, agencyId, profile: saved });
  } catch (e) {
    next(e);
  }
};

export const getAgencyProviderPortalSettings = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const settings = await ProviderPublicProfile.getAgencySettings({ agencyId });
    res.json({
      ok: true,
      agencyId,
      settings: {
        finderIntroBlurb: settings?.finderIntroBlurb || '',
        defaultSelfPayRateCents: settings?.defaultSelfPayRateCents ?? null,
        defaultSelfPayRateNote: settings?.defaultSelfPayRateNote || ''
      }
    });
  } catch (e) {
    next(e);
  }
};

export const upsertAgencyProviderPortalSettings = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    if (!canManageProfile(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    if (!(await requireAgencyMembership(req, res, agencyId))) return;
    const saved = await ProviderPublicProfile.upsertAgencySettings({
      agencyId,
      finderIntroBlurb: req.body?.finderIntroBlurb ?? null,
      defaultSelfPayRateCents: req.body?.defaultSelfPayRateCents ?? null,
      defaultSelfPayRateNote: req.body?.defaultSelfPayRateNote ?? null,
      updatedByUserId: req.user?.id
    });
    res.json({
      ok: true,
      agencyId,
      settings: {
        finderIntroBlurb: saved?.finderIntroBlurb || '',
        defaultSelfPayRateCents: saved?.defaultSelfPayRateCents ?? null,
        defaultSelfPayRateNote: saved?.defaultSelfPayRateNote || ''
      }
    });
  } catch (e) {
    next(e);
  }
};
