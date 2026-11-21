import {getProviderClinicalFocus,saveProviderClinicalFocus} from '../services/providerClinicalFocus.service.js';
import { listProviderAcceptedInsurancesForDisplay } from '../services/providerAcceptedInsurance.service.js';
import User from '../models/User.model.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import pool from '../config/database.js';
import {withdrawProviderIntakeOpenings} from '../services/providerIntakePublication.service.js';

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
        acceptedInsurances: await listProviderAcceptedInsurancesForDisplay({userId, agencyId}),
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
    if (Number(req.user.id) !== userId && !canManageProfile(req.user?.role)) {
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
    const connection=await pool.getConnection();
    let saved;
    try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);
    const closed=req.body?.acceptingNewClientsOverride===false && prior?.acceptingNewClientsOverride!==false;
    const newlyClosed=key=>req.body?.details?.[key]==='unavailable'&&prior?.details?.[key]!=='unavailable';
    const formats={inPerson:closed||newlyClosed('officeAvailability'),virtual:closed||newlyClosed('virtualAvailability'),school:closed||newlyClosed('schoolAvailability')};
    if(Object.values(formats).some(Boolean))await withdrawProviderIntakeOpenings(connection,userId,formats);
    saved = await ProviderPublicProfile.upsertForProvider({
      database:connection,
      providerUserId: userId,
      details: req.body?.details,
      publicBlurb: req.body?.publicBlurb ?? null,
      insurances: Array.isArray(req.body?.insurances) ? req.body.insurances : [],
      selfPayRateCents: Object.hasOwn(req.body || {}, 'selfPayRateCents') ? req.body.selfPayRateCents : prior?.selfPayRateCents ?? null,
      selfPayRateNote: Object.hasOwn(req.body || {}, 'selfPayRateNote') ? req.body.selfPayRateNote : prior?.selfPayRateNote ?? null,
      acceptingNewClientsOverride: Object.hasOwn(req.body || {}, 'acceptingNewClientsOverride') ? req.body.acceptingNewClientsOverride : prior?.acceptingNewClientsOverride ?? null
    });
    await connection.commit();
    } catch(error){await connection.rollback();throw error;}finally{connection.release();}
    if(identity) await User.update(userId,identity);
    res.json({ ok: true, userId, agencyId, profile: saved });
  } catch (e) {
    next(e);
  }
};

export const upsertUserProviderSchoolBiography = async (req, res, next) => {
  try {
    const userId = parseIntSafe(req.params.id);
    const schoolId = parseIntSafe(req.body?.schoolId);
    if (!userId || userId < 1 || !schoolId || schoolId < 1) return res.status(400).json({ error: { message: 'A user and affiliated school are required.' } });
    if (Object.keys(req.body || {}).some(key => !['schoolId', 'schoolBlurb'].includes(key))
      || !Object.hasOwn(req.body || {}, 'schoolBlurb')
      || (req.body.schoolBlurb !== null && typeof req.body.schoolBlurb !== 'string')
      || String(req.body.schoolBlurb || '').length > 4000) {
      return res.status(400).json({ error: { message: 'Only the school biography may be saved here, up to 4,000 characters.' } });
    }
    const isSelf = Number(req.user?.id) === userId;
    if (!isSelf && !canManageProfile(req.user?.role)) return res.status(403).json({ error: { message: 'You may edit only your own biography.' } });
    if (!isSelf && req.user?.role !== 'super_admin') {
      const agencies = await User.getAgencies(req.user.id);
      if (!(agencies || []).some(agency => Number(agency.id) === schoolId)) return res.status(403).json({ error: { message: 'Access to this school is required.' } });
    }
    // Check direct school membership or an active provider assignment. Agency-wide
    // administrative access by itself is not a school affiliation for the target.
    const [affiliations] = await pool.execute(
      `SELECT s.id FROM agencies s WHERE s.id = ? AND COALESCE(s.is_archived, 0) = 0
       AND (LOWER(TRIM(COALESCE(s.organization_type, ''))) = 'school'
         OR (TRIM(COALESCE(s.organization_type, '')) = '' AND EXISTS (
           SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id = s.id AND oa.is_active = TRUE)))
       AND (EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id = ? AND ua.agency_id = s.id AND COALESCE(ua.is_active, 1) = 1)
         OR EXISTS (SELECT 1 FROM provider_school_assignments psa WHERE psa.provider_user_id = ? AND psa.school_organization_id = s.id AND psa.is_active = TRUE))
       LIMIT 1`, [schoolId, userId, userId]
    );
    if (!affiliations.length) return res.status(403).json({ error: { message: 'An active school affiliation is required to edit the school biography.' } });
    const schoolBlurb = String(req.body.schoolBlurb || '').trim();
    const updated = await User.update(userId, { providerSchoolInfoBlurb: schoolBlurb || null });
    if (!updated) return res.status(404).json({ error: { message: 'Provider not found.' } });
    res.json({ ok: true, userId, schoolId, schoolBlurb });
  } catch (error) {
    next(error);
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

async function clinicalFocusAccess(req, res) {
  const userId = parseIntSafe(req.params.id);
  const agencyId = parseIntSafe(req.body?.agencyId || req.query?.agencyId);
  if (!userId || !agencyId) { res.status(400).json({error:{message:'Valid user and agency IDs are required'}}); return null; }
  if (Number(req.user?.id) !== userId && !canManageProfile(req.user?.role)) { res.status(403).json({error:{message:'Access denied'}}); return null; }
  if (!(await requireAgencyMembership(req, res, agencyId))) return null;
  const agencies = await User.getAgencies(userId);
  if (!agencies.some(a => Number(a.id) === agencyId)) { res.status(404).json({error:{message:'Provider not found in this agency'}}); return null; }
  return {userId, agencyId};
}
export async function getUserClinicalFocus(req, res, next) {
  try { const access=await clinicalFocusAccess(req,res); if(access)res.json(await getProviderClinicalFocus(access.userId,access.agencyId)); }
  catch(error){next(error);}
}
export async function putUserClinicalFocus(req, res, next) {
  try { const access=await clinicalFocusAccess(req,res); if(access)res.json(await saveProviderClinicalFocus(access.userId,access.agencyId,req.body?.clinicalFocus)); }
  catch(error){next(error);}
}
