import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../assistantReviewPackets.service.js', () => ({ buildClinicalReviewPacket: vi.fn(), readSourceRevision: vi.fn(), inventoryEligibleCharts: vi.fn() }));
import { createAssistantTeamsService } from '../assistantTeams.service.js';
import { assistantStoredConfigurationHash } from '../assistantTeamPolicy.js';

const TASK = 'aa111111-1111-4111-8111-111111111111';
const RUN = 'bb222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-02T15:00:00Z');
const enabledFlags = { medicalBillingEnabled: true };
function fixture({ subrole = 'clinical', action = 'start', freshAgency = { feature_flags: enabledFlags } } = {}) {
  const account = { id: 1, user_id: 1001, agency_id: 450, subrole, status: 'active', group_status: 'ready',
    policy_revision: 1, baa_status: 'verified', capabilities_json: [`${subrole}.review`], schedule_json: {},
    privacy_policy_json: { enabled: true, approved: true, sampleReviewPassed: true, revision: 'v1', externalService: 'Synthetic provider', baaReference: 'synthetic-baa', sampleReviewReference: 'synthetic-sample' } };
  account.configuration_fingerprint = assistantStoredConfigurationHash(account);
  const work = { id: 10, ref: TASK, account_id: 1, agency_id: 450, task_kind: `${subrole}.review`, source_kind: 'clinical_chart', source_id: 50,
    source_hash: 'source-revision', packet_ciphertext: 'encrypted-packet', state: action === 'start' ? 'queued' : 'leased' };
  let run = action === 'complete' ? { id: 20, ref: RUN, work_id: work.id, account_id: 1, agency_id: 450, source_hash: work.source_hash,
    started_at: NOW, lease_expires_at: new Date(NOW.getTime() + 300000), completed_at: null } : null;
  const proposals = [];
  const c = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, values) => {
    if (sql.startsWith('SELECT * FROM assistant_accounts')) return [[{ ...account }]];
    if (sql.startsWith('SELECT feature_flags FROM agencies')) { expect(values).toEqual([450]); expect(sql).toContain('is_active=1'); expect(sql).toContain('COALESCE(is_archived,0)=0'); return [freshAgency ? [freshAgency] : []]; }
    if (sql.startsWith('UPDATE assistant_work_items w JOIN assistant_runs')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT * FROM assistant_work_items')) return [[{ ...work }]];
    if (sql.startsWith('SELECT r.*,w.ref work_ref')) return [run ? [{ ...run, work_ref: TASK }] : []];
    if (sql.startsWith('INSERT INTO assistant_runs')) { run = { id: 20, ref: values[0], work_id: 10, account_id: 1, agency_id: 450, source_hash: values[4], started_at: NOW, lease_expires_at: values[5], completed_at: null }; return [{ insertId: 20 }]; }
    if (sql.startsWith('SELECT r.*,w.state,w.source_hash')) return [[{ ...run, state: work.state, work_source_hash: work.source_hash }]];
    if (sql.startsWith('INSERT INTO assistant_proposals')) { proposals.push(values); return [{ insertId: 30 }]; }
    if (sql.startsWith('UPDATE assistant_runs SET completed_at')) { run.completed_at = NOW; run.outcome = values[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE assistant_work_items SET state='leased'")) { work.state = 'leased'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE assistant_work_items SET state=?')) { work.state = values[0]; return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected transaction query: ${sql}`);
  }) };
  const db = { getConnection: vi.fn(async () => c), execute: vi.fn(async sql => {
    if (sql.includes('FROM assistant_accounts aa')) return [[{ ...account, agency_feature_flags: enabledFlags }]];
    if (sql.startsWith('SELECT * FROM assistant_work_items')) return [[{ ...work }]];
    if (sql.startsWith('SELECT r.*,w.ref work_ref')) return [[{ ...run, work_ref: TASK, ...work, id: run.id, ref: run.ref, work_id: work.id }]];
    throw Error(`Unexpected query: ${sql}`);
  }) };
  const clinicalRevision = vi.fn(async () => work.source_hash);
  const service = createAssistantTeamsService({ db, clinicalRevision, now: () => NOW, decrypt: () => ({ ref: 'opaque-task-ref', sections: [] }), encrypt: () => 'encrypted-result' });
  const complete = ref => service.completeRun(1001, ref, { outcome: 'PASS', sourceRevision: work.source_hash, findings: [], evidence: { browser: 'Synthetic Browser', viewport: '1280x900', buildId: 'synthetic-build', observedAt: NOW.toISOString(), steps: ['Verified the synthetic scoped source.'] } });
  return { service, complete, db, c, work, proposals, clinicalRevision };
}

describe('clinical execution agency flags inside account transactions', () => {
  it.each(['clinical', 'compliance'])('starts and completes an enabled %s task from a locked account without joined flags', async subrole => {
    const f = fixture({ subrole });
    const started = await f.service.startTask(1001, TASK);
    expect(started.packet).toMatchObject({ ref: 'opaque-task-ref' });
    await expect(f.complete(started.runRef)).resolves.toMatchObject({ completed: true, outcome: 'PASS' });
    expect(f.proposals).toHaveLength(1);
    expect(f.c.execute.mock.calls.filter(([sql]) => sql.startsWith('SELECT feature_flags FROM agencies'))).toHaveLength(2);
    expect(f.c.commit).toHaveBeenCalledTimes(2);
    expect(f.clinicalRevision.mock.calls.filter(([,context])=>context?.mainDb===f.c)).toHaveLength(2);
  });
  it.each(['clinical', 'compliance'].flatMap(subrole => ['start', 'complete'].flatMap(action => ['disabled', 'missing'].map(state => ({ subrole, action, state })))))('rejects $action of $subrole when its current agency is $state', async ({ subrole, action, state }) => {
    const f = fixture({ subrole, action, freshAgency: state === 'disabled' ? { feature_flags: {} } : null });
    await expect(action === 'start' ? f.service.startTask(1001, TASK) : f.complete(RUN)).rejects.toMatchObject({ code: 'AGENCY_SERVICE_DISABLED' });
    expect(f.proposals).toHaveLength(0);
    expect(f.c.commit).not.toHaveBeenCalled();
    expect(f.c.rollback).toHaveBeenCalledOnce();
    expect(f.c.execute.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
  });
});
