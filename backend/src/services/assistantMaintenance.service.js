import {deliverApprovedPayrollReports} from './assistantPayrollReport.service.js';
/** Read-only drift inspection by default. Apply mode restricts accounts and drains existing queues; it never grants access or runs a bot/model. */
import pool from '../config/database.js';
import { google } from '../utils/googleApis.js';
import { buildImpersonatedJwtClient, GOOGLE_WORKSPACE_GROUPS_SETTINGS_SCOPE } from './googleWorkspaceAuth.service.js';
import { ASSISTANT_CATALOG, ASSISTANT_OWNER_EMAIL, ASSISTANT_AGENCIES, parseAssistantJson, assistantStoredConfigurationHash } from './assistantTeamPolicy.js';
import { APP_GROUP_MANAGER } from './appGroupOwnership.service.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';
import { countAssistantSchools } from './assistantProvisioning.service.js';
import { recordAssistantChange, processAssistantAccountAlerts } from './assistantAccountAlerts.service.js';

const READ_SCOPES = ['https://www.googleapis.com/auth/admin.directory.group.readonly', 'https://www.googleapis.com/auth/admin.directory.group.member.readonly'];
const SETTINGS = Object.freeze({ allowExternalMembers: 'false', whoCanJoin: 'INVITED_CAN_JOIN', whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW', whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', whoCanPostMessage: 'ANYONE_CAN_POST', includeInGlobalAddressList: 'false' });
const EXTRA_SETTINGS = Object.freeze({ whoCanModerateMembers: 'OWNERS_AND_MANAGERS', isArchived: 'false', messageModerationLevel: 'MODERATE_NONE', spamModerationLevel: 'MODERATE' });
const MEMBERS = Object.freeze([{ email: ASSISTANT_OWNER_EMAIL, role: 'OWNER' }, { email: APP_GROUP_MANAGER, role: 'MANAGER' }].sort((a, b) => a.email.localeCompare(b.email)));
const norm = value => String(value || '').trim().toLowerCase();
const isTrue = value => value === true || value === 1 || value === '1';
const text = value => value === true ? 'true' : value === false ? 'false' : String(value ?? '');
const error = code => Object.assign(new Error('Assistant maintenance needs configuration or owner review'), { code });
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Only Directory GET/list and Groups Settings GET are exposed by this reader. */
export function createAssistantDirectoryReader({ authBuilder = buildImpersonatedJwtClient, api = google, subjectEmail = process.env.GOOGLE_WORKSPACE_DIRECTORY_IMPERSONATE_USER || process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER } = {}) {
  let directory, settings;
  const directoryClient = () => directory ||= authBuilder({ subjectEmail, scopes: READ_SCOPES }).then(auth => api.admin({ version: 'directory_v1', auth }));
  const settingsClient = () => settings ||= authBuilder({ subjectEmail, scopes: [GOOGLE_WORKSPACE_GROUPS_SETTINGS_SCOPE] }).then(auth => api.groupssettings({ version: 'v1', auth }));
  return {
    async getGroup({ groupEmail }) {
      try { return (await (await directoryClient()).groups.get({ groupKey: groupEmail }, { timeout: 15000 })).data || null; }
      catch (cause) { if (Number(cause.code || cause.response?.status) === 404) return null; throw error('DIRECTORY_CHECK_UNAVAILABLE'); }
    },
    async listGroupMembers(groupEmail, { maxResults = 1000 } = {}) {
      const size = Math.min(1000, Math.max(1, Number(maxResults) || 1000)), members = [];
      let pageToken; const seenTokens = new Set();
      try {
        do {
          const response = await (await directoryClient()).members.list({ groupKey: groupEmail, maxResults: Math.min(200, size - members.length), pageToken }, { timeout: 15000 });
          const batch = response.data?.members || [];
          if (!Array.isArray(batch)) throw error('DIRECTORY_MEMBERS_INCOMPLETE');
          members.push(...batch); pageToken = response.data?.nextPageToken || undefined;
          if (pageToken) { if (seenTokens.has(pageToken)) throw error('DIRECTORY_MEMBERS_INCOMPLETE'); seenTokens.add(pageToken); }
          // A bounded response at the cap cannot establish the complete membership.
          if (members.length >= size) throw error('DIRECTORY_MEMBERS_INCOMPLETE');
        } while (pageToken);
        return members;
      } catch (cause) { throw error(cause.code === 'DIRECTORY_MEMBERS_INCOMPLETE' ? cause.code : 'DIRECTORY_CHECK_UNAVAILABLE'); }
    },
    async getGroupSettings({ groupEmail }) {
      try { return (await (await settingsClient()).groups.get({ groupUniqueId: groupEmail, alt: 'json' }, { timeout: 15000 })).data || null; }
      catch { throw error('DIRECTORY_CHECK_UNAVAILABLE'); }
    }
  };
}

function expectedIdentity(account) {
  const qa = [450, 453].includes(Number(account.agency_id));
  const role = ASSISTANT_CATALOG.find(role => role.key === account.subrole);
  const domain = qa ? ({ 450: 'itsco.health', 453: 'nextleveluplcc.com' }[account.agency_id]) : managedDomain({ id: account.agency_id, slug: account.agency_slug, organization_type: account.organization_type, is_active: account.agency_active, feature_flags: account.feature_flags });
  if (!role || !domain || (!qa && !ASSISTANT_AGENCIES.includes(Number(account.agency_id)))) return null;
  const local = account.subrole === 'team_lead' ? 'assistant-team-lead' : `${account.subrole.replaceAll('_', '-')}-assistant`;
  return { email: `${qa ? `qa-${account.agency_id}-` : ''}${local}@${domain}`, firstName: account.agency_name, lastName: role.label };
}

/** Returns codes only: do not put source identities, Google errors or credentials in logs. */
export function inspectAssistantDatabaseIdentity({ account, user, memberships = [], schoolCount = null }) {
  const codes = [], expected = expectedIdentity(account);
  if (!user || Number(user.id) !== Number(account.user_id)) return ['IDENTITY_UNAVAILABLE'];
  if (!expected) codes.push('AGENCY_OR_SUBROLE_NOT_ENROLLED');
  if (user.role !== 'assistant' || !isTrue(user.is_assistant_account)) codes.push('MACHINE_IDENTITY_DRIFT');
  if (!isTrue(user.is_active) || isTrue(user.is_archived) || user.status !== 'ACTIVE_EMPLOYEE') codes.push('ACCOUNT_LIFECYCLE_DRIFT');
  if (!isTrue(account.agency_active) || isTrue(account.agency_archived)) codes.push('AGENCY_NOT_ACTIVE');
  if (expected && [user.email, user.username, user.work_email].some(value => norm(value) !== expected.email)) codes.push('LOGIN_IDENTITY_DRIFT');
  if (expected && (user.first_name !== expected.firstName || user.last_name !== expected.lastName)) codes.push('DISPLAY_IDENTITY_DRIFT');
  if (!isTrue(user.login_is_group_email) || !isTrue(user.sso_password_override)) codes.push('LOGIN_POLICY_DRIFT');
  if (isTrue(user.sees_clients) || isTrue(user.has_provider_access) || isTrue(user.has_supervisor_privileges)) codes.push('HUMAN_PRIVILEGE_DRIFT');
  if (memberships.length !== 1 || Number(memberships[0]?.agency_id) !== Number(account.agency_id) || !isTrue(memberships[0]?.is_active)) codes.push('AGENCY_MEMBERSHIP_DRIFT');
  for (const membership of memberships) {
    if ((membership.agency_role && membership.agency_role !== 'assistant') || Object.entries(membership).some(([key, value]) => /^has_.*(?:access|privileges)$/.test(key) && isTrue(value))) { codes.push('MEMBERSHIP_PRIVILEGE_DRIFT'); break; }
  }
  if (!/^[a-f0-9]{64}$/i.test(String(account.credential_fingerprint || ''))) codes.push('CREDENTIAL_BASELINE_MISSING');
  else if (account.credential_fingerprint !== user.actual_credential_fingerprint) codes.push('CREDENTIAL_DRIFT');
  if (!/^[a-f0-9]{64}$/i.test(String(account.configuration_fingerprint || ''))) codes.push('CONFIGURATION_BASELINE_MISSING');
  else if (assistantStoredConfigurationHash(account) !== account.configuration_fingerprint) codes.push('CONFIGURATION_DRIFT');
  if (account.subrole === 'school_support' && schoolCount === 0) codes.push('NO_LINKED_SCHOOLS');
  return [...new Set(codes)].sort();
}

function membersProjection(members) {
  if (!Array.isArray(members) || members.length >= 1000) throw error('DIRECTORY_MEMBERS_INCOMPLETE');
  if (members.some(member => member.type && member.type !== 'USER')) throw error('GROUP_MEMBER_TYPE_DRIFT');
  return members.map(member => ({ email: norm(member.email), role: String(member.role || '').toUpperCase() })).sort((a, b) => a.email.localeCompare(b.email));
}
export function inspectAssistantGroupSnapshot({ account, group, members, settings }) {
  const codes = [], baseline = parseAssistantJson(account.group_snapshot_json, null), expected = expectedIdentity(account);
  if (account.group_status !== 'ready') return ['GROUP_NOT_READY'];
  if (!baseline?.groupId || !Array.isArray(baseline.members) || !baseline.settings) return ['GROUP_BASELINE_MISSING'];
  if (!expected || !group || norm(group.email) !== expected.email || String(group.id) !== String(baseline.groupId)) codes.push('GROUP_IDENTITY_DRIFT');
  if ((group?.aliases || []).length || (group?.nonEditableAliases || []).length) codes.push('GROUP_ALIAS_DRIFT');
  if (!same(membersProjection(baseline.members), MEMBERS)) codes.push('GROUP_BASELINE_INVALID');
  if (!same(membersProjection(members), MEMBERS)) codes.push('GROUP_MEMBERSHIP_DRIFT');
  if (group?.directMembersCount != null && Number(group.directMembersCount) !== members.length) codes.push('DIRECTORY_MEMBERS_INCOMPLETE');
  for (const [key, required] of Object.entries(SETTINGS)) {
    if (text(baseline.settings[key]) !== required) codes.push('GROUP_BASELINE_INVALID');
    if (text(settings?.[key]) !== required || text(settings?.[key]) !== text(baseline.settings[key])) codes.push('GROUP_SETTINGS_DRIFT');
  }
  for (const [key, required] of Object.entries(EXTRA_SETTINGS)) if (text(settings?.[key]) !== required) codes.push('GROUP_SETTINGS_DRIFT');
  for (const member of members) {
    const required = norm(member.email) === ASSISTANT_OWNER_EMAIL ? 'NONE' : 'ALL_MAIL';
    if (String(member.delivery_settings || '') !== required) codes.push('GROUP_DELIVERY_DRIFT');
    if (member.status && member.status !== 'ACTIVE') codes.push('GROUP_MEMBERSHIP_DRIFT');
  }
  return [...new Set(codes)].sort();
}

async function restrictAccount(account, reasons, db, recordChange) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.execute('SELECT id,status,group_status,policy_revision FROM assistant_accounts WHERE id=? FOR UPDATE', [account.id]);
    if (!current || Number(current.policy_revision) !== Number(account.policy_revision) || (current.status === 'paused' && current.group_status === 'drift')) { await conn.rollback(); return { restricted: false, deferred: true }; }
    const status = current.status === 'disabled' ? 'disabled' : 'paused';
    await conn.execute("UPDATE assistant_accounts SET status=?,group_status='drift',policy_revision=policy_revision+1 WHERE id=?", [status, account.id]);
    await conn.execute('INSERT INTO user_auth_revocations(user_id,reject_issued_before,revoked_at,revoked_by_user_id) VALUES (?,UNIX_TIMESTAMP()+1,UTC_TIMESTAMP(3),NULL) ON DUPLICATE KEY UPDATE reject_issued_before=VALUES(reject_issued_before),revoked_at=VALUES(revoked_at),revoked_by_user_id=NULL', [account.user_id]);
    await conn.execute('UPDATE auth_session_security SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)) WHERE user_id=? AND revoked_at IS NULL', [account.user_id]);
    await recordChange(conn, { accountId: account.id, agencyId: account.agency_id, actorUserId: null, eventType: 'account_drift_detected', changes: { status, groupStatus: 'drift', drift: { reasonCodes: reasons }, policyRevision: Number(current.policy_revision) + 1 }, reason: 'Scheduled verification found an identity, scope, credential, school or group change. Owner review is required.' });
    await conn.commit(); return { restricted: true, deferred: false };
  } catch { await conn.rollback(); throw error('ACCOUNT_RESTRICTION_FAILED'); }
  finally { conn.release(); }
}

export async function runAssistantMaintenance({ apply = false, db = pool, directory, getGroupSettings, recordChange = recordAssistantChange, alerts = processAssistantAccountAlerts, preparationJobs, reports = deliverApprovedPayrollReports, schoolCounter = countAssistantSchools } = {}) {
  const summary = { mode: apply ? 'apply' : 'check-only', scanned: 0, healthy: 0, drifted: 0, restricted: 0, deferred: 0, unavailable: 0, reasonCounts: {}, alerts: { sent: 0 }, preparation: { processed: 0 } };
  const addReason = code => { summary.reasonCounts[code] = (summary.reasonCounts[code] || 0) + 1; };
  const reader = directory || createAssistantDirectoryReader();
  const settingsReader = getGroupSettings || (args => reader.getGroupSettings(args));
  let lockConnection, locked = false;
  try {
    if (apply) {
      lockConnection = await db.getConnection();
      const [[lock]] = await lockConnection.query("SELECT GET_LOCK('assistant_maintenance',0) acquired");
      locked = Number(lock.acquired) === 1;
      if (!locked) return { ...summary, skipped: 'ALREADY_RUNNING' };
    }
    let afterId = 0;
    for (;;) {
      const [accounts] = await db.execute(`SELECT aa.*,a.name agency_name,a.slug agency_slug,a.is_active agency_active,a.is_archived agency_archived,a.organization_type,a.feature_flags
        FROM assistant_accounts aa JOIN agencies a ON a.id=aa.agency_id WHERE aa.id>? AND (aa.status='active' OR aa.group_status='ready') ORDER BY aa.id LIMIT 100`, [afterId]);
      if (!accounts.length) break;
      for (const account of accounts) {
        summary.scanned++; let reasons = [];
        try {
          const [[user]] = await db.execute(`SELECT id,role,is_assistant_account,email,username,work_email,first_name,last_name,status,is_active,is_archived,login_is_group_email,sso_password_override,sees_clients,has_provider_access,has_supervisor_privileges,SHA2(password_hash,256) actual_credential_fingerprint FROM users WHERE id=?`, [account.user_id]);
          const [memberships] = await db.execute('SELECT * FROM user_agencies WHERE user_id=?', [account.user_id]);
          const schoolCount = account.subrole === 'school_support' ? await schoolCounter(account.agency_id, db) : null;
          reasons = inspectAssistantDatabaseIdentity({ account, user, memberships, schoolCount });
          if (!reasons.length) {
            const email = expectedIdentity(account).email;
            const group = await reader.getGroup({ groupEmail: email, strictNotFound: true });
            if (!group) reasons = ['GROUP_IDENTITY_DRIFT'];
            else {
              const membersResponse = await reader.listGroupMembers(email, { maxResults: 1000 });
              const members = Array.isArray(membersResponse) ? membersResponse : membersResponse?.members;
              if (!Array.isArray(members) || membersResponse?.nextPageToken || members.length >= 1000) throw error('DIRECTORY_MEMBERS_INCOMPLETE');
              const settings = await settingsReader({ groupEmail: email });
              reasons = inspectAssistantGroupSnapshot({ account, group, members, settings });
            }
          }
        } catch (cause) {
          const code = ['DIRECTORY_MEMBERS_INCOMPLETE', 'GROUP_MEMBER_TYPE_DRIFT'].includes(cause.code) ? cause.code : 'VERIFICATION_UNAVAILABLE';
          reasons = [code]; summary.unavailable++;
        }
        if (!reasons.length) summary.healthy++;
        else {
          summary.drifted++; for (const reason of reasons) addReason(reason);
          if (apply) { const result = await restrictAccount(account, reasons, db, recordChange); summary.restricted += Number(result.restricted); summary.deferred += Number(result.deferred); }
        }
      }
      const next = Number(accounts.at(-1).id);
      if (!validId(next) || next <= afterId) throw error('ACCOUNT_SCAN_DID_NOT_ADVANCE');
      afterId = next;
    }
    if (apply) {
      // These processors use existing durable claims. No external browser is run.
      summary.alerts = await alerts({ db, limit: 20 });
      const processJobs = preparationJobs || (await import('./assistantPreparation.service.js')).processAssistantPreparationJobs;
      summary.preparation = await processJobs({ maxBatches: 3 });
      summary.payrollReports = await reports({ db, limit: 10 });
    }
    return summary;
  } finally {
    if (locked) await lockConnection.query("SELECT RELEASE_LOCK('assistant_maintenance')");
    lockConnection?.release();
  }
}
