import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: () => () => {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../narrivaAccess.service.js', () => ({ requireNarrivaClient: vi.fn() }));
vi.mock('../clinicalNoteVersionBilling.service.js', () => ({ getApprovedClinicalContext: vi.fn() }));
vi.mock('../clinicalNoteVersion.service.js', () => ({ getRevisionSummary: vi.fn() }));
vi.mock('../sessionSupportingMaterials.service.js', () => ({ downloadMaterial: vi.fn() }));
vi.mock('../clinicalRecordPdf.service.js', () => ({ generateClinicalRecordPdf: vi.fn() }));
vi.mock('../auditEvent.service.js', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../guardianFileShares.service.js', () => ({ shareableFile: document => !document.quarantine_path && (!document.scan_status || document.scan_status === 'clean') && ['application/pdf','image/jpeg','image/png','text/plain'].includes(document.mime_type || 'application/pdf') }));
import { createClinicalRecordExporter } from '../clinicalRecordExport.service.js';
const user = { id: 8, role: 'provider' };
let dependencies, note;
beforeEach(() => {
  note = { id: 3, agency_id: 2, client_id: 4, title: 'Synthetic note', provider_signed_at: '2026-11-10', created_by_user_id: 8, metadata_json: { dateOfService: '2026-11-10' } };
  dependencies = { clinicalDb: { execute: vi.fn(async sql => sql.includes('clinical_treatment_plans') ? [[]] : [[note]]) }, mainDb: {}, clientAccess: vi.fn(async () => ({ id: 4, full_name: 'Synthetic Client' })), findAgency: vi.fn(async () => ({ id: 2, name: 'Fictional Practice' })), noteModel: { findById: vi.fn(async () => note) }, planModel: { findById: vi.fn() }, approvedContext: vi.fn(async ({ note, session }) => ({ note, session })), revisions: vi.fn(async () => ({ revisions: [], currentAddenda: [] })), findUser: vi.fn(async () => ({ first_name: 'Fictional', last_name: 'Provider' })), phiDocuments: vi.fn(async () => []), chartArtifacts: vi.fn(async () => ({ artifacts: [] })), intakeDocuments: vi.fn(async () => []), artifactView: vi.fn(), renderArtifact: vi.fn(), downloadMaterial: vi.fn(), readObject: vi.fn(), decryptDocument: vi.fn(), render: vi.fn(async () => Buffer.from('synthetic-pdf')), audit: vi.fn(async () => {}) };
});
describe('clinical record export scope', () => {
  it('rejects an agency mismatch before client or attachment reads', async () => {
    await expect(createClinicalRecordExporter(dependencies)({ user }, { noteId: 3, agencyId: 99 })).rejects.toMatchObject({ status: 404 });
    expect(dependencies.clientAccess).not.toHaveBeenCalled();
    expect(dependencies.phiDocuments).not.toHaveBeenCalled();
  });
  it('blocks restricted notes and denies missing care access before record queries', async () => {
    note.metadata_json = { restricted: true };
    await expect(createClinicalRecordExporter(dependencies)({ user }, { noteId: 3, agencyId: 2 })).rejects.toMatchObject({ status: 403 });
    note.metadata_json = {};
    dependencies.clientAccess.mockRejectedValue(Object.assign(new Error('No active assignment'), { status: 403 }));
    await expect(createClinicalRecordExporter(dependencies)({ user }, { clientId: 4, agencyId: 2 })).rejects.toMatchObject({ status: 403 });
    expect(dependencies.clinicalDb.execute).not.toHaveBeenCalled();
  });
  it('uses the approved version and retains amendment provenance', async () => {
    dependencies.approvedContext.mockImplementation(async ({ note }) => ({ note: { ...note, title: 'Approved amended note' }, session: {} }));
    dependencies.revisions.mockResolvedValue({ revisions: [{ id: 7, approval: { approvedAt: '2026-11-11' } }], currentAddenda: [{ id: 8, body: 'Signed addendum', created_by_user_id: 8 }] });
    const result = await createClinicalRecordExporter(dependencies)({ user }, { noteId: 3, agencyId: 2 });
    expect(result.filename).toBe('clinical-note-3.pdf');
    expect(dependencies.render.mock.calls[0][0].notes[0]).toMatchObject({ note: { title: 'Approved amended note' }, addenda: [{ body: 'Signed addendum' }], revisions: [{ id: 7 }] });
  });
  it('never reads another agency attachment and manifests quarantined content', async () => {
    dependencies.phiDocuments.mockResolvedValue([{ id: 12, agency_id: 99, client_id: 4, storage_path: 'other-agency-file', original_name: 'Other record' }, { id: 13, agency_id: 2, client_id: 4, quarantine_path: 'private-quarantine', original_name: 'Pending source' }]);
    await createClinicalRecordExporter(dependencies)({ user }, { clientId: 4, agencyId: 2 });
    expect(dependencies.readObject).not.toHaveBeenCalled();
    const input = dependencies.render.mock.calls[0][0];
    expect(input.manifest).toEqual([expect.objectContaining({ name: 'Pending source', reason: 'Pending security scan or quarantined.' })]);
  });
  it('does not follow an unverified legacy storage path supplied on a clinical document', async () => {
    note.clinical_session_id = 17;
    dependencies.clinicalDb.execute.mockImplementation(async sql => sql.includes('clinical_sessions') ? [[{ id: 17 }]] : sql.includes('clinical_documents') ? [[{ id: 24, agency_id: 2, client_id: 4, title: 'Legacy source', storage_path: 'unverified-path' }]] : [[]]);
    await createClinicalRecordExporter(dependencies)({ user }, { noteId: 3, agencyId: 2 });
    expect(dependencies.readObject).not.toHaveBeenCalled();
    expect(dependencies.render.mock.calls[0][0].manifest[0].reason).toContain('verified client document link');
  });
  it('fails the export rather than silently dropping a readable-scope attachment after storage errors', async () => {
    dependencies.phiDocuments.mockResolvedValue([{ id: 13, agency_id: 2, client_id: 4, storage_path: 'owned-file', scan_status: 'clean', original_name: 'Owned file', mime_type: 'application/pdf' }]);
    dependencies.readObject.mockRejectedValue(new Error('private-storage-details'));
    await expect(createClinicalRecordExporter(dependencies)({ user }, { clientId: 4, agencyId: 2 })).rejects.toMatchObject({ status: 503, message: 'A supporting document could not be read. No incomplete record was exported.' });
    expect(dependencies.render).not.toHaveBeenCalled();
  });
  it('includes signed intake documents and all rendered enrollment response fields', async () => {
    dependencies.chartArtifacts.mockResolvedValue({ artifacts: [{ viewKey: 'isd-29', title: 'Signed consent' }, { viewKey: 'intake-answers-28', title: 'Enrollment responses' }] });
    dependencies.intakeDocuments.mockResolvedValue([{ id: 29, signed_pdf_path: 'trusted-client-signed-file' }]);
    dependencies.readObject.mockResolvedValue(Buffer.from('signed-original'));
    dependencies.artifactView.mockResolvedValue({ html: '<h1>Enrollment answers</h1><p>Fictional detailed response</p>' });
    dependencies.renderArtifact.mockResolvedValue(Buffer.from('rendered-answers'));
    await createClinicalRecordExporter(dependencies)({ user }, { clientId: 4, agencyId: 2 });
    expect(dependencies.readObject).toHaveBeenCalledWith('trusted-client-signed-file');
    expect(dependencies.render.mock.calls[0][0].attachments).toHaveLength(2);
    expect(dependencies.renderArtifact).toHaveBeenCalledWith(expect.stringContaining('Fictional detailed response'));
  });
  it('exports only the requester’s workspace draft and never joins addenda from a chart note with the same numeric ID', async () => {
    dependencies.draftModel = { findByIdForUser: vi.fn(async () => ({ id: 3, user_id: 8, agency_id: 2, client_id: 4, output_json: JSON.stringify({ sections: { Subjective: 'Own fictional draft' }, meta: {} }) })) };
    const result = await createClinicalRecordExporter(dependencies)({ user }, { draftId: 3, agencyId: 2 });
    expect(dependencies.draftModel.findByIdForUser).toHaveBeenCalledWith({ draftId: 3, userId: 8 });
    expect(dependencies.approvedContext).not.toHaveBeenCalled();
    expect(dependencies.revisions).not.toHaveBeenCalled();
    expect(dependencies.clinicalDb.execute).not.toHaveBeenCalled();
    expect(result.filename).toBe('workspace-draft-3.pdf');
    expect(dependencies.render.mock.calls[0][0]).toMatchObject({ includeDrafts: true, notes: [{ note: { is_workspace_draft: true } }] });
  });
  it('exports plan signatures only when the canonical current content was actually approved', async () => {
    dependencies.clinicalDb.execute.mockImplementation(async sql => sql.includes('clinical_treatment_plans') ? [[{ id: 30 }]] : sql.includes('SELECT n.*') ? [[note]] : [[]]);
    dependencies.planModel.findById.mockResolvedValue({ id: 30, agency_id: 2, client_id: 4, status: 'active', title: 'Fictional plan', presentingProblem: 'Source presentation', provider_signed_at: 'unverified-old-provider-date', supervisor_cosigned_at: 'unverified-old-supervisor-date' });
    dependencies.planApproval = vi.fn(async () => ({ providerApproved: false, providerSignedAt: null, supervisorApproved: false, supervisorApprovedAt: null, legacyRecordOnFile: true }));
    await createClinicalRecordExporter(dependencies)({ user }, { clientId: 4, agencyId: 2 });
    expect(dependencies.render.mock.calls[0][0].plans[0]).toMatchObject({ presentingProblem: 'Source presentation', provider_signed_at: null, supervisor_signed_at: null, supervisor_cosigned_at: null, legacyRecordOnFile: true });
  });
  it('rejects an oversized record during collection without building a partial PDF', async () => {
    dependencies.phiDocuments.mockResolvedValue([{ id: 13, agency_id: 2, client_id: 4, storage_path: 'owned-file', scan_status: 'clean', original_name: 'Owned file', mime_type: 'application/pdf' }]);
    dependencies.readObject.mockResolvedValue({ length: 101 * 1024 * 1024 });
    await expect(createClinicalRecordExporter(dependencies)({ user }, { clientId: 4, agencyId: 2 })).rejects.toMatchObject({ status: 413 });
    expect(dependencies.render).not.toHaveBeenCalled();
  });
  it('preserves clean office documents as embedded originals instead of dropping non-PDF source files', async () => {
    dependencies.phiDocuments.mockResolvedValue([{ id: 13, agency_id: 2, client_id: 4, storage_path: 'owned-file', scan_status: 'clean', original_name: 'Original clinical document.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]);
    dependencies.readObject.mockResolvedValue(Buffer.from('synthetic-original-file'));
    await createClinicalRecordExporter(dependencies)({ user }, { clientId: 4, agencyId: 2 });
    expect(dependencies.render.mock.calls[0][0].attachments[0]).toMatchObject({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'document-13-Original_clinical_document.docx' });
  });
});
