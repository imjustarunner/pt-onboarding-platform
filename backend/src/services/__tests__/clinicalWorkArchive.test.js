import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: {} }));
vi.mock('../../models/NoteAidWorkQueueItem.model.js', () => ({ toApiItem: row => ({ clinicalSessionId: row.clinical_session_id, appointmentId: row.appointment_id, draftId: row.draft_id }) }));
import { createClinicalWorkArchive } from '../clinicalWorkArchive.service.js';

const actor = { id: 1, role: 'admin' }, target = { type: 'claim', id: 30 };
let archive, main, chart, mainConn, chartConn, authorize, claims, sessions, submitted, payments, holds, role, active, snapshots, archivedResources, auditFails, versionChange;
beforeEach(() => {
  claims = [{ id: 30, agency_id: 2, client_id: 3, clinical_session_id: 10, claim_lifecycle: 'draft', claim_status: 'PENDING', billing_revision: 1 }];
  sessions = [{ id: 10, agency_id: 2, client_id: 3, provider_user_id: 4, appointment_id: 20, service_code: '90837', updated_at: '2026-11-18' }];
  submitted = false; payments = false; holds = false; role = 'admin'; active = false; snapshots = []; archivedResources = []; auditFails = false; versionChange = false;
  const mainExecute = vi.fn(async (sql, params) => {
    if (sql.startsWith('SELECT id, role')) return [[{ id: 1, role, is_active: 1, is_archived: 0 }]];
    if (sql.includes('FROM clients WHERE') || sql.includes('FROM family_receivables')) return [[]];
    if (sql.includes('FROM appointments WHERE agency_id')) return [[{ id: 20, agency_id: 2, clinical_session_id: 10 }]];
    if (sql.includes('FROM clinical_note_drafts')) return [[{ id: 40, updated_at: versionChange ? 'changed' : '2026-11-18' }]];
    if (sql.includes('FROM note_aid_work_queue_items')) return [[{ id: 50, agency_id: 2, clinical_session_id: 10 }]];
    if (sql.includes('FROM clinical_work_archive_resources')) return [active ? [{ resource_type: 'clinical_session', resource_id: 10, archive_id: 7 }] : []];
    if (sql.startsWith('INSERT INTO clinical_work_archives')) { snapshots.push(params); return [{ insertId: 7 }]; }
    if (sql.startsWith('INSERT INTO clinical_work_archive_resources')) { archivedResources.push(params); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO user_activity_log')) { if (auditFails) throw new Error('Audit unavailable'); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM clinical_work_archives')) return [active ? [{ id: 7, agency_id: 2 }] : []];
    if (sql.startsWith('UPDATE clinical_work_archives')) { active = false; return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM clinical_work_archives a LEFT JOIN')) return [[{ id: 7, reason: 'Testing only', summary_json: { counts: { sessions: 1 }, sessions: [] } }]];
    throw new Error(`Unexpected main query: ${sql}`);
  });
  mainConn = { execute: mainExecute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(async () => { snapshots = []; archivedResources = []; }), release: vi.fn() };
  main = { execute: mainExecute, getConnection: vi.fn(async () => mainConn) };
  const chartExecute = vi.fn(async (sql, params) => {
    if (sql.startsWith('SELECT * FROM clinical_claims')) return [claims.filter(row => row.id === params[0] && row.agency_id === params[1])];
    if (sql.includes('FROM clinical_claims WHERE agency_id')) return [claims];
    if (sql.includes('FROM clinical_claim_sessions')) return [[{ clinical_session_id: 10, clinical_claim_id: 30 }]];
    if (sql.includes('FROM clinical_sessions WHERE agency_id')) return [sessions];
    if (sql.includes('FROM claimmd_claim_events')) return [submitted ? [{ id: 1 }] : []];
    if (sql.includes('FROM claimmd_payment_postings')) return [payments ? [{ id: 1 }] : []];
    if (sql.includes('FROM clinical_notes')) return [[{ id: 60, clinical_session_id: 10, provider_signed_at: '2026-11-18', is_legal_hold: holds ? 1 : 0 }]];
    throw new Error(`Unexpected clinical query: ${sql}`);
  });
  chartConn = { execute: chartExecute, beginTransaction: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  chart = { execute: chartExecute, getConnection: vi.fn(async () => chartConn) };
  authorize = vi.fn(); archive = createClinicalWorkArchive({ main, clinical: chart, authorize });
});

it('previews exact saved links without modifying records, signatures or claim state', async () => {
  const preview = await archive.preview(actor, 2, target);
  expect(preview.summary.counts).toEqual({ sessions: 1, claims: 1, appointments: 1, notes: 1, drafts: 1, myWork: 1 });
  expect(preview.resources).toEqual(expect.arrayContaining([{ type: 'claim', id: 30 }, { type: 'clinical_session', id: 10 }, { type: 'work_queue', id: 50 }]));
  expect(preview.version).toMatch(/^[a-f0-9]{64}$/);
  expect(main.execute.mock.calls.every(([sql]) => !/INSERT|UPDATE|DELETE/.test(sql))).toBe(true);
  expect(chart.execute.mock.calls.every(([sql]) => !/INSERT|UPDATE|DELETE/.test(sql))).toBe(true);
});
it('archives only by adding metadata links and an audit event; the actual clinical and scheduling rows stay intact', async () => {
  const { version } = await archive.preview(actor, 2, target);
  const result = await archive.archive(actor, 2, target, version, 'Test session created during rollout');
  expect(result.archiveId).toBe(7);
  expect(archivedResources).toHaveLength(6);
  expect(mainConn.commit).toHaveBeenCalledOnce();
  expect(chartConn.rollback).toHaveBeenCalledOnce();
  expect(chart.execute.mock.calls.some(([sql]) => /UPDATE |INSERT |DELETE /.test(sql))).toBe(false);
  const audit = main.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO user_activity_log'));
  expect(audit[1].slice(0, 3)).toEqual(['clinical_work_archived', 1, 2]);
  expect(main.execute.mock.calls.some(([sql]) => /UPDATE appointments|DELETE FROM/.test(sql))).toBe(false);
});
it.each(['provider', 'support', 'assistant'])('does not let %s initiate archives', async role => {
  await expect(archive.preview({ ...actor, role }, 2, target)).rejects.toMatchObject({ status: 403 });
  expect(chart.execute).not.toHaveBeenCalled();
});
it('rechecks current roles and agency scope on mutation', async () => {
  const { version } = await archive.preview(actor, 2, target);
  role = 'provider';
  await expect(archive.archive(actor, 2, target, version, 'Test archive request')).rejects.toMatchObject({ status: 403 });
  role = 'admin'; authorize.mockRejectedValueOnce(Object.assign(new Error('Denied'), { status: 403 }));
  await expect(archive.archive(actor, 2, target, version, 'Test archive request')).rejects.toMatchObject({ status: 403 });
  expect(mainConn.commit).not.toHaveBeenCalled();
});
it.each(['submitted', 'queued', 'paid', 'rejected'])('rejects %s claims instead of hiding financial work', async lifecycle => {
  claims[0].claim_lifecycle = lifecycle;
  await expect(archive.preview(actor, 2, target)).rejects.toMatchObject({ status: 409 });
});
it.each(['submission', 'payment', 'hold', 'remote_id'])('blocks archive when %s evidence exists even if lifecycle says draft', async evidence => {
  submitted = evidence === 'submission'; payments = evidence === 'payment'; holds = evidence === 'hold';
  if (evidence === 'remote_id') claims[0].claimmd_claim_id = 'remote-proof';
  await expect(archive.preview(actor, 2, target)).rejects.toMatchObject({ status: 409 });
});
it('rejects a stale preview without creating a partial archive', async () => {
  const { version } = await archive.preview(actor, 2, target);
  versionChange = true;
  await expect(archive.archive(actor, 2, target, version, 'Testing session only')).rejects.toMatchObject({ status: 409 });
  expect(mainConn.commit).not.toHaveBeenCalled();
  expect(snapshots).toEqual([]);
});
it('rolls back all archive links if mandatory audit persistence fails', async () => {
  const { version } = await archive.preview(actor, 2, target);
  auditFails = true;
  await expect(archive.archive(actor, 2, target, version, 'Testing session only')).rejects.toThrow('Audit unavailable');
  expect(archivedResources).toEqual([]);
  expect(mainConn.commit).not.toHaveBeenCalled();
  expect(chartConn.release).toHaveBeenCalledOnce();
});
it('retains the original archive and adds a reasoned restore event without submitting or changing records', async () => {
  active = true;
  expect(await archive.restore(actor, 2, 7, 'Confirmed this session should be active')).toEqual({ restored: true, archiveId: 7 });
  expect(main.execute.mock.calls.some(([sql]) => /DELETE|UPDATE clinical_claims|UPDATE appointments/.test(sql))).toBe(false);
  expect(main.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE clinical_work_archives'))[1]).toEqual([1, 'Confirmed this session should be active', 7, 2]);
});
it('requires a reason and keeps already archived groups from being archived twice', async () => {
  await expect(archive.archive(actor, 2, target, '', 'test')).rejects.toMatchObject({ status: 400 });
  active = true;
  await expect(archive.preview(actor, 2, target)).rejects.toMatchObject({ status: 409 });
});

it('does not hide an active client balance behind an administrative archive', async () => {
  const original = main.execute.getMockImplementation();
  main.execute.mockImplementation((sql, args) => sql.includes('FROM family_receivables') ? Promise.resolve([[{ id: 90 }]]) : original(sql, args));
  await expect(archive.preview(actor, 2, target)).rejects.toMatchObject({ status: 409 });
  expect(mainConn.commit).not.toHaveBeenCalled();
});

it('shows the session-local service date in previews rather than the UTC calendar date',async()=>{
  sessions[0].scheduled_start_at='2026-11-18 01:30:00';sessions[0].source_timezone='America/Denver';
  expect((await archive.preview(actor,2,target)).summary.sessions[0].dateOfService).toBe('2026-11-17');
});
