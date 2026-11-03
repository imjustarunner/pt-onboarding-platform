import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ main: vi.fn(), clinical: vi.fn(), find: vi.fn(), policy: vi.fn(), approved: vi.fn(), summary: vi.fn(), pdf: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.main }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: m.clinical } }));
vi.mock('../../services/noteAidChartAudit.service.js', () => ({ logNoteAidChartEvent: vi.fn() }));
vi.mock('../../services/clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: vi.fn() } }));
vi.mock('../../services/schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: vi.fn(async () => false), schedulingResponseForUser: vi.fn(async (_user, _agency, body) => body) }));
vi.mock('../../models/clinical/ClinicalNote.model.js', () => ({ default: { findById: m.find } }));
vi.mock('../../services/supervisedBillingPolicy.service.js', async original => ({ ...await original(), resolveDocumentationPolicy: m.policy, resolveNoteDocumentationPolicy: m.policy }));
vi.mock('../../services/clinicalNoteVersionBilling.service.js', async original => ({ ...await original(), getApprovedClinicalContext: m.approved }));
vi.mock('../../services/clinicalNoteVersion.service.js', async original => ({ ...await original(), getRevisionSummary: m.summary, ensureLegacyVersion: m.summary }));
vi.mock('../../services/treatmentSummaryPdf.service.js', () => ({ generateTreatmentSummaryPdf: m.pdf, extractNotePayloadText: note => note.note_payload }));
vi.mock('../../services/familyBillingEncryption.service.js', async original => ({ ...await original(), encryptFamilyBilling: vi.fn(() => 'Synthetic encrypted review'), decryptFamilyBilling: vi.fn(() => ({})) }));
import { getClinicalNoteById, downloadTreatmentSummaryPdf } from '../medicalBilling.controller.js';
import { getSuperviseeReviewDocument, recordSuperviseeDocumentReview, listSuperviseeDocumentReviews } from '../supervisedBilling.controller.js';
import { loadReviewDocument } from '../../services/clinicalReviewDocument.service.js';
import { reviewSnapshotToken } from '../../services/clinicalSupervisorReview.service.js';
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis(), setHeader: vi.fn(), send: vi.fn() });
let note, session;
beforeEach(() => {
  vi.clearAllMocks();
  note = { id: 444, client_id: 2297, agency_id: 450, clinical_session_id: 167, created_by_user_id: 7, provider_signed_by_user_id: 7, provider_signed_at: new Date('2026-10-22T18:00:00Z'), is_billable: 1, note_payload: JSON.stringify({ sections: { Narrative: 'DEMO QA screening' } }), note_type: 'SCREENING', metadata_json: { serviceCode: 'H0002', dateOfService: '2026-10-22' } };
  session = { id: 167, client_id: 2297, agency_id: 450, duration_minutes: 60, source_timezone: 'America/Denver', scheduled_start_at: null, scheduled_end_at: null, place_of_service: null, service_location_id: null, metadata_json: null };
  m.find.mockImplementation(async () => structuredClone(note));
  m.policy.mockResolvedValue({ supervisorUserId: 9, reviewSupervisorIds: [9] });
  m.approved.mockImplementation(async ({ note, session }) => ({ note, session: session || {}, version: { revisionId: null, revisionNumber: null, contentHash: null } }));
  m.summary.mockResolvedValue({ originalRevisionId: null, effectiveRevisionId: null, pendingRevisionId: null, revisions: [] });
  m.pdf.mockResolvedValue(Buffer.from('Synthetic PDF fixture'));
  m.main.mockImplementation(async sql => sql.includes('FROM user_agencies') ? [[{ user_id: 7 }]] : [[]]);
  m.clinical.mockImplementation(async sql => {
    // The migrated clinical schema has metadata_json/service_location_id, but
    // no location_label column. Do not let a permissive SQL stub hide that error.
    if (sql.includes('FROM clinical_sessions')) {
      if (/\blocation_label\b/.test(sql)) throw Object.assign(new Error('Unknown column location_label'), { code: 'ER_BAD_FIELD_ERROR' });
      return [[structuredClone(session)]];
    }
    if (sql.includes('FROM clinical_notes')) return [[structuredClone(note)]];
    return [[]];
  });
});
async function readPair() {
  const req = { user: { id: 9, role: 'super_admin' }, params: { noteId: '444' }, query: { agencyId: '450' } };
  const chart = response(), review = response(), next = vi.fn();
  await getClinicalNoteById(req, chart, next);
  await getSuperviseeReviewDocument({ ...req, params: { providerId: '7', type: 'note', documentId: '444' } }, review, next);
  expect(next).not.toHaveBeenCalled();
  return { chart: chart.json.mock.calls[0][0].note, review: review.json.mock.calls[0][0] };
}
it('opens an existing signed H0002 with missing service times using matching endpoint snapshots', async () => {
  const pair = await readPair();
  expect(pair.chart.reviewSnapshotToken).toBe(pair.review.reviewSnapshotToken);
  expect(pair.review.reviewSnapshotToken).toBe(reviewSnapshotToken(note, session));
  expect(pair.chart.effectiveServiceDetails).toMatchObject({ durationMinutes: 60, startTime: null, endTime: null, locationLabel: null });
  expect(pair.review.canCosign).toBe(true);
  expect(pair.review.content).toContain('DEMO QA screening');
});
it('binds the stored encounter location and timing identically through both endpoints', async () => {
  Object.assign(session, { metadata_json: { locationLabel: 'DEMO QA office', unrelated: 'retain' }, service_location_id: 12, place_of_service: '11', scheduled_start_at: new Date('2026-10-22T17:00:00Z'), scheduled_end_at: new Date('2026-10-22T18:00:00Z') });
  const pair = await readPair();
  expect(pair.chart.reviewSnapshotToken).toBe(pair.review.reviewSnapshotToken);
  expect(pair.chart.effectiveServiceDetails).toEqual(pair.review.reviewSnapshot.effectiveServiceDetails);
  expect(pair.chart.effectiveServiceDetails).toMatchObject({ locationLabel: 'DEMO QA office', startTime: '11:00', endTime: '12:00' });
  session.metadata_json.locationLabel = 'Different location';
  expect(reviewSnapshotToken(note, session)).not.toBe(pair.chart.reviewSnapshotToken);
});
it('reports encounter read failure instead of issuing a false empty snapshot', async () => {
  m.clinical.mockRejectedValue(new Error('Database temporarily unavailable'));
  const res = response(), next = vi.fn();
  await getClinicalNoteById({ user: { id: 9, role: 'super_admin' }, params: { noteId: '444' }, query: { agencyId: '450' } }, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 503, message: expect.stringContaining('encounter details') }));
  expect(res.json).not.toHaveBeenCalled();
});

it('serves the same approved amended version through the chart and supervisor review and disables another legacy cosign', async () => {
  const approved = { ...note, note_payload: JSON.stringify({ sections: { Narrative: 'Approved version two content' } }), clinical_version_id: 12, clinical_version_number: 2, clinical_version_content_hash: 'b'.repeat(64), clinical_version_addenda: [] };
  const frozenSession = { ...session, duration_minutes: 45, place_of_service: '11', metadata_json: { locationLabel: 'Approved office' } };
  const version = { revisionId: 12, revisionNumber: 2, contentHash: 'b'.repeat(64) };
  m.approved.mockResolvedValue({ note: approved, session: frozenSession, version });
  m.summary.mockResolvedValue({ originalRevisionId: 10, effectiveRevisionId: 12, pendingRevisionId: null, revisions: [] });
  const pair = await readPair();
  expect(pair.chart.reviewSnapshotToken).toBe(pair.review.reviewSnapshotToken);
  expect(pair.chart.clinicalVersion).toEqual(version);
  expect(pair.review.contentHash).toBe('b'.repeat(64));
  expect(pair.review.content).toContain('Approved version two content');
  expect(pair.review.canCosign).toBe(false);
  expect(pair.chart.effectiveServiceDetails).toEqual(pair.review.reviewSnapshot.effectiveServiceDetails);
});

it('exports the approved narrative and its actual version signatures without attributing the original author signature to a supervisor amendment', async () => {
  const approved = { ...note, note_type: 'TREATMENT_SUMMARY', note_payload: 'Approved supervisor amendment', clinical_version_id: 12, clinical_version_number: 2, clinical_version_content_hash: 'b'.repeat(64), clinical_version_addenda: [], clinical_version_signatures: [{ action: 'supervisor_sign', actorUserId: 9, signedAt: '2026-11-03T19:00:00Z' }], supervisor_cosigned_at: '2026-11-03T19:00:00Z' };
  m.approved.mockResolvedValue({ note: approved, session, version: { revisionId: 12 } });
  const res = response(), next = vi.fn();
  await downloadTreatmentSummaryPdf({ user: { id: 9, role: 'super_admin' }, params: { noteId: '444' }, query: { agencyId: '450' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.pdf).toHaveBeenCalledWith(expect.objectContaining({ bodyText: expect.stringContaining('Approved supervisor amendment'), providerSignedAt: null, supervisorSignedAt: '2026-11-03T19:00:00Z' }));
  expect(m.pdf.mock.calls[0][0].bodyText).toContain('Clinical version 2');
  expect(res.send).toHaveBeenCalled();
});

it('uses the approved revision hash in shared review reads, recorded reviews, and review listings', async () => {
  note.supervisor_cosigned_at = '2026-10-23';
  const approved = { ...note, title: 'Approved amended title', note_payload: 'Approved version narrative', clinical_version_id: 12, clinical_version_number: 2, clinical_version_content_hash: 'b'.repeat(64), clinical_version_addenda: [], supervisor_cosigned_by_user_id: 9, metadata_json: { ...note.metadata_json, supervisorCosign: { contentHash: 'b'.repeat(64) } } };
  m.approved.mockResolvedValue({ note: approved, session, version: { revisionId: 12, revisionNumber: 2, contentHash: 'b'.repeat(64) } });
  m.policy.mockResolvedValue({ supervisorUserId: 9, reviewSupervisorIds: [9], nonBillableReview: 'all', cosignDueDays: 7 });
  const document = await loadReviewDocument({ agencyId: 450, providerUserId: 7 }, 'note', 444);
  expect(document.hash).toBe('b'.repeat(64)); expect(document.content).toContain('Approved version narrative');
  const req = { user: { id: 9, role: 'super_admin' }, params: { providerId: '7' }, query: { agencyId: '450' }, body: { agencyId: 450, documentType: 'note', documentId: 444, outcome: 'approved', attested: true, contentHash: 'b'.repeat(64) } };
  const next = vi.fn(); await recordSuperviseeDocumentReview(req, response(), next);
  expect(next).not.toHaveBeenCalled();
  expect(m.main.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO clinical_document_reviews'))[1][5]).toBe('b'.repeat(64));
  const list = response(); await listSuperviseeDocumentReviews(req, list, next);
  expect(next).not.toHaveBeenCalled();
  expect(list.json.mock.calls[0][0].documents[0]).toMatchObject({ title: 'Approved amended title', clinicalVersion: { revisionId: 12 }, cosignedAt: '2026-10-23', amendmentSignoffRequired: false });
});

it.skipIf(process.env.CLINICAL_REVIEW_MYSQL_TEST !== '1')('reads and approves corrections against the migrated MySQL encounter schema', async () => {
  // Only the disposable CI database is allowed. A connection-local temporary
  // table shadows the fixture table; no retained database records are changed.
  expect(process.env.DB_HOST).toBe('127.0.0.1');
  expect(process.env.DB_PORT).toBe('33316');
  expect(process.env.DB_NAME).toBe('family_billing_test');
  expect(process.env.DB_USER).toBe('family_billing_test');
  const { readFile } = await import('node:fs/promises');
  const { default: mysql } = await import('mysql2/promise');
  const { applyApprovedServiceDetails } = await import('../../services/clinicalSupervisorReview.service.js');
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: 33316, database: 'family_billing_test', user: 'family_billing_test', password: process.env.DB_PASSWORD, timezone: 'Z' });
  try {
    const readMigration = name => readFile(new URL(`../../../../database/clinical_migrations/${name}`, import.meta.url), 'utf8');
    const initial = await readMigration('001_create_clinical_data_plane.sql');
    await connection.query(initial.match(/CREATE TABLE IF NOT EXISTS clinical_sessions\b[\s\S]*?;/)[0].replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE'));
    for (const file of ['002_medical_billing_foundations.sql', '003_session_service_code_location.sql', '015_appointment_clinical_sessions.sql']) {
      await connection.query((await readMigration(file)).match(/ALTER TABLE clinical_sessions\b[\s\S]*?;/)[0]);
    }
    await connection.execute('INSERT INTO clinical_sessions (id,agency_id,client_id,office_event_id,provider_user_id,duration_minutes,source_timezone,metadata_json,is_telehealth) VALUES (167,450,2297,999,7,60,?,?,1)', ['America/Denver', JSON.stringify({ unrelated: 'preserved' })]);
    const fallback = m.clinical.getMockImplementation();
    m.clinical.mockImplementation((sql, values) => /(?:FROM|UPDATE) clinical_sessions\b/.test(sql) ? connection.execute(sql, values) : fallback(sql, values));
    const before = await readPair();
    expect(before.chart.reviewSnapshotToken).toBe(before.review.reviewSnapshotToken);
    const location = { id: 12, name: 'DEMO QA office', place_of_service: '11', billing_office_location_id: 13 };
    const mainFallback = m.main.getMockImplementation();
    m.main.mockImplementation((sql, values) => sql.includes('FROM agency_service_locations') ? Promise.resolve([[location]]) : mainFallback(sql, values));
    const details = { durationMinutes: 60, locationLabel: location.name, serviceLocationId: 12, placeOfService: '11', startTime: '11:00', endTime: '12:00' };
    const meta = { serviceDetailAmendments: [{ id: 'synthetic-amendment', dateOfService: '2026-10-22', timeZone: 'America/Denver', serviceDetails: details }] };
    await applyApprovedServiceDetails({ execute: m.clinical }, note, meta, 9, '2026-11-03T18:00:00Z');
    const [[updated]] = await connection.execute('SELECT * FROM clinical_sessions WHERE id=167');
    expect(updated).not.toHaveProperty('location_label');
    expect(updated.is_telehealth).toBe(0);
    expect(updated.metadata_json).toMatchObject({ unrelated: 'preserved', locationLabel: location.name });
    expect(updated).toMatchObject({ service_location_id: 12, billing_office_location_id: 13, duration_minutes: 60, place_of_service: '11' });
    expect(meta.serviceDetailAmendments[0]).toMatchObject({ approvedByUserId: 9, approvedAt: '2026-11-03T18:00:00Z' });
    const after = await readPair();
    expect(after.chart.reviewSnapshotToken).toBe(after.review.reviewSnapshotToken);
    expect(after.chart.reviewSnapshotToken).not.toBe(before.chart.reviewSnapshotToken);
    expect(after.chart.effectiveServiceDetails).toMatchObject(details);
  } finally { await connection.end(); }
});
