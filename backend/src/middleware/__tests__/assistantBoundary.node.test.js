import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantBoundary } from '../assistantBoundary.middleware.js';
import { assistantRouteKind, assistantAgencyScopeMatches, assistantTargetIds,
  minimalAssistantCapabilities, isAssistantIdentity } from '../../utils/assistantBoundaryPolicy.js';
import { loadAssistantIdentity, assertAssistantMembership, filterAssistantIdentities, assistantRecoveryTarget } from '../../services/assistantIdentity.service.js';
import { checkAccess } from '../../utils/accessControl.js';
import { humanRosterSql, workplacePersonSql } from '../../utils/workplacePeople.js';

const identity = (overrides = {}) => ({ userId: 81, role: 'assistant', email: 'assistant@example.invalid', enabled: true,
  account: { id: 7, agencyId: 2, agencyName: 'Agency', agencySlug: 'agency', subrole: 'billing', status: 'active', policyRevision: 1 }, ...overrides });
const response = () => ({ code: 200, body: null, headers: {}, status(value) { this.code = value; return this; },
  json(value) { this.body = value; return this; }, set(key, value) { this.headers[key] = value; return this; } });
const request = (path = '/api/assistant-work', overrides = {}) => ({ method: 'GET', originalUrl: path,
  headers: {}, query: {}, body: {}, params: {}, user: { id: 81, role: 'super_admin' }, ...overrides });
async function run(handler, req) {
  const res = response(); let called = false;
  await handler(req, res, () => { called = true; });
  return { res, called, req };
}
const guards = (overrides = {}) => createAssistantBoundary({ lookup: async id => Number(id) === 81 ? identity() : null,
  membership: async () => true, verify: token => ({ id: Number(token), role: 'super_admin' }), ...overrides });

describe('assistant allowlist and scope', () => {
  it('allows only its workspace, safe session routes and projected identity', () => {
    assert.equal(assistantRouteKind('GET', '/api/assistant-work/tasks'), 'workspace');
    assert.equal(assistantRouteKind('POST', '/api/auth/logout'), 'session');
    assert.equal(assistantRouteKind('GET', '/api/users/me'), 'identity');
    for (const path of ['/api/users', '/api/payroll/periods', '/api/public/clients', '/api/assistant-accounts',
      '/api/auth/test-accounts/switch', '/api/auth/brand-switch/handoff', '/api/agents/assist', '/uploads/private.pdf',
      '/api/assistant-work-other/tasks', '/api/assistant-work/%2e%2e/users', '/api/assistant-work//tasks']) {
      assert.equal(assistantRouteKind('GET', path), 'denied', path);
    }
  });
  it('checks every supplied agency reference including arrays and nested bodies', () => {
    assert.equal(assistantAgencyScopeMatches(request(), 2), true);
    assert.equal(assistantAgencyScopeMatches(request('', { headers: { 'x-agency-id': '2' }, body: { action: { agencyId: 2 } } }), 2), true);
    for (const extra of [{ headers: { 'x-agency-id': '2,6' } }, { query: { agencyId: '6' } },
      { body: { nested: [{ agency_ids: [2, 6] }] } }, { body: { agencyId: null } }, { params: { agencyId: '2wrong' } }]) {
      assert.equal(assistantAgencyScopeMatches(request('', extra), 2), false);
    }
  });
  it('does not infer administrator access from an effective role or flags', () => {
    const user = { role: 'assistant', status: 'ACTIVE_EMPLOYEE', has_staff_access: true, has_provider_access: true };
    assert.deepEqual(checkAccess(user, { effectiveRole: 'super_admin' }), {
      canAccessOnDemand: false, canAccessDashboard: true, canAccessTraining: false, canAccessDocuments: false, canAccessAdmin: false
    });
    assert.equal(isAssistantIdentity({ role: 'admin', is_assistant_account: 1 }), true);
    assert.equal(minimalAssistantCapabilities().canManagePayroll, false);
    assert.equal(minimalAssistantCapabilities().canUseChat, false);
  });
});

describe('persisted assistant boundary', () => {
  it('normalizes a stale privileged JWT before downstream handlers', async () => {
    const { req, called } = await run(guards().authenticated, request());
    assert.equal(called, true); assert.equal(req.user.role, 'assistant');
    assert.equal(req.user.effectiveRole, 'assistant'); assert.deepEqual(req.user.agencyIds, [2]);
  });
  it('denies every legacy endpoint, including authenticated public routes', async () => {
    for (const path of ['/api/public/intake/status', '/api/users', '/api/assistant-accounts', '/api/payroll/periods', '/uploads/record.pdf']) {
      const { res, called } = await run(guards().global, request(path, { user: undefined, cookies: { authToken: '81' } }));
      assert.equal(res.code, 403, path); assert.equal(called, false, path);
    }
  });
  it('cannot substitute a different credential channel to bypass an assistant cookie', async () => {
    const { res, called } = await run(guards().global, request('/api/users', {
      user: undefined, headers: { authorization: 'Bearer 9' }, cookies: { authToken: '81' }
    }));
    assert.equal(res.code, 403); assert.equal(called, false);
  });
  it('allows the same assistant to sign in again while retaining an old cookie', async () => {
    const req = request('/api/auth/login', { method: 'POST', user: undefined,
      cookies: { authToken: '81' }, body: { username: identity().email, password: 'private-challenge' } });
    assert.equal((await run(guards().global, req)).called, true);
    const other = request('/api/auth/login', { method: 'POST', user: undefined,
      cookies: { authToken: '81' }, body: { username: 'other-user@example.invalid' } });
    assert.equal((await run(guards().global, other)).res.code, 403);
  });
  it('lets normal auth validate sessions before projecting own identity', async () => {
    const req = request('/api/users/me', { user: undefined, cookies: { authToken: '81' } });
    const first = await run(guards().global, req); assert.equal(first.called, true); assert.equal(first.res.body, null);
    req.user = { id: 81, role: 'assistant' };
    const second = await run(guards().authenticated, req);
    assert.equal(second.called, false); assert.equal(second.res.body.role, 'assistant');
    assert.equal(second.res.body.capabilities.canViewMyPayroll, false);
    assert.equal(second.res.body.first_name, undefined); assert.equal(second.res.body.personal_email, undefined);
  });
  it('denies broken membership, a disabled account, absent setup, and database failure', async () => {
    for (const options of [ { membership: async () => false },
      { lookup: async () => identity({ enabled: false }) }, { lookup: async () => identity({ account: null }) },
      { lookup: async () => { throw Error('private database text'); } } ]) {
      const { res, called } = await run(guards(options).authenticated, request());
      assert.ok([403, 503].includes(res.code)); assert.equal(called, false);
      assert.ok(!JSON.stringify(res.body).includes('private database text'));
    }
  });
  it('retains logout while disabled and rejects cross-agency writes', async () => {
    const disabled = guards({ lookup: async () => identity({ enabled: false }) });
    assert.equal((await run(disabled.authenticated, request('/api/auth/logout', { method: 'POST' }))).called, true);
    const bad = await run(guards().authenticated, request('/api/assistant-work/tasks', { method: 'POST', body: { agencyId: 6 } }));
    assert.equal(bad.res.code, 403); assert.equal(bad.called, false);
  });
  it('protects assistant account targets even from human legacy administrators', async () => {
    const req = request('/api/users/81/generate-temporary-password', { method: 'POST', user: { id: 9, role: 'super_admin' } });
    const result = await run(guards().authenticated, req);
    assert.equal(result.res.code, 403); assert.equal(result.res.body.error.code, 'ASSISTANT_MANAGEMENT_REQUIRED');
    const human = await run(guards().authenticated, request('/api/users/10', { method: 'PUT', user: { id: 9, role: 'admin' } }));
    assert.equal(human.called, true);
    const owner = await run(guards().authenticated, request('/api/assistant-accounts/7', { method: 'PATCH', user: { id: 9, role: 'super_admin' } }));
    assert.equal(owner.called, true); // Owner-only policy belongs to this dedicated router.
  });
  it('blocks alternate casing and whitespace when legacy routes try to create an assistant role', async () => {
    for (const field of ['role', 'work_role']) for (const value of ['assistant', 'ASSISTANT', ' Assistant ']) {
      const result = await run(guards().authenticated, request('/api/users', { method: 'POST', body: { [field]: value }, user: { id: 9, role: 'super_admin' } }));
      assert.equal(result.called, false);
      assert.equal(result.res.body.error.code, 'ASSISTANT_MANAGEMENT_REQUIRED');
    }
  });
  it('guards membership and bulk mutation references without confusing client IDs', () => {
    assert.deepEqual(assistantTargetIds(request('/api/users/assign/agency', { body: { userId: 81, agencyId: 2 } })), [81]);
    assert.deepEqual(assistantTargetIds(request('/api/users/grid/bulk', { body: { userIds: [81, 9] } })), [81, 9]);
    assert.deepEqual(assistantTargetIds(request('/api/payroll/users/81/pto-account')), [81]);
    assert.deepEqual(assistantTargetIds(request('/api/clients/81', { body: { clientId: 81 } })), []);
    assert.deepEqual(assistantTargetIds(request('/api/tasks', { body: { assignedToUserId: 81 } })), [81]);
    assert.throws(() => assistantTargetIds(request('/api/users/grid/bulk', { body: { userIds: Array.from({ length: 1001 }, (_, index) => index + 1) } })), RangeError);
  });
  it('blocks public credential reset/setup targets outside audited assistant management', async () => {
    const boundary = guards({ recoveryTarget: async () => identity() });
    const result = await run(boundary.global, request('/api/auth/reset-password/opaque', { method: 'POST', user: undefined }));
    assert.equal(result.res.code, 403); assert.equal(result.called, false);
  });
  it('projects login agencies and discards raw employee and notification metadata', async () => {
    const req = request('/api/auth/login', { method: 'POST', user: undefined });
    const result = await run(guards().global, req);
    result.res.json({ token: 'own-session-token', sessionId: 'own-session',
      user: { id: 81, role: 'admin', firstName: 'PRIVATE_STAFF_CANARY' },
      agencies: [{ id: 2, notificationSender: 'PRIVATE_RECIPIENT_CANARY' }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.res.body.user.role, 'assistant');
    assert.equal(result.res.body.token, 'own-session-token');
    assert.ok(!JSON.stringify(result.res.body).includes('PRIVATE_'));
  });
  it('prevents task writes while pending or paused', async () => {
    for (const status of ['pending', 'paused']) {
      const boundary = guards({ lookup: async () => identity({ account: { ...identity().account, status } }) });
      const result = await run(boundary.authenticated, request('/api/assistant-work/tasks/start', { method: 'POST' }));
      assert.equal(result.res.code, 403); assert.equal(result.called, false);
    }
  });
});

describe('assistant identity storage and directory separation', () => {
  it('classifies role, durable marker and profile independently', async () => {
    const base = { user_id: 81, user_role: 'admin', is_active: 1, is_archived: 0, user_status: 'ACTIVE_EMPLOYEE' };
    for (const extra of [{ user_role: 'assistant' }, { is_assistant_account: 1 }, { assistant_account_id: 7, agency_id: 2 }]) {
      const db = { execute: async () => [[{ ...base, ...extra }]] };
      assert.equal((await loadAssistantIdentity(81, { db })).role, 'assistant');
    }
    assert.equal(await loadAssistantIdentity(81, { db: { execute: async () => [[base]] } }), null);
  });
  it('requires exactly one active membership matching the assigned agency', async () => {
    for (const rows of [[], [{ agency_id: 6, is_active: 1 }], [{ agency_id: 2, is_active: 0 }],
      [{ agency_id: 2, is_active: 1 }, { agency_id: 6, is_active: 0 }]]) {
      assert.equal(await assertAssistantMembership(identity(), { db: { execute: async () => [rows] } }), false);
    }
    assert.equal(await assertAssistantMembership(identity(), { db: { execute: async () => [[{ agency_id: 2, is_active: 1 }]] } }), true);
  });
  it('filters stored assistant profiles without hiding login identity lookups', async () => {
    const rows = [{ id: 1, role: 'provider' }, { id: 81, role: 'assistant' }, { id: 82, role: 'admin' }];
    assert.deepEqual(await filterAssistantIdentities(rows, { db: { execute: async () => [[{ user_id: 81 }, { user_id: 82 }]] } }), [rows[0]]);
    assert.match(humanRosterSql('u'), /is_assistant_account/);
    assert.doesNotMatch(workplacePersonSql('u'), /assistant/);
  });
  it('resolves encoded recovery tokens before Express decodes route parameters', async () => {
    const db = { execute: async (sql, params) => sql.includes('passwordless_token')
      ? (params[0] === 'own-reset-token' ? [[{ id: 81 }]] : [[]])
      : [[{ user_id: 81, user_role: 'assistant', is_active: 1 }]] };
    const target = await assistantRecoveryTarget(request('/api/auth/reset-password/own%2Dreset%2Dtoken'), { db });
    assert.equal(target.userId, 81);
  });
});
