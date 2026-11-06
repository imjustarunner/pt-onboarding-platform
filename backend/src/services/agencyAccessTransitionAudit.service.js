import { readFile } from 'node:fs/promises';
import { splitSqlStatements } from '../../../database/migrationSqlUtils.js';
import { AGENCY_ACCESS_FIELDS, accessEnabled, jsonAccess } from '../utils/agencyAccessPolicy.js';
import { STAFF_ROLES } from '../utils/staffEligibility.js';

const membershipKeys=new Set(['has_payroll_access','has_billing_access','has_department_access','can_manage_credentialing','is_marketing_contact']);
const key=row=>`${row.user_id}:${row.agency_id}`;

export async function captureAgencyAccessState(db) {
  const [users]=await db.execute(`SELECT id,first_name,last_name,role,status,is_active,is_archived,
    ${AGENCY_ACCESS_FIELDS.filter(f=>!membershipKeys.has(f.key)).map(f=>f.key).join(',')},has_platform_support,has_platform_gear_access FROM users ORDER BY id`);
  const [memberships]=await db.execute('SELECT * FROM user_agencies ORDER BY user_id,agency_id');
  const [agencies]=await db.execute('SELECT id,organization_type FROM agencies ORDER BY id');
  const [affiliations]=await db.execute('SELECT id,agency_id,organization_id,is_active FROM organization_affiliations ORDER BY id');
  return {capturedAt:new Date().toISOString(),users,memberships,agencies,affiliations};
}

export function legacyCredentialCoverage(state) {
  const agencies=new Map(state.agencies.map(a=>[Number(a.id),a]));
  const links=state.affiliations.filter(a=>a.is_active===null || accessEnabled(a.is_active));
  const coverage=new Set();
  for(const membership of state.memberships.filter(m=>accessEnabled(m.can_manage_credentialing)&&m.is_active!==0)) {
    const agency=agencies.get(Number(membership.agency_id));if(!agency)continue;
    const root=['agency','clubwebapp','life_coach','consultant'].includes(agency.organization_type)?Number(agency.id)
      :Number(links.find(a=>Number(a.organization_id)===Number(agency.id))?.agency_id || agency.id);
    for(const target of [root,...links.filter(a=>Number(a.agency_id)===root).map(a=>Number(a.organization_id))]) {
      if(agencies.has(target))coverage.add(`${membership.user_id}:${target}`);
    }
  }
  return coverage;
}

export function reconcileAgencyAccessState(before, after, profiles) {
  const errors=[];
  if(JSON.stringify(before.users)!==JSON.stringify(after.users))errors.push('User records changed during the migration.');
  if(JSON.stringify(before.memberships)!==JSON.stringify(after.memberships))errors.push('Agency affiliations or existing membership settings changed during the migration.');
  const users=new Map(before.users.map(u=>[Number(u.id),u]));
  const found=new Map(profiles.map(p=>[key(p),p]));
  const credentials=legacyCredentialCoverage(before);
  for(const member of before.memberships) {
    const user=users.get(Number(member.user_id));if(!user)continue;
    const profile=found.get(key(member));
    if(!profile){errors.push(`Missing access profile ${key(member)}.`);continue;}
    const role=member.agency_role || user.role || 'provider';
    if(profile.role_baseline!==role)errors.push(`Role mismatch ${key(member)}.`);
    const permissions=jsonAccess(profile.permissions_baseline);
    for(const {key:field} of AGENCY_ACCESS_FIELDS) {
      let expected=accessEnabled(membershipKeys.has(field)?member[field]:user[field]);
      if(field==='has_hiring_access')expected ||= ['admin','super_admin','support','staff'].includes(user.role)||['admin','support','staff'].includes(member.agency_role);
      if(field==='has_outreach_access')expected ||= ['admin','super_admin','support'].includes(user.role)||['admin','support'].includes(member.agency_role);
      if(field==='can_manage_credentialing')expected ||= credentials.has(key(member));
      if(accessEnabled(permissions[field])!==expected)errors.push(`Permission mismatch ${key(member)} ${field}.`);
    }
  }
  for(const grant of credentials)if(!found.has(grant))errors.push(`Missing preserved credentialing scope ${grant}.`);
  const staff=before.users.filter(u=>STAFF_ROLES.includes(u.role));
  const unaffiliated=staff.filter(u=>!before.memberships.some(m=>Number(m.user_id)===Number(u.id)))
    .map(u=>({id:u.id,name:`${u.first_name||''} ${u.last_name||''}`.trim(),status:u.status}));
  return {ok:errors.length===0,errors,users:before.users.length,employeeRecords:staff.length,
    employeeMemberships:before.memberships.filter(m=>staff.some(u=>Number(u.id)===Number(m.user_id))).length,
    memberships:before.memberships.length,profiles:profiles.length,preservedCredentialingScopes:credentials.size,unaffiliated};
}

export async function activateAgencyAccessProfiles(db,{expectedDatabase,actorUserId=0}={}) {
  const [[database]]=await db.execute('SELECT DATABASE() AS name');
  if(!expectedDatabase || database.name!==expectedDatabase)throw new Error('The selected database does not match --expected-database.');
  await db.beginTransaction();
  try {
    const [[rollout]]=await db.execute('SELECT enabled FROM user_agency_access_rollout WHERE id=1 FOR UPDATE');
    if(accessEnabled(rollout?.enabled)){await db.commit();return {alreadyActive:true};}
    if(actorUserId){const [[actor]]=await db.execute('SELECT role,is_active FROM users WHERE id=?',[actorUserId]);if(actor?.role!=='super_admin'||!accessEnabled(actor.is_active))throw new Error('A supplied audit actor must be an active superadmin.');}
    const [[edited]]=await db.execute(`SELECT COUNT(*) AS count FROM user_agency_access_profiles
      WHERE revision>1 OR JSON_LENGTH(permissions_overrides)>0`);
    const [[defaults]]=await db.execute('SELECT COUNT(*) AS count FROM user_platform_access_defaults WHERE enabled=1');
    if(Number(edited.count)||Number(defaults.count))throw new Error('Access settings have already been edited. Preserve and reconcile them before activating.');
    // Lock the legacy source rows briefly so a last-minute profile edit cannot
    // be missed between reconciliation and activation.
    await db.execute('SELECT id FROM users ORDER BY id FOR UPDATE');
    await db.execute('SELECT user_id,agency_id FROM user_agencies ORDER BY user_id,agency_id FOR UPDATE');
    const before=await captureAgencyAccessState(db);
    const [oldProfiles]=await db.execute('SELECT * FROM user_agency_access_profiles ORDER BY user_id,agency_id');
    const sql=await readFile(new URL('../../../database/migrations/1771_user_agency_access_profiles.sql',import.meta.url),'utf8');
    const statements=splitSqlStatements(sql);
    const initial=statements.find(statement=>statement.includes('FROM users u JOIN user_agencies ua ON ua.user_id=u.id'));
    if(!initial)throw new Error('Membership snapshot statement was not found.');
    await db.execute(`UPDATE user_agency_access_profiles SET permissions_baseline=JSON_OBJECT(),effective_permissions=JSON_OBJECT()
      WHERE access_origin='legacy_tenant_grant'`);
    const refresh=initial.replace(/;\s*$/,'').replace('INSERT IGNORE INTO','INSERT INTO')+` WHERE 1 ON DUPLICATE KEY UPDATE
      role_baseline=VALUES(role_baseline),permissions_baseline=VALUES(permissions_baseline),role_override=VALUES(role_override),
      effective_role=VALUES(effective_role),effective_permissions=VALUES(effective_permissions)`;
    await db.query(refresh);
    for(const statement of statements.filter(statement=>statement.includes('WITH credential_seeds AS')))await db.query(statement);
    const after=await captureAgencyAccessState(db);
    const [profiles]=await db.execute('SELECT * FROM user_agency_access_profiles ORDER BY user_id,agency_id');
    const report=reconcileAgencyAccessState(before,after,profiles);
    if(!report.ok)throw Object.assign(new Error(`Access reconciliation failed: ${report.errors.slice(0,8).join(' ')}`),{report});
    const previous=new Map(oldProfiles.map(p=>[key(p),p]));
    for(const profile of profiles)await db.execute(`INSERT INTO user_agency_access_audit
      (user_id,agency_id,actor_user_id,scope,before_json,after_json) VALUES (?,?,?,'migration_activation',?,?)`,
      [profile.user_id,profile.agency_id,actorUserId,JSON.stringify(previous.get(key(profile))||{}),JSON.stringify(profile)]);
    await db.execute('UPDATE user_agency_access_rollout SET enabled=1,activated_by_user_id=?,activated_at=UTC_TIMESTAMP() WHERE id=1',[actorUserId||null]);
    await db.commit();return {report,before,after,profiles};
  }catch(error){await db.rollback();throw error;}
}
