import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), end: vi.fn() }, onTableWrite: vi.fn() }));
import { createAssistantDirectoryReader, inspectAssistantDatabaseIdentity, inspectAssistantGroupSnapshot, runAssistantMaintenance } from '../assistantMaintenance.service.js';
import { assistantStoredConfigurationHash } from '../assistantTeamPolicy.js';
import { main, parseAssistantMaintenanceArguments } from '../../scripts/runAssistantMaintenance.js';

const fingerprint = 'a'.repeat(64);
const settings = () => ({ allowExternalMembers: 'false', whoCanJoin: 'INVITED_CAN_JOIN', whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW', whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', whoCanPostMessage: 'ANYONE_CAN_POST', includeInGlobalAddressList: 'false', whoCanModerateMembers: 'OWNERS_AND_MANAGERS', isArchived: 'false', messageModerationLevel: 'MODERATE_NONE', spamModerationLevel: 'MODERATE' });
const members = () => [{ email: 'michael@plottwistco.com', role: 'OWNER', type: 'USER', delivery_settings: 'NONE', status: 'ACTIVE' }, { email: 'ai@plottwistco.com', role: 'MANAGER', type: 'USER', delivery_settings: 'ALL_MAIL', status: 'ACTIVE' }];
const fixture = () => {
  const account = { id: 1, user_id: 11, agency_id: 2, subrole: 'billing', status: 'active', group_status: 'ready', policy_revision: 3, credential_fingerprint: fingerprint, agency_name: 'ITSCO', agency_slug: 'itsco', agency_active: 1, agency_archived: 0, organization_type: 'agency', feature_flags: {} };
  account.group_snapshot_json = { groupId: 'private-google-id', members: members().map(({ email, role }) => ({ email, role })).sort((a, b) => a.email.localeCompare(b.email)), settings: settings() };
  account.capabilities_json = ['billing.review']; account.schedule_json = { enabled: false, timezone: 'America/Denver' }; account.baa_status = 'pending'; account.privacy_policy_json = {};
  account.configuration_fingerprint = assistantStoredConfigurationHash(account);
  const user = { id: 11, role: 'assistant', is_assistant_account: 1, email: 'billing-assistant@itsco.health', username: 'billing-assistant@itsco.health', work_email: 'billing-assistant@itsco.health', first_name: 'ITSCO', last_name: 'Billing Assistant', status: 'ACTIVE_EMPLOYEE', is_active: 1, is_archived: 0, login_is_group_email: 1, sso_password_override: 1, sees_clients: 0, has_provider_access: 0, has_supervisor_privileges: 0, actual_credential_fingerprint: fingerprint };
  const memberships = [{ user_id: 11, agency_id: 2, is_active: 1, has_payroll_access: 0, has_billing_access: 0 }];
  const group = { id: 'private-google-id', email: user.email, directMembersCount: '2' };
  return { account, user, memberships, group, members: members(), settings: settings() };
};
function runner(source = fixture(), options = {}) {
  let current = source.account;
  const conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn(async sql => [[{ acquired: options.lockUnavailable ? 0 : 1 }]]), execute: vi.fn(async (sql, values) => {
    if (sql.startsWith('SELECT id,status')) return [[{ ...current, ...(options.current || {}) }]];
    if (sql.startsWith('UPDATE assistant_accounts')) { current = { ...current, status: values[0], group_status: 'drift', policy_revision: Number(current.policy_revision) + 1 }; }
    return [{ affectedRows: 1 }];
  }) };
  const db = { getConnection: vi.fn(async () => conn), execute: vi.fn(async (sql, values) => {
    if (sql.includes('FROM assistant_accounts aa')) return [values[0] === 0 && (current.status === 'active' || current.group_status === 'ready') ? [structuredClone(current)] : []];
    if (sql.includes('FROM users')) return [[source.user]];
    if (sql.includes('FROM user_agencies')) return [source.memberships];
    throw new Error('Unexpected synthetic SQL');
  }) };
  const directory = { getGroup: vi.fn(async () => source.group), listGroupMembers: vi.fn(async () => source.members), getGroupSettings: vi.fn(async () => source.settings) };
  const deps = { db, directory, recordChange: vi.fn(async () => 'event'), alerts: vi.fn(async () => ({ sent: 1 })), reports:vi.fn().mockResolvedValue({sent:0}),preparationJobs: vi.fn(async () => ({ processed: 1 })), schoolCounter: vi.fn(async () => 1) };
  return { source, conn, db, directory, deps };
}

describe('assistant maintenance database invariants', () => {
  it('accepts only the expected single-agency machine identity with matching credential fingerprint', () => {
    const data = fixture(); expect(inspectAssistantDatabaseIdentity(data)).toEqual([]);
  });
  it.each([
    [data => { data.user.role = 'admin'; }, 'MACHINE_IDENTITY_DRIFT'],
    [data => { data.user.is_assistant_account = 0; }, 'MACHINE_IDENTITY_DRIFT'],
    [data => { data.user.email = 'private-person@example.com'; }, 'LOGIN_IDENTITY_DRIFT'],
    [data => { data.memberships.push({ agency_id: 6, is_active: 1 }); }, 'AGENCY_MEMBERSHIP_DRIFT'],
    [data => { data.memberships[0].has_billing_access = 1; }, 'MEMBERSHIP_PRIVILEGE_DRIFT'],
    [data => { data.user.has_provider_access = 1; }, 'HUMAN_PRIVILEGE_DRIFT'],
    [data => { data.user.actual_credential_fingerprint = 'b'.repeat(64); }, 'CREDENTIAL_DRIFT'],
    [data => { data.account.credential_fingerprint = null; }, 'CREDENTIAL_BASELINE_MISSING'],
    [data => { data.account.agency_active = 0; }, 'AGENCY_NOT_ACTIVE'],
    [data => { data.user.sso_password_override = 0; }, 'LOGIN_POLICY_DRIFT']
  ])('detects a changed invariant without exposing the changed value', (mutate, code) => {
    const data = fixture(); mutate(data);
    const reasons = inspectAssistantDatabaseIdentity(data);
    expect(reasons).toContain(code); expect(JSON.stringify(reasons)).not.toMatch(/@|private-person|a{64}|b{64}/);
  });
  it('flags loss of the final school relationship', () => {
    const data = fixture(); data.account.subrole = 'school_support'; data.user.last_name = 'School Support Assistant';
    for (const key of ['email', 'username', 'work_email']) data.user[key] = 'school-support-assistant@itsco.health';
    data.account.configuration_fingerprint = assistantStoredConfigurationHash(data.account);
    expect(inspectAssistantDatabaseIdentity({ ...data, schoolCount: 0 })).toEqual(['NO_LINKED_SCHOOLS']);
  });
});

describe('assistant group drift', () => {
  it('requires canonical owner and manager roles, delivery settings and a matching saved snapshot', () => {
    const data = fixture(); expect(inspectAssistantGroupSnapshot(data)).toEqual([]);
  });
  it.each([
    [data => { data.members[0].role = 'MANAGER'; }, 'GROUP_MEMBERSHIP_DRIFT'],
    [data => { data.members.push({ email: 'private-person@example.com', role: 'MEMBER', type: 'USER' }); data.group.directMembersCount = '3'; }, 'GROUP_MEMBERSHIP_DRIFT'],
    [data => { data.settings.allowExternalMembers = 'true'; }, 'GROUP_SETTINGS_DRIFT'],
    [data => { data.settings.whoCanViewMembership = 'ALL_IN_DOMAIN_CAN_VIEW'; }, 'GROUP_SETTINGS_DRIFT'],
    [data => { data.settings.whoCanModerateMembers = 'ALL_MEMBERS'; }, 'GROUP_SETTINGS_DRIFT'],
    [data => { data.group.id = 'replacement-group'; }, 'GROUP_IDENTITY_DRIFT'],
    [data => { data.group.aliases = ['private@example.com']; }, 'GROUP_ALIAS_DRIFT'],
    [data => { data.members[0].delivery_settings = 'ALL_MAIL'; }, 'GROUP_DELIVERY_DRIFT']
  ])('detects group drift using codes only', (mutate, code) => {
    const data = fixture(); mutate(data); const reasons = inspectAssistantGroupSnapshot(data);
    expect(reasons).toContain(code); expect(JSON.stringify(reasons)).not.toMatch(/@|replacement-group|private-google-id/);
  });
  it('does not trust a member list at the 1000-member cap or a nested group', () => {
    const data = fixture(); data.members = Array.from({ length: 1000 }, () => members()[0]);
    expect(() => inspectAssistantGroupSnapshot(data)).toThrow(expect.objectContaining({ code: 'DIRECTORY_MEMBERS_INCOMPLETE' }));
    data.members = members(); data.members[0].type = 'GROUP';
    expect(() => inspectAssistantGroupSnapshot(data)).toThrow(expect.objectContaining({ code: 'GROUP_MEMBER_TYPE_DRIFT' }));
  });
});

describe('read-only Directory reader', () => {
  it('paginates membership and performs only GET/list requests with read-only Directory scopes', async () => {
    const admin = { groups: { get: vi.fn(async () => ({ data: fixture().group })), insert: vi.fn(), update: vi.fn() }, members: { list: vi.fn().mockResolvedValueOnce({ data: { members: [members()[0]], nextPageToken: 'page2' } }).mockResolvedValueOnce({ data: { members: [members()[1]] } }), insert: vi.fn(), update: vi.fn() } };
    const groupSettings = { groups: { get: vi.fn(async () => ({ data: settings() })), patch: vi.fn() } };
    const api = { admin: vi.fn(() => admin), groupssettings: vi.fn(() => groupSettings) }, authBuilder = vi.fn(async () => ({}));
    const reader = createAssistantDirectoryReader({ authBuilder, api, subjectEmail: 'synthetic-admin@example.com' });
    await reader.getGroup({ groupEmail: 'synthetic-group@example.com' });
    expect(await reader.listGroupMembers('synthetic-group@example.com')).toHaveLength(2);
    await reader.getGroupSettings({ groupEmail: 'synthetic-group@example.com' });
    expect(admin.members.list.mock.calls[1][0].pageToken).toBe('page2');
    expect(authBuilder.mock.calls[0][0].scopes.every(scope => scope.endsWith('.readonly'))).toBe(true);
    expect(admin.groups.insert).not.toHaveBeenCalled(); expect(admin.members.update).not.toHaveBeenCalled(); expect(groupSettings.groups.patch).not.toHaveBeenCalled();
  });
  it('fails closed on a truncated member list and suppresses raw provider errors', async () => {
    const membersList = vi.fn(async () => ({ data: { members: Array.from({ length: 1000 }, () => members()[0]), nextPageToken: 'more' } }));
    const reader = createAssistantDirectoryReader({ authBuilder: async () => ({}), api: { admin: () => ({ members: { list: membersList }, groups: { get: async () => { throw new Error('PRIVATE GOOGLE RESPONSE'); } } }) } });
    await expect(reader.listGroupMembers('synthetic@example.com')).rejects.toMatchObject({ code: 'DIRECTORY_MEMBERS_INCOMPLETE' });
    await expect(reader.getGroup({ groupEmail: 'synthetic@example.com' })).rejects.not.toThrow('PRIVATE GOOGLE RESPONSE');
  });
});

describe('maintenance execution', () => {
  it('is read-only by default, without draining alerts/preparation or mutating Google/DB accounts', async () => {
    const { deps, db, directory } = runner(); const result = await runAssistantMaintenance(deps);
    expect(result).toMatchObject({ mode: 'check-only', scanned: 1, healthy: 1, drifted: 0, restricted: 0 });
    expect(db.getConnection).not.toHaveBeenCalled(); expect(deps.recordChange).not.toHaveBeenCalled(); expect(deps.alerts).not.toHaveBeenCalled(); expect(deps.preparationJobs).not.toHaveBeenCalled();
    for (const [sql] of db.execute.mock.calls) expect(sql.trim()).toMatch(/^SELECT/);
    expect(directory.getGroupSettings).toHaveBeenCalled(); expect(JSON.stringify(result)).not.toMatch(/@|private-google-id|a{64}/);
  });
  it('pauses and revokes after drift, appends the alert in the same transaction and is idempotent on the next scan', async () => {
    const source = fixture(); source.user.actual_credential_fingerprint = 'b'.repeat(64);
    const { deps, conn, directory } = runner(source); const first = await runAssistantMaintenance({ ...deps, apply: true });
    expect(first).toMatchObject({ drifted: 1, restricted: 1, reasonCounts: { CREDENTIAL_DRIFT: 1 } });
    expect(directory.getGroup).not.toHaveBeenCalled();
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO user_auth_revocations'))).toBe(true);
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('UPDATE auth_session_security'))).toBe(true);
    expect(deps.recordChange).toHaveBeenCalledWith(conn, expect.objectContaining({ eventType: 'account_drift_detected', changes: expect.objectContaining({ status: 'paused', groupStatus: 'drift', policyRevision: 4 }) }));
    expect(conn.commit).toHaveBeenCalledTimes(1); expect(deps.alerts).toHaveBeenCalledWith({ db: deps.db, limit: 20 }); expect(deps.preparationJobs).toHaveBeenCalledWith({ maxBatches: 3 });
    const second = await runAssistantMaintenance({ ...deps, apply: true });
    expect(second.scanned).toBe(0); expect(deps.recordChange).toHaveBeenCalledTimes(1); expect(conn.commit).toHaveBeenCalledTimes(1);
  });
  it('never turns a disabled account back on when its ready group drifts', async () => {
    const source = fixture(); source.account.status = 'disabled'; source.settings.whoCanJoin = 'ANYONE_CAN_JOIN';
    const { deps } = runner(source); await runAssistantMaintenance({ ...deps, apply: true });
    expect(deps.recordChange.mock.calls[0][1].changes.status).toBe('disabled');
  });
  it('defers a stale inspection when the owner changed policy during the scan', async () => {
    const source = fixture(); source.user.role = 'admin';
    const { deps, conn } = runner(source, { current: { policy_revision: 4 } });
    expect(await runAssistantMaintenance({ ...deps, apply: true })).toMatchObject({ drifted: 1, restricted: 0, deferred: 1 });
    expect(deps.recordChange).not.toHaveBeenCalled(); expect(conn.rollback).toHaveBeenCalled();
  });
  it('restricts an unverifiable active group without exposing private directory errors', async () => {
    const { deps, directory } = runner(); directory.getGroup.mockRejectedValueOnce(new Error('PRIVATE ADDRESS private@example.com'));
    const result = await runAssistantMaintenance({ ...deps, apply: true });
    expect(result).toMatchObject({ drifted: 1, unavailable: 1, restricted: 1, reasonCounts: { VERIFICATION_UNAVAILABLE: 1 } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|@/);
  });
  it('rejects a helper response with remaining pages rather than trusting a partial list', async () => {
    const { deps, directory } = runner(); directory.listGroupMembers.mockResolvedValueOnce({ members: members(), nextPageToken: 'MORE' });
    expect(await runAssistantMaintenance(deps)).toMatchObject({ drifted: 1, unavailable: 1, reasonCounts: { DIRECTORY_MEMBERS_INCOMPLETE: 1 } });
  });
  it('does not start a second apply run while its maintenance lock is held', async () => {
    const { deps, db } = runner(fixture(), { lockUnavailable: true });
    expect(await runAssistantMaintenance({ ...deps, apply: true })).toMatchObject({ scanned: 0, skipped: 'ALREADY_RUNNING' });
    expect(db.execute).not.toHaveBeenCalled(); expect(deps.alerts).not.toHaveBeenCalled(); expect(deps.preparationJobs).not.toHaveBeenCalled();
  });
});

describe('maintenance CLI', () => {
  it('defaults to check-only and requires explicit --apply', async () => {
    expect(parseAssistantMaintenanceArguments([])).toEqual({ help: false, apply: false });
    expect(parseAssistantMaintenanceArguments(['--apply'])).toEqual({ help: false, apply: true });
    expect(() => parseAssistantMaintenanceArguments(['--apply', '--check-only'])).toThrow();
    const db = { end: vi.fn() }, output = vi.fn(), run = vi.fn(async () => ({ scanned: 1, drifted: 0, unavailable: 0, deferred: 0 }));
    expect(await main([], { db, output, run })).toBe(0); expect(run).toHaveBeenCalledWith({ apply: false, db }); expect(db.end).toHaveBeenCalled();
  });
  it('reports nonzero findings and coarse failure only, never raw error content', async () => {
    const db = { end: vi.fn() }, output = vi.fn();
    expect(await main(['--apply'], { db, output, run: async () => ({ drifted: 1 }) })).toBe(2);
    expect(await main([], { db, output, run: async () => { throw new Error('PRIVATE SECRET'); } })).toBe(1);
    expect(output.mock.calls.at(-1)[0]).toBe('{"status":"blocked","reasonCode":"ASSISTANT_MAINTENANCE_FAILED"}');
  });
});


describe('stored configuration drift', () => {
  it.each([
    account => { account.capabilities_json = ['billing.review', 'billing.submit']; },
    account => { account.schedule_json = { enabled: true, timezone: 'America/Denver' }; },
    account => { account.baa_status = 'verified'; },
    account => { account.privacy_policy_json = { enabled: true }; },
    account => { account.policy_revision += 1; },
    account => { account.group_snapshot_json.groupId = 'replacement'; }
  ])('detects direct SQL changes without trusting the changed values', mutate => {
    const data = fixture(); mutate(data.account);
    expect(inspectAssistantDatabaseIdentity(data)).toContain('CONFIGURATION_DRIFT');
  });
  it('does not treat equivalent MySQL JSON key ordering or updated_at changes as drift', () => {
    const data = fixture();
    data.account.schedule_json = JSON.stringify({ timezone: 'America/Denver', enabled: false });
    data.account.updated_at = '2099-01-01';
    const snapshot = data.account.group_snapshot_json;
    data.account.group_snapshot_json = JSON.stringify({ settings: Object.fromEntries(Object.entries(snapshot.settings).reverse()), members: snapshot.members, groupId: snapshot.groupId });
    expect(inspectAssistantDatabaseIdentity(data)).toEqual([]);
  });
});
