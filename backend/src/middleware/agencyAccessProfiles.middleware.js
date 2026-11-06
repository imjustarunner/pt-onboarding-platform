import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import pool from '../config/database.js';
import { isStaffAccount } from '../utils/staffEligibility.js';
import { applyAgencyAccess, AGENCY_ACCESS_FIELDS } from '../utils/agencyAccessPolicy.js';
import { accessProfileSchemaReady, readAgencyAccess } from '../services/agencyAccessProfiles.service.js';

export const LEGACY_SCOPED_ACCESS_INPUTS = ['companyCardEnabled','companyCarSubmitAccess','companyCarManageAccess',
  'skillBuilderEligible','groupSupervisionEligible','hasPayrollAccess','hasBillingAccess','isMarketingContact',
  'hasCredentialingAccess','hasDepartmentAccess','isHourlyWorker','hasHiringAccess','hasOutreachAccess','hasMedicalRecordsReleaseAccess',
  'hasGamesAccess','hasProviderAccess','hasStaffAccess','hasSupervisorPrivileges','hasSkillBuilderCoordinatorAccess',
  'hasPlatformGearAccess','hasPlatformSupport'];

export async function rejectGlobalAgencyAccessWrites(req, res, next) {
  try {
    if (LEGACY_SCOPED_ACCESS_INPUTS.some(key => Object.hasOwn(req.body || {}, key)) && await accessProfileSchemaReady()) {
      return res.status(400).json({ error: { message: 'Use the company selector in Agency roles & permissions. A profile update cannot change access across companies.' } });
    }
    if (Object.hasOwn(req.body||{},'role') && await accessProfileSchemaReady()) {
      const target=await User.findById(Number(req.params.id),{raw:true});
      if(isStaffAccount(target) && req.body.role!==target.role && req.body.role!=='super_admin' && target.role!=='super_admin') {
        return res.status(400).json({error:{message:'Working roles are set separately for each company. Use Agency roles & permissions.'}});
      }
    }
    next();
  } catch (error) { next(error); }
}

export async function scopeAgencyRequest(req) {
  if (!req.user?.id || req.user.demoMode || req.assistantIdentity) return;
  const user = await User.findById(req.user.id, { raw: true });
  if (!isStaffAccount(user) || !await accessProfileSchemaReady()) return;
  let agencyId = Number(req.params?.agencyId || req.body?.agencyId || req.query?.agencyId
    || (/\/agencies$/.test(req.baseUrl || '') ? req.params?.id : null) || req.headers?.['x-agency-id'] || req.user.agencyId);
  req.user.platformRole = user.role;
  req.user.agencyScopeResolved = true;
  // Global superadmin authority is deliberate and is never granted by an agency.
  if (user.role === 'super_admin') { req.user.role = 'super_admin'; req.user.effectiveRole = 'super_admin'; req.user.scopedAgencyId = agencyId; return; }
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) {
    const memberships = await User.getAgencies(user.id);
    agencyId = Number(memberships.find(m=>m.is_default)?.id || memberships[0]?.id);
  }
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) {
    req.user.role = req.user.effectiveRole = 'provider';
    const permissions=Object.fromEntries(AGENCY_ACCESS_FIELDS.map(f=>[f.key,false]));
    req.user = {...req.user,...permissions,agencyAccess:{role:'provider',permissions}};
    return;
  }
  const agency = await Agency.findById(agencyId);
  if (String(agency?.organization_type).toLowerCase() === 'affiliation') {
    req.user.role = req.user.effectiveRole || 'member';
    const permissions=Object.fromEntries(AGENCY_ACCESS_FIELDS.map(f=>[f.key,false]));
    req.user = {...req.user,...permissions,agencyAccess:{role:req.user.role,permissions}};
    return;
  }
  if (String(agency?.organization_type).toLowerCase() === 'school') {
    const [parents] = await pool.execute('SELECT agency_id FROM organization_affiliations WHERE organization_id=? AND COALESCE(is_active,1)=1 ORDER BY id',[agencyId]);
    const memberships = await User.getAgencies(user.id);
    const available = parents.map(p=>Number(p.agency_id)).filter(parent=>memberships.some(m=>Number(m.id)===parent));
    const selected = Number(req.headers?.['x-agency-id']);
    agencyId = available.includes(selected) ? selected : available[0];
    if (!agencyId) throw Object.assign(new Error('An active company affiliation is required for this school.'),{status:403,code:'AGENCY_ACCESS_REQUIRED'});
  }
  const access = await readAgencyAccess(user.id, agencyId);
  if (!access) throw Object.assign(new Error('You do not have active access to this company.'), { status: 403, code: 'AGENCY_ACCESS_REQUIRED' });
  if (access.financialAccessOnly && !access.permissions.has_billing_access) throw Object.assign(new Error('Billing access is turned off for this company.'), {status:403,code:'AGENCY_ACCESS_REQUIRED'});
  if (access.legacyAccessOnly && !Object.values(access.permissions).some(Boolean)) throw Object.assign(new Error('Access is turned off for this company.'),{status:403,code:'AGENCY_ACCESS_REQUIRED'});
  req.user = { ...applyAgencyAccess({ ...req.user, role: user.role }, access),
    effectiveRole: access.role, agencyId, scopedAgencyId: agencyId };
}
