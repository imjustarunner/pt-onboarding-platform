import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import StorageService from './storage.service.js';
import { AGENCY_ACCESS_FIELDS, jsonAccess } from '../utils/agencyAccessPolicy.js';
import { accessProfileSchemaReady } from './agencyAccessProfiles.service.js';

const failure = (status, message) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(value).digest('hex');
const normalized = value => String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
const supportedPersonal = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i;
const targetCompanies = Object.freeze(['itsco', 'nlu', 'tisi']);
const jobRoles = Object.freeze({ billing: 'billing', people_operations: 'people_operations' });
const keepWorkClassification = new Set(['is_hourly_worker']);

async function campaignInput(config) {
  const object = String(config.EMPLOYMENT_NOTICE_CAMPAIGN_OBJECT || '');
  const expectedHash = config.EMPLOYMENT_NOTICE_CAMPAIGN_SHA256;
  if (!/^private-employment-notices\/[a-f0-9]{32}\.json$/.test(object) || !/^[a-f0-9]{64}$/.test(expectedHash || '')) {
    throw failure(503, 'The approved campaign configuration is unavailable.');
  }
  const bucket = await StorageService.getGCSBucket();
  const [file] = await bucket.file(object).download({ validation: 'crc32c' });
  if (file.length > 40000 || hash(file) !== expectedHash) throw failure(503, 'The approved campaign content could not be verified.');
  const input = JSON.parse(file.toString('utf8'));
  if (input.version !== config.EMPLOYMENT_NOTICE_DELIVERY_VERSION || input.targets?.length !== 4
    || new Set(input.targets.map(target => target.team)).size !== 3
    || input.targets.filter(target => target.team === 'billing').length !== 1
    || input.targets.filter(target => target.team === 'people_operations').length !== 1
    || input.targets.filter(target => target.team === 'notice_only').length !== 2
    || input.targets.some(target => !Number.isSafeInteger(target.userId) || target.userId < 1 || !target.first || !target.last)
    || !Array.isArray(input.workDomains) || !input.letter || !input.subject || input.contact !== 'founders@itsco.health') throw failure(503, 'Invalid campaign content.');
  return input;
}

async function resolveAccounts(input, db, lock = false) {
  const output = [];
  for (const target of input.targets) {
    const [rows] = await db.execute(
      `SELECT id,first_name,last_name,role,status,is_active,is_archived,identity_product,email,work_email,personal_email,
          login_is_group_email,sso_password_override,(password_hash IS NOT NULL AND password_hash<>'') AS has_app_password
         FROM users WHERE id=? AND LOWER(TRIM(first_name))=? AND REGEXP_REPLACE(LOWER(TRIM(last_name)),'[^a-z]','')=?
         AND COALESCE(is_demo,0)=0 AND COALESCE(is_assistant_account,0)=0
         ${lock ? 'FOR UPDATE' : ''}`,
      [target.userId, normalized(target.first), normalized(target.last)]
    );
    if (rows.length !== 1) throw failure(409, 'An approved employee account could not be uniquely matched.');
    const current = rows[0];
    const personal = String(current.personal_email || '').trim().toLowerCase();
    const workEmail = String(current.work_email || '').trim().toLowerCase();
    const knownWorkDomains = [...input.workDomains, workEmail.split('@')[1]];
    const isPersonal = supportedPersonal.test(personal) && personal !== workEmail && !knownWorkDomains.includes(personal.split('@')[1]);
    output.push({ ...current, team: target.team, personal, isPersonal });
  }
  if (new Set(output.map(account => account.id)).size !== 4) throw failure(409, 'The campaign needs four distinct employee accounts.');
  return output;
}

async function resolveCompanies(db) {
  const [rows] = await db.execute(
    `SELECT id,slug,name FROM agencies WHERE slug IN ('itsco','nlu','tisi') AND is_active=1 AND COALESCE(is_archived,0)=0
     AND organization_type IN ('agency','clubwebapp','life_coach','consultant')`
  );
  if (rows.length !== targetCompanies.length || new Set(rows.map(row => row.slug)).size !== targetCompanies.length) {
    throw failure(409, 'The three approved companies could not be uniquely matched.');
  }
  return rows;
}

async function preflight(input, db) {
  const accounts = await resolveAccounts(input, db);
  const ids = accounts.map(account => account.id);
  const [memberships] = await db.execute(
    `SELECT m.user_id,a.slug,a.organization_type,
          COALESCE(p.effective_role,m.agency_role,u.role) AS company_role,
          COALESCE(JSON_EXTRACT(p.effective_permissions,'$.has_billing_access'),m.has_billing_access) AS billing,
          JSON_EXTRACT(p.effective_permissions,'$.has_hiring_access') AS hiring,
          JSON_EXTRACT(p.effective_permissions,'$.has_payroll_access') AS payroll,
          JSON_EXTRACT(a.feature_flags,'$.googleSsoEnabled') AS google_sso
      FROM users u JOIN user_agencies m ON m.user_id=u.id JOIN agencies a ON a.id=m.agency_id
      LEFT JOIN user_agency_access_profiles p ON p.user_id=m.user_id AND p.agency_id=a.id
      WHERE m.user_id IN (?,?,?,?) AND COALESCE(m.is_active,1)=1 ORDER BY m.user_id,a.slug`, ids
  );
  const [activity] = await db.execute(
    `WITH recent AS (
      SELECT user_id,action_type,agency_id,created_at,JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.loginType')) login_method,
             LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.path')),'')) AS activity_path
        FROM user_activity_log WHERE user_id IN (?,?,?,?) AND created_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY
     )
     SELECT r.user_id, COALESCE(a.slug,'unscoped') AS agency,
       CASE WHEN r.action_type='login' THEN CONCAT('login:',IF(login_method IN ('google_oauth','password','passkey','passwordless'),login_method,'other'))
         WHEN activity_path REGEXP 'billing|claim|remitt' THEN 'billing'
         WHEN activity_path REGEXP 'hiring|people|onboard|pre-hire|credential' THEN 'hiring_onboarding'
         WHEN activity_path REGEXP 'payroll|fundthred|time-card|timecard' THEN 'payroll_time'
         WHEN activity_path REGEXP 'schedul|appointment|calendar|meetings' THEN 'scheduling'
         WHEN activity_path REGEXP 'messages|conversa|communications|inbox|ticket' THEN 'messages_tickets'
         WHEN activity_path REGEXP 'client|students|chart' THEN 'client_work'
         ELSE 'other_activity' END AS category,
       COUNT(*) AS events,COUNT(DISTINCT DATE(created_at)) AS days
       FROM recent r LEFT JOIN agencies a ON a.id=r.agency_id
       GROUP BY r.user_id,agency,category ORDER BY r.user_id,events DESC`, ids
  );
  const [roles] = await db.execute(
    `SELECT user_id,enabled,role FROM user_platform_access_defaults WHERE user_id IN (?,?,?,?)`, ids
  );
  return {
    accounts: accounts.map(account => ({
      id: account.id, name: `${account.first_name} ${account.last_name}`, status: account.status,
      active: account.is_active, product: account.identity_product, role: account.role,
      personalEmailAvailable: account.isPersonal, groupLogin: account.login_is_group_email,
      passwordOverride: account.sso_password_override, passwordAvailable: account.has_app_password, team: account.team
    })),
    companies: await resolveCompanies(db),
    agencyAccessReady: await accessProfileSchemaReady(db),
    memberships, activity, roles
  };
}

async function stage(input, actor, db) {
  const accounts = await resolveAccounts(input, db, true);
  await resolveCompanies(db);
  if (!await accessProfileSchemaReady(db)) throw failure(409, 'Scoped company access is unavailable.');
  if (accounts.some(account => !account.is_active || account.is_archived || account.identity_product !== 'full_suite')) {
    throw failure(409, 'The confirmed campaign needs active full-suite accounts.');
  }
  const mailboxes = accounts.filter(account => account.isPersonal).map(account => account.personal);
  if (new Set(mailboxes).size !== mailboxes.length) throw failure(409, 'The campaign personal mailboxes must be distinct.');
  const [result] = await db.execute(
    `INSERT INTO employment_notices(version,subject,letter,contact_email,publish_at,restrict_from,restrict_until,link_until)
     VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
    [input.version, input.subject, input.letter, input.contact, ...[input.publishAt, input.restrictFrom, input.restrictUntil, input.linkUntil].map(value => new Date(value))]
  );
  const noticeId = result.insertId;
  for (const account of accounts) {
    await db.execute('INSERT IGNORE INTO employment_notice_recipients (notice_id,user_id) VALUES (?,?)', [noticeId, account.id]);
    if (account.isPersonal) await db.execute(
      'INSERT IGNORE INTO employment_notice_mail (notice_id,user_id,personal_email_digest) VALUES (?,?,UNHEX(?))',
      [noticeId, account.id, hash(account.personal)]
    );
    await db.execute(
      `INSERT IGNORE INTO employment_notice_automation_audit (notice_id,user_id,operation,automation_identity,result)
       VALUES (?,?,'staged',?,JSON_OBJECT('team',?,'personalMailQueued',CAST(? AS JSON)))`,
      [noticeId, account.id, actor, account.team, JSON.stringify(account.isPersonal)]
    );
  }
  return { noticeId, recipients: accounts.length, queued: mailboxes.length };
}

async function restrictToCompanies(account, companies, noticeId, actor, db) {
  const [done] = await db.execute(
    "SELECT operation FROM employment_notice_automation_audit WHERE notice_id=? AND user_id=? AND operation='permissions_applied' FOR UPDATE",
    [noticeId, account.id]
  );
  if (done.length) return false;
  const companyIds = companies.map(company => company.id);
  const [beforeMemberships] = await db.execute(
    'SELECT agency_id,is_active,is_default,agency_role,has_billing_access,has_payroll_access,has_department_access,can_manage_credentialing,is_marketing_contact FROM user_agencies WHERE user_id=? FOR UPDATE',
    [account.id]
  );
  const [beforeProfiles] = await db.execute(
    'SELECT agency_id,role_override,permissions_overrides,effective_role,effective_permissions,access_origin FROM user_agency_access_profiles WHERE user_id=? FOR UPDATE',
    [account.id]
  );
  const [[beforePlatform]] = await db.execute(
    'SELECT enabled,role,permissions_json,platform_services_json FROM user_platform_access_defaults WHERE user_id=? FOR UPDATE',
    [account.id]
  );
  const [managed] = await db.execute(
    `SELECT DISTINCT agency_id FROM agency_billing_management WHERE is_active=1
     AND manager_agency_id IN (?,?,?) AND agency_id NOT IN (?,?,?)`,
    [...companyIds, ...companyIds]
  );
  const leaveDefault = beforeMemberships.find(item => item.is_default && companyIds.includes(item.agency_id))?.agency_id
    ?? companies.find(item => item.slug === 'itsco').id;
  await db.execute(
    `UPDATE user_agencies SET is_active=0,is_default=0,has_billing_access=0,has_payroll_access=0,
       has_department_access=0,can_manage_credentialing=0,is_marketing_contact=0
     WHERE user_id=? AND agency_id NOT IN (?,?,?)`, [account.id, ...companyIds]
  );
  await db.execute(
    'UPDATE user_platform_access_defaults SET enabled=0,updated_by_user_id=NULL,revision=revision+1 WHERE user_id=? AND enabled=1',
    [account.id]
  );
  // Use a non-privileged global role with explicit company administrator roles.
  // The selected company role remains the effective role on protected routes.
  await db.execute("UPDATE users SET role='staff' WHERE id=? AND role IN ('super_admin','admin','support')", [account.id]);

  const outside = new Set([
    ...beforeProfiles.filter(item => !companyIds.includes(item.agency_id)).map(item => item.agency_id),
    ...managed.map(item => item.agency_id)
  ]);
  for (const agencyId of [...companyIds, ...outside]) {
    const allowed = companyIds.includes(agencyId);
    const old = beforeProfiles.find(item => item.agency_id === agencyId);
    const alternate = allowed ? 'admin' : 'staff';
    const scopes = Object.fromEntries(AGENCY_ACCESS_FIELDS.map(({ key }) => [key, allowed && !keepWorkClassification.has(key) && (
      key === 'has_billing_access' && account.team === jobRoles.billing ||
      key === 'has_hiring_access' && account.team === jobRoles.people_operations
    )]));
    for (const key of keepWorkClassification) {
      if (allowed && old && Object.hasOwn(jsonAccess(old.effective_permissions), key)) scopes[key] = jsonAccess(old.effective_permissions)[key];
    }
    await db.execute(
      `INSERT INTO user_agency_access_profiles
         (user_id,agency_id,access_origin,role_baseline,permissions_baseline,role_override,permissions_overrides,effective_role,effective_permissions)
       VALUES (?,?,'membership','staff',JSON_OBJECT(),?,?,?,?)
       ON DUPLICATE KEY UPDATE role_override=VALUES(role_override),permissions_overrides=VALUES(permissions_overrides),
        effective_role=VALUES(effective_role),effective_permissions=VALUES(effective_permissions),revision=revision+1`,
      [account.id, agencyId, alternate, JSON.stringify(scopes), alternate, JSON.stringify(scopes)]
    );
    if (allowed) await db.execute(
      `INSERT INTO user_agencies(user_id,agency_id,is_active,is_default,agency_role,has_billing_access,has_payroll_access,
         has_department_access,can_manage_credentialing,is_marketing_contact)
       VALUES (?,?,1,?,'admin',?,0,0,0,0) ON DUPLICATE KEY UPDATE is_active=1,
         is_default=VALUES(is_default),agency_role='admin',has_billing_access=VALUES(has_billing_access),
         has_payroll_access=0,has_department_access=0,can_manage_credentialing=0,is_marketing_contact=0`,
      [account.id, agencyId, Number(agencyId === leaveDefault), Number(account.team === jobRoles.billing)]
    );
  }
  await db.execute(
    `INSERT INTO employment_notice_automation_audit (notice_id,user_id,operation,automation_identity,result)
     VALUES (?,?,'permissions_applied',?,?)`,
    [noticeId, account.id, actor, JSON.stringify({
      before: { platformRole: account.role, platform: beforePlatform || null, memberships: beforeMemberships, profiles: beforeProfiles },
      after: { companyIds, role: 'admin', team: account.team, excludedAgencyIds: [...outside] }
    })]
  );
  return true;
}

async function applyPermissions(input, actor, db) {
  const [[notice]] = await db.execute(
    `SELECT id FROM employment_notices WHERE version=? AND restrict_from<=UTC_TIMESTAMP(3) AND UTC_TIMESTAMP(3)<restrict_until FOR UPDATE`,
    [input.version]
  );
  if (!notice) throw failure(409, 'Permissions can be prepared only during the active restriction.');
  if (!await accessProfileSchemaReady(db)) throw failure(409, 'Scoped company access is unavailable.');
  const companies = await resolveCompanies(db);
  const accounts = await resolveAccounts(input, db, true);
  const [staged] = await db.execute('SELECT user_id FROM employment_notice_recipients WHERE notice_id=? ORDER BY user_id', [notice.id]);
  if (staged.length !== 4 || accounts.some(account => !staged.some(item => item.user_id === account.id))) {
    throw failure(409, 'The account matches changed after the campaign was staged.');
  }
  let updated = 0;
  for (const account of accounts.filter(account => Object.hasOwn(jobRoles, account.team))) {
    if (await restrictToCompanies(account, companies, notice.id, actor, db)) updated++;
  }
  return { updated };
}

export async function runEmploymentNoticeCampaign(action, actor, { database = pool, config = process.env, load = campaignInput } = {}) {
  const input = await load(config);
  if (action === 'preflight') return preflight(input, database);
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    const result = action === 'stage' ? await stage(input, actor, db)
      : action === 'apply-permissions' ? await applyPermissions(input, actor, db) : null;
    if (!result) throw failure(404, 'Unknown campaign operation.');
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
