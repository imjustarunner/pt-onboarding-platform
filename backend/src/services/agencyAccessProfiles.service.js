import pool from '../config/database.js';
import { AGENCY_ACCESS_FIELDS, AGENCY_ACCESS_ROLES, PLATFORM_SERVICE_FIELDS, accessEnabled, jsonAccess, resolveAgencyAccess, validateAgencyAccessPatch } from '../utils/agencyAccessPolicy.js';
import { isStaffAccount } from '../utils/staffEligibility.js';
import { STAFF_ROLES } from '../utils/staffEligibility.js';
import { managedBillingAgencies } from './managedBillingAccess.service.js';

export const PLATFORM_DEFAULTS_AGENCY_ID = 1;
const COMPANY_TYPES = ['agency', 'clinical', 'life_coach', 'consultant', 'learning', 'program'];
const membershipFields = new Set(['has_payroll_access', 'has_billing_access', 'has_department_access', 'can_manage_credentialing', 'is_marketing_contact']);
const fail = (status, message) => Object.assign(new Error(message), { status });
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const knownSchemaError = error => ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code);
function queueMembershipSync(userId, dbPool) {
  if(dbPool!==pool)return;
  void import('./managedWorkspaceGroups.service.js').then(({queueDepartmentalGroupMembershipSync})=>queueDepartmentalGroupMembershipSync({userId})).catch(error=>console.warn('[agency-access] Mailbox sync deferred:',error.message));
}

export async function platformAccessDefaults(userId, db = pool) {
  const [[row]] = await db.execute(`SELECT d.* FROM user_platform_access_defaults d
    JOIN users u ON u.id=d.user_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
    JOIN user_agencies pt ON pt.user_id=u.id AND pt.agency_id=? AND COALESCE(pt.is_active,1)=1
    WHERE d.user_id=? AND u.role IN (${STAFF_ROLES.map(()=>'?').join(',')})
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','COMPLETED') LIMIT 1`, [PLATFORM_DEFAULTS_AGENCY_ID, userId,...STAFF_ROLES]);
  return row ? { ...row, enabled: accessEnabled(row.enabled), permissions_json: jsonAccess(row.permissions_json) } : null;
}

async function baseline(userId, agencyId, db) {
  const columns = AGENCY_ACCESS_FIELDS.map(({ key }) => `${membershipFields.has(key) ? 'ua' : 'u'}.${key}`).join(',');
  const [[row]] = await db.execute(`SELECT u.role AS platform_role,u.status,u.is_active,u.is_archived,
    ua.user_id AS membership_user_id,ua.is_active AS membership_active,ua.agency_role,
    a.id AS agency_id,a.organization_type,a.is_active AS agency_active,a.is_archived AS agency_archived,${columns}
    FROM users u JOIN agencies a ON a.id=?
    LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=a.id WHERE u.id=? LIMIT 1`, [agencyId, userId]);
  if (!row) return null;
  const permissions = Object.fromEntries(AGENCY_ACCESS_FIELDS.map(({ key }) => [key, row.membership_user_id ? accessEnabled(row[key]) : false]));
  if (row.membership_user_id) {
    permissions.has_hiring_access ||= ['admin', 'super_admin', 'support', 'staff'].includes(row.platform_role) || ['admin','support','staff'].includes(row.agency_role);
    permissions.has_outreach_access ||= ['admin', 'super_admin', 'support'].includes(row.platform_role) || ['admin','support'].includes(row.agency_role);
  }
  return { ...row, role_baseline: row.membership_user_id ? row.agency_role || row.platform_role : 'provider',
    permissions_baseline: permissions, permissions_overrides: {}, revision: 0 };
}

export async function readAgencyAccess(userId, agencyId, db = pool, cached = {}) {
  if (!id(userId) || !id(agencyId)) return null;
  try {
    if (!await accessProfileSchemaReady(db)) return null;
    const [base, defaults] = await Promise.all([baseline(userId, agencyId, db),
      Object.hasOwn(cached,'defaults') ? Promise.resolve(cached.defaults) : platformAccessDefaults(userId, db)]);
    if (!base || !accessEnabled(base.agency_active) || accessEnabled(base.agency_archived)) return null;
    const company = COMPANY_TYPES.includes(String(base.organization_type || '').toLowerCase());
    const inherited = company && defaults?.enabled ? defaults : null;
    const activeMember = base.membership_user_id && base.membership_active !== 0;
    const managed = company ? (cached.managed || await managedBillingAgencies(userId, db)).some(a => Number(a.id) === Number(agencyId)) : false;
    let saved;
    if (cached.profiles) saved=cached.profiles.get(Number(agencyId));
    else [[saved]] = await db.execute('SELECT * FROM user_agency_access_profiles WHERE user_id=? AND agency_id=? LIMIT 1', [userId, agencyId]);
    const legacy = saved?.access_origin === 'legacy_tenant_grant';
    // Platform access is separate from an employment/clinical affiliation.
    if (!activeMember && !inherited && !managed && !legacy) return null;
    if (!accessEnabled(base.is_active) || accessEnabled(base.is_archived)
      || ['ARCHIVED', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'INACTIVE'].includes(String(base.status).toUpperCase())) return null;
    if (!saved) {
      const initial = {...base,role_override:base.agency_role || null};
      const effective = resolveAgencyAccess(initial,inherited);
      await db.execute(`INSERT IGNORE INTO user_agency_access_profiles
        (user_id,agency_id,role_baseline,permissions_baseline,role_override,permissions_overrides,effective_role,effective_permissions)
        VALUES (?,?,?,?,?,JSON_OBJECT(),?,?)`,[userId,agencyId,base.role_baseline,JSON.stringify(base.permissions_baseline),initial.role_override,effective.role,JSON.stringify(effective.permissions)]);
      [[saved]] = await db.execute('SELECT * FROM user_agency_access_profiles WHERE user_id=? AND agency_id=? LIMIT 1',[userId,agencyId]);
    }
    const profile = saved || base;
    const resolved = resolveAgencyAccess(profile, inherited);
    if (managed && resolved.sources.has_billing_access === 'preserved_agency_access') {
      resolved.permissions.has_billing_access = true;
      resolved.sources.has_billing_access = 'managed_billing';
    }
    if (!activeMember && !inherited && managed && !profile.role_override) {
      resolved.role='support'; resolved.roleSource='managed_billing';
    }
    const displayDefaults = inherited ? {...inherited,permissions_json:{...inherited.permissions_json}} : null;
    if (displayDefaults?.role) {
      if (!Object.hasOwn(displayDefaults.permissions_json,'has_hiring_access') && ['admin','support','staff'].includes(displayDefaults.role)) displayDefaults.permissions_json.has_hiring_access=true;
      if (!Object.hasOwn(displayDefaults.permissions_json,'has_outreach_access') && ['admin','support'].includes(displayDefaults.role)) displayDefaults.permissions_json.has_outreach_access=true;
    }
    if (!activeMember && inherited && !profile.role_override) resolved.roleSource='platform_default';
    return { ...resolved, agencyId: Number(agencyId), userId: Number(userId), revision: Number(profile.revision),
      platformRole: base.platform_role, platformDefaults: displayDefaults, membership: !!activeMember,
      overrides: jsonAccess(profile.permissions_overrides), roleOverride: profile.role_override || null,
      platformAccessOnly: !activeMember && !!inherited, financialAccessOnly: !activeMember && !inherited && managed,
      legacyAccessOnly: !activeMember && !inherited && !managed && legacy,
      baseline: { role: profile.role_baseline, permissions: jsonAccess(profile.permissions_baseline) } };
  } catch (error) {
    if (knownSchemaError(error)) return null; // Old release during migration rollout only.
    throw error;
  }
}

export async function accessProfileSchemaReady(db = pool) {
  const [[row]] = await db.execute(`SELECT COUNT(*) AS count FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_agency_access_profiles'`);
  if (Number(row?.count)!==1) return false;
  try {
    const [[rollout]]=await db.execute('SELECT enabled FROM user_agency_access_rollout WHERE id=1');
    return accessEnabled(rollout?.enabled);
  } catch(error) { if(knownSchemaError(error))return false;throw error; }
}

export async function listPlatformAccessAgencies(userId, db = pool) {
  try {
    const defaults = await platformAccessDefaults(userId, db);
    if (!defaults?.enabled) return [];
    const [rows] = await db.execute(`SELECT a.id,a.name,a.slug,a.portal_url,a.organization_type,a.is_active,a.is_archived,
      a.color_palette,a.logo_url,a.logo_path,a.feature_flags,1 AS is_platform_access_only FROM agencies a
      WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND a.organization_type IN (${COMPANY_TYPES.map(() => '?').join(',')})
      AND NOT EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=? AND ua.agency_id=a.id AND COALESCE(ua.is_active,1)=1)
      ORDER BY a.name`, [...COMPANY_TYPES, userId]);
    return rows;
  } catch (error) { if (knownSchemaError(error)) return []; throw error; }
}

export async function listLegacyAccessAgencies(userId, db = pool) {
  try {
    const [rows] = await db.execute(`SELECT a.id,a.name,a.slug,a.portal_url,a.organization_type,a.is_active,a.is_archived,
      a.color_palette,a.logo_url,a.logo_path,a.feature_flags,p.effective_permissions,1 AS is_legacy_access_only
      FROM agencies a JOIN user_agency_access_profiles p ON p.agency_id=a.id AND p.user_id=?
      WHERE p.access_origin='legacy_tenant_grant' AND a.organization_type IN (${COMPANY_TYPES.map(()=>'?').join(',')})
        AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,[userId,...COMPANY_TYPES]);
    return rows.filter(row=>Object.values(jsonAccess(row.effective_permissions)).some(accessEnabled))
      .map(({effective_permissions,...row})=>row);
  } catch (error) { if (knownSchemaError(error)) return []; throw error; }
}

export async function ensurePlatformCompanyProfiles(agencyId, db = pool) {
  const [employees] = await db.execute(`SELECT d.user_id FROM user_platform_access_defaults d
    JOIN users u ON u.id=d.user_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
    JOIN user_agencies pt ON pt.user_id=d.user_id AND pt.agency_id=? AND COALESCE(pt.is_active,1)=1
    LEFT JOIN user_agency_access_profiles p ON p.user_id=d.user_id AND p.agency_id=?
    WHERE d.enabled=1 AND p.user_id IS NULL`,[PLATFORM_DEFAULTS_AGENCY_ID,agencyId]);
  for (const employee of employees) await readAgencyAccess(employee.user_id,agencyId,db);
}

async function actorMayEdit(actorUserId, agencyId, db) {
  const [[actor]] = await db.execute('SELECT id,role,status,is_active,is_archived FROM users WHERE id=? LIMIT 1', [actorUserId]);
  if (!actor || !accessEnabled(actor.is_active) || accessEnabled(actor.is_archived)
      || !['ACTIVE','ACTIVE_EMPLOYEE','COMPLETED'].includes(String(actor.status).toUpperCase())) throw fail(403, 'Active administrator access is required.');
  if (actor.role === 'super_admin') return actor;
  const access = await readAgencyAccess(actorUserId, agencyId, db);
  if (access?.role !== 'admin') throw fail(403, 'Only an administrator for this company or a superadmin can change permissions.');
  return actor;
}

async function retainProfile(userId, agencyId, db) {
  const base = await baseline(userId, agencyId, db);
  if (!base) throw fail(404, 'Employee or company not found.');
  await db.execute(`INSERT IGNORE INTO user_agency_access_profiles
    (user_id,agency_id,role_baseline,permissions_baseline,permissions_overrides,effective_role,effective_permissions)
    VALUES (?,?,?,?,JSON_OBJECT(),?,?)`, [userId, agencyId, base.role_baseline, JSON.stringify(base.permissions_baseline), base.role_baseline, JSON.stringify(base.permissions_baseline)]);
}

async function materialize(userId, agencyId, defaults, db) {
  const [[profile]] = await db.execute('SELECT * FROM user_agency_access_profiles WHERE user_id=? AND agency_id=? FOR UPDATE', [userId, agencyId]);
  if (!profile) return;
  const effective = resolveAgencyAccess(profile, defaults);
  await db.execute('UPDATE user_agency_access_profiles SET effective_role=?,effective_permissions=? WHERE user_id=? AND agency_id=?',
    [effective.role, JSON.stringify(effective.permissions), userId, agencyId]);
  // Existing finance consumers retain their agency-specific columns. Never
  // update users.role or global flags when editing one company's access.
  await db.execute(`UPDATE user_agencies SET agency_role=?,has_payroll_access=?,has_billing_access=?,has_department_access=?,
    can_manage_credentialing=?,is_marketing_contact=? WHERE user_id=? AND agency_id=?`,
    [effective.role, ...[...membershipFields].map(key => effective.permissions[key] ? 1 : 0), userId, agencyId]);
}

export async function saveAgencyAccess({ actorUserId, userId, agencyId, input }, dbPool = pool) {
  validateAgencyAccessPatch(input);
  if (!await accessProfileSchemaReady(dbPool)) throw fail(503,'Agency access controls are not available yet. Please try again shortly.');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT user_id FROM user_platform_access_defaults WHERE user_id=? FOR UPDATE',[userId]);
    await actorMayEdit(actorUserId, agencyId, db);
    const before = await readAgencyAccess(userId, agencyId, db);
    if (!before) throw fail(404, 'An active affiliation or selected platform default is required for this company.');
    if (!isStaffAccount({role:before.platformRole})) throw fail(400,'Company working roles are for employee accounts.');
    await retainProfile(userId, agencyId, db);
    const [[profile]] = await db.execute('SELECT * FROM user_agency_access_profiles WHERE user_id=? AND agency_id=? FOR UPDATE', [userId, agencyId]);
    if (before.revision !== input.revision || (input.revision && Number(profile.revision) !== input.revision)) throw fail(409, 'Access settings changed. Refresh before saving.');
    const overrides = { ...jsonAccess(profile.permissions_overrides) };
    for (const [key, value] of Object.entries(input.permissions || {})) {
      if (value === null) delete overrides[key]; else overrides[key] = value;
    }
    const role = Object.hasOwn(input, 'role') ? input.role : profile.role_override;
    await db.execute('UPDATE user_agency_access_profiles SET role_override=?,permissions_overrides=?,revision=revision+1 WHERE user_id=? AND agency_id=?',
      [role, JSON.stringify(overrides), userId, agencyId]);
    await materialize(userId, agencyId, before.platformDefaults, db);
    const after = await readAgencyAccess(userId, agencyId, db);
    await db.execute(`INSERT INTO user_agency_access_audit (user_id,agency_id,actor_user_id,scope,before_json,after_json) VALUES (?,?,?,'agency',?,?)`,
      [userId, agencyId, actorUserId, JSON.stringify(before), JSON.stringify(after)]);
    await db.commit();
    queueMembershipSync(userId,dbPool);
    return after;
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}

export async function savePlatformAccessDefaults({ actorUserId, userId, input }, dbPool = pool) {
  validateAgencyAccessPatch(input, { platform: true });
  if (!await accessProfileSchemaReady(dbPool)) throw fail(503,'Agency access controls are not available yet. Please try again shortly.');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const actor = await actorMayEdit(actorUserId, PLATFORM_DEFAULTS_AGENCY_ID, db);
    if (actor.role !== 'super_admin') throw fail(403, 'Only superadmins can assign platform defaults.');
    const [[eligible]] = await db.execute(`SELECT u.id,u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE u.id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
        AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','COMPLETED') LIMIT 1`, [userId, PLATFORM_DEFAULTS_AGENCY_ID]);
    if (!eligible || !isStaffAccount(eligible)) throw fail(403, 'Platform defaults require an active PlotTwistCo employee affiliation.');
    const [[before]] = await db.execute('SELECT * FROM user_platform_access_defaults WHERE user_id=? FOR UPDATE', [userId]);
    if (Number(before?.revision || 0) !== input.revision) throw fail(409, 'Platform defaults changed. Refresh before saving.');
    const permissions = { ...jsonAccess(before?.permissions_json) };
    for (const [key, value] of Object.entries(input.permissions || {})) {
      if (value === null) delete permissions[key]; else permissions[key] = value;
    }
    const enabled = input.enabled ?? accessEnabled(before?.enabled);
    const role = Object.hasOwn(input, 'role') ? input.role : before?.role || null;
    if(enabled && !role && !Object.values(permissions).some(accessEnabled))throw fail(400,'Select a working role or at least one enabled permission for platform company access.');
    const services={...jsonAccess(before?.platform_services_json),...(input.platformServices || {})};
    await db.execute(`INSERT INTO user_platform_access_defaults (user_id,enabled,role,permissions_json,platform_services_json,updated_by_user_id)
      VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),role=VALUES(role),permissions_json=VALUES(permissions_json),platform_services_json=VALUES(platform_services_json),
      revision=revision+1,updated_by_user_id=VALUES(updated_by_user_id)`, [userId, enabled ? 1 : 0, role, JSON.stringify(permissions), Object.keys(services).length ? JSON.stringify(services) : null, actorUserId]);
    const [companies] = await db.execute(`SELECT id FROM agencies WHERE organization_type IN (${COMPANY_TYPES.map(() => '?').join(',')})`, COMPANY_TYPES);
    const defaults = { enabled, role, permissions_json: permissions };
    if (input.platformServices && Object.keys(input.platformServices).length) {
      const keys = Object.keys(input.platformServices);
      await db.execute(`UPDATE users SET ${keys.map(key=>`${key}=?`).join(',')} WHERE id=?`, [...keys.map(key=>input.platformServices[key]?1:0),userId]);
    }
    for (const company of companies) {
      await retainProfile(userId, company.id, db);
      await materialize(userId, company.id, defaults, db);
    }
    await db.execute(`INSERT INTO user_agency_access_audit (user_id,agency_id,actor_user_id,scope,before_json,after_json) VALUES (?,NULL,?,'platform_defaults',?,?)`,
      [userId, actorUserId, JSON.stringify(before || {}), JSON.stringify({...defaults,platformServices:input.platformServices || {}})]);
    await db.commit();
    queueMembershipSync(userId,dbPool);
    return defaults;
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}

export async function listAgencyAccessCards({ actorUserId, userId }, db = pool) {
  if (!await accessProfileSchemaReady(db)) throw fail(503,'Agency access controls are not available yet. Please try again shortly.');
  const [[actor]] = await db.execute('SELECT id,role FROM users WHERE id=? LIMIT 1', [actorUserId]);
  if (!actor) throw fail(403, 'Sign in to review permissions.');
  const [memberships] = await db.execute(`SELECT a.*,ua.is_active AS membership_active FROM user_agencies ua
    JOIN agencies a ON a.id=ua.agency_id WHERE ua.user_id=? AND a.organization_type IN (${COMPANY_TYPES.map(()=>'?').join(',')}) ORDER BY a.name`, [userId,...COMPANY_TYPES]);
  const [legacy] = await db.execute(`SELECT a.*,1 AS is_legacy_access_only FROM agencies a JOIN user_agency_access_profiles p ON p.agency_id=a.id
    WHERE p.user_id=? AND p.access_origin='legacy_tenant_grant' AND a.organization_type IN (${COMPANY_TYPES.map(()=>'?').join(',')}) AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,[userId,...COMPANY_TYPES]);
  const defaults=await platformAccessDefaults(userId,db),managed=await managedBillingAgencies(userId,db);
  const [profiles]=await db.execute('SELECT * FROM user_agency_access_profiles WHERE user_id=?',[userId]);
  const cached={defaults,managed,profiles:new Map(profiles.map(p=>[Number(p.agency_id),p]))};
  const extra = [...await listPlatformAccessAgencies(userId, db), ...managed,...legacy];
  const companies = [...new Map([...extra,...memberships].map(a=>[Number(a.id),a])).values()];
  const cards = [];
  for (const agency of companies) {
    let canEdit = actor.role === 'super_admin';
    const actorAccess = canEdit ? null : await readAgencyAccess(actorUserId, agency.id, db);
    canEdit ||= actorAccess?.role === 'admin';
    if (!canEdit && Number(actorUserId) !== Number(userId)) continue;
    cards.push({ agency: { id: agency.id, name: agency.name, slug: agency.slug, color_palette: agency.color_palette,
      organization_type: agency.organization_type, membership_active: agency.membership_active, platformAccessOnly: !!agency.is_platform_access_only },
      access: await readAgencyAccess(userId, agency.id, db,cached), canEdit });
  }
  const [[eligible]] = await db.execute(`SELECT 1 AS eligible FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE u.id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
    AND u.role IN (${STAFF_ROLES.map(()=>'?').join(',')}) AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','COMPLETED') LIMIT 1`, [userId, PLATFORM_DEFAULTS_AGENCY_ID,...STAFF_ROLES]);
  if (!cards.length && Number(actorUserId)!==Number(userId) && actor.role!=='super_admin') throw fail(403,'You do not administer any of this person’s companies.');
  const [[services]] = await db.execute('SELECT has_platform_support,has_platform_gear_access FROM users WHERE id=? LIMIT 1',[userId]);
  return { cards, fields: AGENCY_ACCESS_FIELDS, roles: AGENCY_ACCESS_ROLES,
    platform: { eligible: !!eligible, canEdit: actor.role === 'super_admin' && !!eligible,
      serviceFields:PLATFORM_SERVICE_FIELDS,services:services || {},
      defaults: await platformAccessDefaults(userId, db) || { enabled: false, role: null, permissions_json: {}, revision: 0 } } };
}

export async function agencyIdsWithPermission(userId, key, db = pool) {
  const [rows] = await db.execute(`SELECT p.agency_id FROM user_agency_access_profiles p JOIN agencies a ON a.id=p.agency_id
    JOIN users u ON u.id=p.user_id
    WHERE p.user_id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE_EMPLOYEE','TERMINATED','INACTIVE')
    AND JSON_EXTRACT(p.effective_permissions,?)=TRUE
    AND (p.access_origin='legacy_tenant_grant' OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=p.user_id AND ua.agency_id=p.agency_id AND COALESCE(ua.is_active,1)=1)
      OR EXISTS(SELECT 1 FROM user_platform_access_defaults d JOIN user_agencies pt ON pt.user_id=d.user_id AND pt.agency_id=? AND COALESCE(pt.is_active,1)=1 WHERE d.user_id=p.user_id AND d.enabled=1))`,
  [userId, `$.${key}`, PLATFORM_DEFAULTS_AGENCY_ID]);
  return rows.map(row => Number(row.agency_id));
}

export async function filterBillingAgencyOverrides(userId, agencyIds, db = pool) {
  if (!agencyIds.length || !await accessProfileSchemaReady(db)) return agencyIds;
  const [denied] = await db.execute(`SELECT p.agency_id FROM user_agency_access_profiles p
    LEFT JOIN user_platform_access_defaults d ON d.user_id=p.user_id AND d.enabled=1
    LEFT JOIN user_agencies pt ON pt.user_id=p.user_id AND pt.agency_id=? AND COALESCE(pt.is_active,1)=1
    WHERE p.user_id=? AND (JSON_EXTRACT(p.permissions_overrides,'$.has_billing_access')=FALSE
      OR (pt.user_id IS NOT NULL AND JSON_EXTRACT(d.permissions_json,'$.has_billing_access')=FALSE
        AND JSON_EXTRACT(p.permissions_overrides,'$.has_billing_access') IS NULL))`,[PLATFORM_DEFAULTS_AGENCY_ID,userId]);
  const ids=new Set(denied.map(row=>Number(row.agency_id)));
  return agencyIds.filter(agencyId=>!ids.has(Number(agencyId)));
}

// Removing a PlotTwistCo affiliation suspends its defaults everywhere in the
// same transaction. Keep the selected settings so reactivation can restore
// them, while leaving every deliberate company override intact.
export async function refreshPlatformAccessEligibility(userId, database = null) {
  const db=database || await pool.getConnection();
  try {
    if(!await accessProfileSchemaReady(db))return;
    if(!database)await db.beginTransaction();
    const [[stored]]=await db.execute('SELECT * FROM user_platform_access_defaults WHERE user_id=? FOR UPDATE',[userId]);
    if(!stored){if(!database)await db.commit();return;}
    const eligible=await platformAccessDefaults(userId,db);
    const [profiles]=await db.execute('SELECT agency_id FROM user_agency_access_profiles WHERE user_id=?',[userId]);
    for(const profile of profiles)await materialize(userId,profile.agency_id,eligible,db);
    const services=jsonAccess(stored.platform_services_json);
    const keys=PLATFORM_SERVICE_FIELDS.map(f=>f.key).filter(key=>Object.hasOwn(services,key));
    if(keys.length)await db.execute(`UPDATE users SET ${keys.map(key=>`${key}=?`).join(',')} WHERE id=?`,[...keys.map(key=>eligible&&services[key]?1:0),userId]);
    await db.execute(`INSERT INTO user_agency_access_audit (user_id,agency_id,actor_user_id,scope,before_json,after_json)
      VALUES (?,NULL,0,'platform_eligibility',?,?)`,[userId,JSON.stringify({selected:stored}),JSON.stringify({eligible:!!eligible})]);
    if(!database)await db.commit();
  }catch(error){if(!database)await db.rollback();throw error;}finally{if(!database)db.release();}
}

export async function changePlatformAffiliation(userId,{remove=false,active=true}={},dbPool=pool) {
  const db=await dbPool.getConnection();
  try{
    await db.beginTransaction();
    await db.execute('SELECT user_id FROM user_platform_access_defaults WHERE user_id=? FOR UPDATE',[userId]);
    if(remove)await db.execute('DELETE FROM user_agencies WHERE user_id=? AND agency_id=?',[userId,PLATFORM_DEFAULTS_AGENCY_ID]);
    else await db.execute('UPDATE user_agencies SET is_active=? WHERE user_id=? AND agency_id=?',[active?1:0,userId,PLATFORM_DEFAULTS_AGENCY_ID]);
    await refreshPlatformAccessEligibility(userId,db);
    const [[membership]]=await db.execute('SELECT * FROM user_agencies WHERE user_id=? AND agency_id=?',[userId,PLATFORM_DEFAULTS_AGENCY_ID]);
    await db.commit();queueMembershipSync(userId,dbPool);return membership || null;
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}
