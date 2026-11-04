import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../assistantReviewPackets.service.js', () => ({ buildClinicalReviewPacket: vi.fn(), readSourceRevision: vi.fn(), inventoryEligibleCharts: vi.fn() }));
import { createAssistantTeamsService } from '../assistantTeams.service.js';
import { ASSISTANT_POLICY_VERSION, assistantConfigurationHash, assistantStoredConfigurationHash } from '../assistantTeamPolicy.js';

const TASK = 'aa111111-1111-4111-8111-111111111111';
const OTHER_TASK = 'bb222222-2222-4222-8222-222222222222';
const account = (extra = {}) => {
  const row = { id: 1, user_id: 1001, agency_id: 450, subrole: 'team_lead', status: 'active', group_status: 'ready',
    policy_revision: 1, baa_status: 'pending', capabilities_json: ['team_lead.dispatch', 'team_lead.review'],
    schedule_json: {}, privacy_policy_json: {}, display_name: 'Synthetic Agency AI Assistant Team Lead', agency_name: 'Synthetic Agency', ...extra };
  row.configuration_fingerprint = assistantStoredConfigurationHash(row);
  return row;
};

function fixture({ actor = account(), taskAgency = 450, taskState = 'queued', targetExists = true, targetAgency = 450 } = {}) {
  const events = [];
  const target = { id: 2, subrole: 'payroll', agency_id: targetAgency, capabilities_json: [], status: 'pending' };
  const task = { ref: TASK, agency_id: taskAgency, state: taskState, priority: 0 };
  const c = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, values) => {
    if (sql.startsWith('SELECT id FROM assistant_accounts')) return [[{ id: target.id }]];
    if (sql.includes('FROM assistant_change_events')) {
      return [events.filter(event => event.accountId === values[0] && event.changes.verification.capability === values[1]).map(event => ({ event_key: event.ref }))];
    }
    if (sql.startsWith('INSERT INTO assistant_change_events')) {
      events.push({ ref: values[0], accountId: values[1], agencyId: values[2], actorId: values[3], type: values[4], changes: JSON.parse(values[5]) });
      return [{ affectedRows: 1 }];
    }
    throw Error('Unexpected team lead transaction query');
  }) };
  const db = { getConnection: vi.fn(async () => c), execute: vi.fn(async (sql, values) => {
    if (sql.includes('FROM assistant_accounts aa') && sql.includes('WHERE aa.user_id=?')) return [[actor]];
    if (sql.startsWith('UPDATE assistant_work_items SET priority=')) {
      expect(sql).toContain("agency_id=? AND state='queued'");
      const matches = values[1] === task.ref && values[2] === task.agency_id && task.state === 'queued';
      if (matches) task.priority = values[0];
      return [{ affectedRows: matches ? 1 : 0 }];
    }
    if (sql.startsWith('SELECT id,subrole,agency_id FROM assistant_accounts')) {
      expect(sql).toContain('WHERE agency_id=? AND subrole=?');
      return [targetExists && values[0] === target.agency_id && values[1] === target.subrole ? [target] : []];
    }
    throw Error('Unexpected team lead query');
  }) };
  return { service: createAssistantTeamsService({ db }), db, c, task, target, actor, events };
}

describe('agency team lead task priorities', () => {
  it('can prioritize only a queued task in its own agency', async () => {
    const f = fixture();
    await expect(f.service.prioritizeWork(1001, TASK, 2)).resolves.toEqual({ updated: true });
    expect(f.task.priority).toBe(2);
    expect(f.db.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))[1]).toEqual([2, TASK, 450]);
    for (const options of [{ taskAgency: 453 }, { taskState: 'leased' }]) {
      const other = fixture(options);
      await expect(other.service.prioritizeWork(1001, TASK, 2)).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
      expect(other.task.priority).toBe(0);
    }
    await expect(f.service.prioritizeWork(1001, OTHER_TASK, 2)).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
  });
  it('rejects invalid references and priorities before a task mutation', async () => {
    for (const [ref, priority] of [[TASK, 3], [TASK, -1], [TASK, '2'], ['unknown', 1]]) {
      const f = fixture();
      await expect(f.service.prioritizeWork(1001, ref, priority)).rejects.toMatchObject({ code: 'INVALID_PRIORITY' });
      expect(f.db.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    }
  });
  it('does not grant worker identities team lead management actions', async () => {
    const f = fixture({ actor: account({ subrole: 'payroll', capabilities_json: ['payroll.review'] }) });
    await expect(f.service.prioritizeWork(1001, TASK, 2)).rejects.toMatchObject({ code: 'ASSISTANT_CAPABILITY_DISABLED' });
    await expect(f.service.requestRetest(1001, { subrole: 'payroll', capability: 'payroll.review', reasonCode: 'workflow_failure' })).rejects.toMatchObject({ code: 'ASSISTANT_CAPABILITY_DISABLED' });
    expect(f.db.getConnection).not.toHaveBeenCalled();
    expect(f.db.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
});

describe('agency team lead retest requests', () => {
  const request = { subrole: 'payroll', capability: 'payroll.review', reasonCode: 'privacy_boundary' };
  it('records a scoped request for owner review without enabling the target capability', async () => {
    const f = fixture(); const before = structuredClone(f.target);
    await expect(f.service.requestRetest(1001, request)).resolves.toEqual({ requested: true });
    expect(f.events).toHaveLength(1);
    expect(f.events[0]).toMatchObject({ accountId: 2, agencyId: 450, actorId: 1001, type: 'verification_requested', changes: { verification: { capability: request.capability, reasonCode: request.reasonCode } } });
    expect(f.target).toEqual(before);
    expect(f.c.execute.mock.calls.some(([sql]) => /^(UPDATE|INSERT INTO assistant_verifications)/.test(sql))).toBe(false);
  });
  it('reuses an existing request for the same target and capability', async () => {
    const f = fixture();
    await f.service.requestRetest(1001, request);
    await expect(f.service.requestRetest(1001, { ...request, reasonCode: 'missing_evidence' })).resolves.toEqual({ requested: true, reused: true });
    expect(f.events).toHaveLength(1);
    expect(f.c.commit).toHaveBeenCalledTimes(2);
  });
  it('rejects missing team roles, unknown reasons and capabilities from another subrole', async () => {
    for (const input of [{ ...request, subrole: 'invented_role' }, { ...request, reasonCode: 'grant_permissions' }, { ...request, capability: 'clinical.review' }]) {
      const f = fixture();
      await expect(f.service.requestRetest(1001, input)).rejects.toBeDefined();
      expect(f.db.getConnection).not.toHaveBeenCalled();
      expect(f.events).toEqual([]);
    }
    for (const options of [{ targetExists: false }, { targetAgency: 453 }]) {
      const none = fixture(options);
      await expect(none.service.requestRetest(1001, request)).rejects.toMatchObject({ code: 'INVALID_RETEST_REQUEST' });
      expect(none.events).toEqual([]);
    }
  });
  it('does not treat dispatch permission as permission to request retesting', async () => {
    const f = fixture({ actor: account({ capabilities_json: ['team_lead.dispatch'] }) });
    await expect(f.service.requestRetest(1001, request)).rejects.toMatchObject({ code: 'ASSISTANT_CAPABILITY_DISABLED' });
    expect(f.events).toEqual([]);
  });
});

describe('team lead dashboard projection', () => {
  it('returns only same-agency verification and run status without worker packets or person mappings', async () => {
    const lead = account();
    const db = { execute: vi.fn(async (sql, values) => {
      if (sql.includes('WHERE aa.user_id=?')) return [[lead]];
      if (sql.startsWith('UPDATE assistant_work_items')) return [{ affectedRows: 0 }];
      expect(sql).not.toMatch(/packet_ciphertext|mapping_ciphertext|payload_ciphertext/);
      if (sql.includes('WHERE account_id=? AND agency_id=?')) { expect(values).toEqual([1, 450]); return [[]]; }
      expect(values).toEqual([450]);
      if (sql.includes('COUNT(w.id) taskCount')) return [[{ subrole: 'payroll', status: 'active', groupStatus: 'ready', taskCount: 1, blockedCount: 0 }]];
      if (sql.includes('preparingCount')) return [[{ subrole: 'payroll', preparingCount: '2' }]];
      if (sql.includes('assistant_verifications')) { const worker = { subrole: 'payroll', baa_status: 'pending', privacy_policy_json: {} }; return [[{ ...worker, capability: 'payroll.review', outcome: 'PASS', policyVersion: ASSISTANT_POLICY_VERSION, configurationHash: assistantConfigurationHash(worker), buildId: 'verified-build' }]]; }
      if (sql.includes('assistant_runs r')) return [[{ subrole: 'payroll', runRef: 'opaque-run-ref', outcome: 'FAIL', startedAt: '2026-11-02T14:55:00Z', completedAt: '2026-11-02T15:00:00Z', evidenceCiphertext: 'encrypted-evidence' }]];
      if (sql.includes('assistant_work_items w JOIN assistant_accounts')) return [[{ ref: TASK, subrole: 'payroll', title: 'Payroll review', status: 'queued', priority: 2 }]];
      throw Error('Unexpected lead summary query');
    }) };
    const decrypt = vi.fn(() => ({ browser: 'CANARY_BROWSER', viewport: 'CANARY_VIEWPORT', buildId: 'CANARY_BUILD', observedAt: 'CANARY_DATE', steps: ['CANARY_STEP'] }));
    const result = await createAssistantTeamsService({ db, decrypt }).workspace(1001);
    expect(result.team[0]).toMatchObject({ subrole: 'payroll', preparingCount: 2, lastOutcome: 'FAIL', lastEvidenceComplete: true, lastDurationSeconds: 300, verification: [{ capability: 'payroll.review', outcome: 'PASS', current: true }] });
    expect(decrypt).toHaveBeenCalledWith('encrypted-evidence', 'assistant-run:450:opaque-run-ref');
    expect(result.assignments).toEqual([{ ref: TASK, subrole: 'payroll', title: 'Payroll review', status: 'queued', priority: 2 }]);
    expect(result).not.toHaveProperty('sourceMapping');
    expect(result).not.toHaveProperty('packet');
    expect(JSON.stringify(result)).not.toMatch(/clientId|user_id|source_id|privacy_policy|CANARY|encrypted-evidence|opaque-run-ref/);
  });
  it.each(['seal_changed', 'verification_missing'])('rejects team metadata when the lead authority is %s', async state => {
    const lead = account({ agency_id: state === 'verification_missing' ? 2 : 450 });
    if (state === 'seal_changed') lead.configuration_fingerprint = 'changed';
    const db = { execute: vi.fn(async sql => {
      if (sql.includes('WHERE aa.user_id=?')) return [[lead]];
      if (sql.startsWith('UPDATE assistant_work_items')) return [{ affectedRows: 0 }];
      if (sql.includes('WHERE account_id=? AND agency_id=?') || sql.includes('FROM assistant_verifications')) return [[]];
      throw Error('Team metadata was queried before current authority was verified');
    }) };
    await expect(createAssistantTeamsService({ db }).workspace(1001)).rejects.toMatchObject({ code: state === 'seal_changed' ? 'ASSISTANT_CONFIGURATION_CHANGED' : 'CAPABILITY_NOT_VERIFIED' });
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('COUNT(w.id)'))).toBe(false);
  });
  it.each(['current_pass', 'old_policy', 'old_configuration', 'current_fail'])('reports verification freshness without exposing configuration snapshots: %s', async state => {
    const lead = account();
    const worker = { subrole: 'payroll', baa_status: 'pending', privacy_policy_json: { routingSecret: 'CANARY_PRIVATE_POLICY' } };
    const proof = { ...worker, capability: 'payroll.review', outcome: state === 'current_fail' ? 'FAIL' : 'PASS',
      policyVersion: state === 'old_policy' ? 'retired-policy' : ASSISTANT_POLICY_VERSION,
      configurationHash: state === 'old_configuration' ? 'CANARY_RETIRED_HASH' : assistantConfigurationHash(worker), buildId: 'verified-build' };
    const db = { execute: vi.fn(async sql => {
      if (sql.includes('WHERE aa.user_id=?')) return [[lead]];
      if (sql.startsWith('UPDATE assistant_work_items')) return [{ affectedRows: 0 }];
      if (sql.includes('COUNT(w.id) taskCount')) return [[{ subrole: 'payroll' }]];
      if (sql.includes('assistant_verifications')) { expect(sql).toContain('WHERE aa.agency_id=?'); return [[proof]]; }
      return [[]];
    }) };
    const result = await createAssistantTeamsService({ db }).workspace(1001);
    const current = state === 'current_pass' || state === 'current_fail';
    expect(result.team[0].verification).toEqual([{ capability: 'payroll.review', outcome: current ? proof.outcome : 'NOT_RUN', recordedOutcome: proof.outcome, current, policyVersion: proof.policyVersion, buildId: 'verified-build' }]);
    expect(JSON.stringify(result)).not.toMatch(/CANARY|privacy_policy|baa_status|configurationHash|routingSecret/);
  });
  it.each([null, {}, { browser: 'Browser', viewport: 'desktop', buildId: 'build', observedAt: 'time', steps: [] }, 'unreadable'])('reports missing or incomplete run evidence as false without releasing it', async evidence => {
    const lead = account();
    const db = { execute: vi.fn(async sql => {
      if (sql.includes('WHERE aa.user_id=?')) return [[lead]];
      if (sql.startsWith('UPDATE assistant_work_items')) return [{ affectedRows: 0 }];
      if (sql.includes('COUNT(w.id) taskCount')) return [[{ subrole: 'payroll' }]];
      if (sql.includes('assistant_runs r')) return [[{ subrole: 'payroll', runRef: 'opaque-run-ref', outcome: 'PASS', evidenceCiphertext: 'private-evidence' }]];
      return [[]];
    }) };
    const decrypt = () => { if (evidence === 'unreadable') throw Error('CANARY decryption error'); return evidence; };
    const result = await createAssistantTeamsService({ db, decrypt }).workspace(1001);
    expect(result.team[0]).toMatchObject({ lastEvidenceComplete: false, lastDurationSeconds: null });
    expect(JSON.stringify(result)).not.toMatch(/private-evidence|CANARY|opaque-run-ref/);
  });
});
