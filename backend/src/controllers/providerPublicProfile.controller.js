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

    const targetAgencies = await User.getAgencies(userId);
    if (!(targetAgencies || []).some(a => Number(a.id) === agencyId)) return res.status(404).json({error:{message:'Provider not found in this agency'}});
    const profile = await ProviderPublicProfile.getForProvider({ providerUserId: userId });
    const agencySettings = await ProviderPublicProfile.getAgencySettings({ agencyId });
    res.json({
      ok: true,
      userId,
      agencyId,
      profile: {
        details: profile?.details || {},
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

    const targetAgencies = await User.getAgencies(userId);
    if (!(targetAgencies || []).some(a => Number(a.id) === agencyId)) return res.status(404).json({ error: { message: 'Provider not found in this agency' } });
    const prior = await ProviderPublicProfile.getForProvider({ providerUserId: userId });
    const rateAdmin = ['admin', 'super_admin'].includes(req.user?.role);
    if (!rateAdmin && ['selfPayRateCents', 'selfPayRateNote'].some(key => Object.hasOwn(req.body || {}, key))) {
      return res.status(403).json({ error: { message: 'Only admin or superadmin can manage self-pay rates' } });
    }
    let identity;
    if (req.body?.identity) {
      identity=Object.fromEntries(['firstName','lastName','title'].map(k=>[k,String(req.body.identity[k] || '').trim()]));
      if(!identity.firstName || !identity.lastName || identity.firstName.length>100 || identity.lastName.length>100 || identity.title.length>160) return res.status(400).json({error:{message:'Provide valid names and a title of no more than 160 characters'}});
    }
    const saved = await ProviderPublicProfile.upsertForProvider({
      providerUserId: userId,
      details: req.body?.details,
      publicBlurb: req.body?.publicBlurb ?? null,
      insurances: Array.isArray(req.body?.insurances) ? req.body.insurances : [],
      selfPayRateCents: Object.hasOwn(req.body || {}, 'selfPayRateCents') ? req.body.selfPayRateCents : prior?.selfPayRateCents ?? null,
      selfPayRateNote: Object.hasOwn(req.body || {}, 'selfPayRateNote') ? req.body.selfPayRateNote : prior?.selfPayRateNote ?? null,
      acceptingNewClientsOverride: Object.hasOwn(req.body || {}, 'acceptingNewClientsOverride') ? req.body.acceptingNewClientsOverride : prior?.acceptingNewClientsOverride ?? null
    });
    if(identity) await User.update(userId,identity);
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
    const prior = await ProviderPublicProfile.getAgencySettings({ agencyId });
    if (!['admin', 'super_admin'].includes(req.user?.role) && ['defaultSelfPayRateCents', 'defaultSelfPayRateNote'].some(key => Object.hasOwn(req.body || {}, key))) {
      return res.status(403).json({ error: { message: 'Only admin or superadmin can manage self-pay rates' } });
    }
    const saved = await ProviderPublicProfile.upsertAgencySettings({
      agencyId,
      finderIntroBlurb: req.body?.finderIntroBlurb ?? null,
      defaultSelfPayRateCents: Object.hasOwn(req.body || {}, 'defaultSelfPayRateCents') ? req.body.defaultSelfPayRateCents : prior?.defaultSelfPayRateCents ?? null,
      defaultSelfPayRateNote: Object.hasOwn(req.body || {}, 'defaultSelfPayRateNote') ? req.body.defaultSelfPayRateNote : prior?.defaultSelfPayRateNote ?? null,
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
