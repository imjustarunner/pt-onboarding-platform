import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
vi.mock('../documentSigning.service.js', () => ({ default: {} }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: vi.fn(value => String(value ?? '')) }));
vi.mock('../packetBrandChrome.service.js', () => ({ resolvePacketBrandChrome: vi.fn(async () => ({})) }));
import { buildClinicalRecordHtml, clinicalValueHtml, generateClinicalRecordPdf, clinicalRecordPrintOptions, clientRecordIdentity, documentedClinicalContext, clinicalPayloadHtml } from '../clinicalRecordPdf.service.js';
describe('clinical record PDF content and attachments', () => {
  it('renders nested clinical responses, explicit negative findings, and amendments without exposing signing proofs', () => {
    const html = buildClinicalRecordHtml({ agency: { id: 2, name: 'Fictional Practice' }, client: { full_name: 'Synthetic Client' }, includeDrafts: true, notes: [{ note: { id: 4, title: 'Progress note', metadata_json: { structuredChart: { consentConfirmed: false, riskAssessment: { findings: [{ label: 'Risk assessed', response: 'Historical only' }] }, generationReceipt: 'SECRET_PROOF' } }, note_payload: JSON.stringify({ sections: { Subjective: 'Source <script>not executable</script>', Objective: { responseToInterventions: ['Practiced a skill', 'Reported change'] } } }) }, addenda: [{ entry_kind: 'correction', body: 'Corrected factual detail', entry_reason: 'Clarified encounter context', created_by_user_id: 8, author_signed_at: '2026-11-17' }], revisions: [] }] });
    expect(html).toContain('Fictional Practice');
    expect(html).toContain('UNSIGNED DRAFT');
    expect(html).toContain('Historical only');
    expect(html).toContain('Practiced a skill');
    expect(html).toContain('Amendment / correction');
    expect(html).toContain('Clarified encounter context');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('SECRET_PROOF');
    expect(clinicalValueHtml(false)).toContain('No');
    expect(clinicalValueHtml(0)).toContain('0');
    expect(clinicalValueHtml(new Date('2026-11-17T18:00:00Z'))).toContain('2026-11-17T18:00:00.000Z');
  });
  it('identifies the treating clinician separately from the signatures on the approved version', () => {
    const html = buildClinicalRecordHtml({
      names: { 7: 'Treating clinician', 8: 'Note author', 9: 'Clinical supervisor', 10: 'Previous supervisor' },
      notes: [{ session: { provider_user_id: 7 }, note: {
        provider_signed_by_user_id: 8, provider_signed_at: '2026-11-11',
        supervisor_cosigned_by_user_id: 10, supervisor_cosigned_at: '2026-11-12',
        clinical_version_number: 2, note_payload: 'Signed documentation',
        clinical_version_signatures: [
          { action: 'author_sign', actorUserId: 8, signedAt: '2026-11-13' },
          { action: 'supervisor_sign', actorUserId: 9, signedAt: '2026-11-14' }
        ]
      } }]
    });
    expect(html).toContain('<dt>Treating Provider</dt><dd><span>Treating clinician</span></dd>');
    expect(html).toContain('electronically signed: Note author');
    expect(html).toContain('electronically signed: Clinical supervisor');
    expect(html).not.toContain('Previous supervisor');
  });
  it('appends all PDF pages, embeds original files, preserves duplicate filenames, and lists unrenderable files', async () => {
    const base = await PDFDocument.create(); base.addPage();
    const attachment = await PDFDocument.create(); attachment.addPage(); attachment.addPage();
    const original = await attachment.save(); let html;
    const bytes = await generateClinicalRecordPdf({ agency: { id: 2 }, attachments: [{ name: 'support.pdf', mimeType: 'application/pdf', buffer: original }, { name: 'support.pdf', mimeType: 'text/plain', buffer: Buffer.from('Original attachment') }] }, { renderHtml: async value => { html = value; return base.save(); } });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(html).toContain('2 appendix page(s) and embedded original');
    expect(html).toContain('support (2).pdf');
    expect(html).toContain('Embedded original file');
    const names = pdf.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
    expect(names.size()).toBe(4);
  });
  it('does not pretend pending amendments are approved clinical content', () => {
    const html = buildClinicalRecordHtml({ notes: [{ note: { provider_signed_at: '2026-11-15', note_payload: 'Approved note', clinical_version_id: 1 }, revisions: [{ id: 2, revisionNumber: 2, status: 'awaiting_author_signature', snapshot: { notePayload: 'Pending amendment canary' } }], addenda: [] }] });
    expect(html).not.toContain('Pending amendment canary');
  });
  it('includes separately stored presenting problem, prescribed frequency and discharge content from legacy plans', () => {
    const html = buildClinicalRecordHtml({ plans: [{ title: 'Historical plan', status: 'superseded', presentingProblem: 'Source presenting problem', prescribedFrequency: 'Every two weeks', dischargePlan: 'Source discharge criteria', goals: [] }] });
    expect(html).toContain('Source presenting problem');
    expect(html).toContain('Every two weeks');
    expect(html).toContain('Source discharge criteria');
    expect(html).toContain('provider signature not recorded');
  });
  it('uses only the selected agency identity and palette in the repeated print header and footer', () => {
    const options = clinicalRecordPrintOptions({ agency: { name: 'Clinic A', official_name: 'Clinic A, LLC', color_palette: { primary: '#315a42' } }, brand: { headerLogoDataUrl: 'data:image/png;base64,YQ==' } });
    expect(options.headerTemplate).toContain('Clinic A, LLC');
    expect(options.headerTemplate).toContain('data:image/png;base64,YQ==');
    expect(options.headerTemplate).toContain('#315a42');
    expect(options.footerTemplate).toContain('Clinic A, LLC');
    expect(options.headerTemplate + options.footerTemplate).not.toMatch(/Narriva|AuricWell|PlotTwist/i);
    expect(clinicalRecordPrintOptions({ agency: { name: 'Clinic B' } }).headerTemplate).not.toContain('Clinic A');
  });
  it('does not load a third-party logo URL into a confidential document', () => {
    const options = clinicalRecordPrintOptions({ agency: { name: 'Clinic A' }, brand: { headerLogoDataUrl: 'https://tracker.invalid/logo.png' } });
    expect(options.headerTemplate).not.toContain('tracker.invalid');
    expect(options.headerTemplate).toContain('Clinic A');
  });
  it('keeps the single-plan header with its content and uses local dates for nested fields', () => {
    const html = buildClinicalRecordHtml({
      singleDocument: true, recordTitle: 'Treatment plan', agency: { timezone: 'America/Denver' },
      plans: [{ status: 'active', title: 'Current plan', goals: [{ created_at: '2026-11-22T02:00:00.000Z', objectives: [{ updated_at: new Date('2026-11-23T02:45:00.000Z') }] }] }]
    });
    expect(html).toContain('single-document-plan');
    expect(html).toContain('2026-11-21');
    expect(html).toContain('2026-11-22');
    expect(html).not.toContain('T02:');
  });
  it('keeps single-note identity compact without a record-count cover or duplicate note heading', () => {
    const html = buildClinicalRecordHtml({ singleDocument: true, recordTitle: 'Psychotherapy progress note', agency: { name: 'Clinic A' }, client: { full_name: 'Fictional Client' }, notes: [{ note: { title: 'Psychotherapy progress note', provider_signed_at: '2026-11-18', note_payload: '{"sections":{"Subjective":"Documented response"}}' } }] });
    expect(html.match(/<h[12]>Psychotherapy progress note<\/h[12]>/g)).toHaveLength(1);
    expect(html).not.toContain('<dt>Notes</dt>');
    expect(html).not.toContain('Original attached files are embedded');
    expect(html).toContain('repeat(3,minmax(0,1fr))');
    expect(html).toContain('Fictional Client');
  });
  it('labels tutoring as a learning record and preserves the tutor signature', () => {
    const options = clinicalRecordPrintOptions({ agency: { name: 'Next Level Up' }, recordType: 'tutoring' });
    expect(options.headerTemplate).toContain('Learning record');
    const html = buildClinicalRecordHtml({ recordType: 'tutoring', notes: [{ note: { provider_signed_at: '2026-11-18', note_payload: 'Fictional learning evidence' } }] });
    expect(html).toContain('Tutor electronically signed');
    expect(html).not.toContain('Clinical supervisor electronically signed');
  });
  it('omits empty containers while retaining explicit zero and negative responses', () => {
    expect(clinicalValueHtml({ emptyList: [], emptyFields: {}, hiddenOnly: { id: 99 } })).toBe('');
    const html = clinicalValueHtml({ prompts: 0, currentRisk: false });
    expect(html).toContain('0');
    expect(html).toContain('No');
  });
  it('falls back to the agency name for damaged artwork and records agency PDF authorship', async () => {
    const base = await PDFDocument.create(); base.addPage();
    let printed;
    const bytes = await generateClinicalRecordPdf({ agency: { name: 'Example Agency' }, recordTitle: 'Progress note' }, {
      resolveBrand: async () => ({ headerLogoDataUrl: 'data:image/png;base64,bm90LWFuLWltYWdl' }),
      renderHtml: async (_html, options) => { printed = options; return base.save(); }
    });
    expect(printed.headerTemplate).toContain('Example Agency');
    expect(printed.headerTemplate).not.toContain('<img');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getAuthor()).toBe('Example Agency');
    expect(pdf.getCreator()).toBe('Example Agency');
  });
  it('keeps raw encounter instants intact instead of coercing them through the server local timezone', () => {
    const start = new Date('2026-11-18T16:00:00Z'), end = new Date('2026-11-18T16:55:00Z');
    const html = buildClinicalRecordHtml({ notes: [{ note: { provider_signed_at: '2026-11-18', note_payload: 'Source findings' }, session: { scheduled_start_at: start, scheduled_end_at: end } }] });
    expect(html).toContain(start.toISOString());
    expect(html).toContain(end.toISOString());
  });
  it('prints clinical client demographics, participants, diagnoses and presenting problem from the exact note', () => {
    const html = buildClinicalRecordHtml({ singleDocument: true,
      client: { id: 12, full_name: 'Fictional Client', identifier_code: 'DEMO-12', date_of_birth: '2000-01-02', contact_phone: '303-555-0100', email: 'client@example.test', address_street: '1 Example Lane', address_city: 'Denver', recordGuardians: [{ name: 'Example Guardian', relationship: 'Parent' }], ssn: 'DO_NOT_PRINT', access_token: 'DO_NOT_PRINT' },
      notes: [{ note: { provider_signed_at: '2026-11-18', note_payload: 'Recorded session', metadata_json: { sessionContext: { participants: 'Client and mother', participantsDetail: 'Example Mother, parent; present for the first ten minutes' }, narrivaPreflight: { clinicalContext: { presentingProblem: 'Original reason for care', diagnoses: [{ code: 'F41.1', description: 'Original documented diagnosis' }], diagnosticJustification: 'Original documented justification' } } } } }] });
    for (const value of ['DEMO-12', '2000-01-02', '303-555-0100', 'client@example.test', '1 Example Lane', 'Example Guardian', 'Client and mother', 'Example Mother', 'Original reason for care', 'F41.1', 'Original documented justification']) expect(html).toContain(value);
    expect(html).not.toContain('DO_NOT_PRINT');
  });
  it('does not backfill old notes with a current diagnosis or invent an academic diagnosis', () => {
    const html = buildClinicalRecordHtml({ client: { diagnoses: [{ code: 'NEW-DIAGNOSIS' }] }, notes: [{ note: { note_payload: 'Original note', metadata_json: {} } }] });
    expect(html).toContain('Not recorded in this note.'); expect(html).not.toContain('NEW-DIAGNOSIS');
    const academic = buildClinicalRecordHtml({ recordType: 'tutoring', notes: [{ note: { note_payload: 'Learning-plan results', metadata_json: {} } }] });
    expect(academic).not.toContain('Not recorded in this note.</span></dd></div><div class="field field--wide"><dt>Diagnoses');
    expect(academic).not.toContain('<dt>Diagnostic justification</dt>');
  });
  it('uses an allowlist for demographics and retains per-diagnosis justification', () => {
    expect(clientRecordIdentity({ id: 5, recordDemographics: { contactPhone: '555-0100', dateOfBirth: '2000-01-01', ssn: 'private' }, password: 'private' })).toMatchObject({ recordNumber: '5', phone: '555-0100', dateOfBirth: '2000-01-01' });
    expect(clientRecordIdentity({ date_of_birth: new Date('2000-01-01T00:00:00Z') }).dateOfBirth).toBe('2000-01-01');
    expect(documentedClinicalContext({}, { structuredChart: { diagnoses: [{ code: 'F41.1', justification: 'Source criteria' }] } }).diagnosticJustification).toBe('F41.1: Source criteria');
  });

  it('serializes structured tutoring summaries and historical responses before the string-based decryptor', () => {
    const html = clinicalPayloadHtml({ sections: { 'Session summary': 'Observed decimal results', criteria: ['Selected objective', 'Recorded performance'] } });
    expect(html).toContain('Observed decimal results'); expect(html).toContain('Selected objective'); expect(html).not.toContain('[object Object]');
    const record = buildClinicalRecordHtml({ recordType: 'tutoring', notes: [{ note: { saved_at: '2026-11-18', note_payload: { sections: { 'Session summary': 'Current plan results' } } }, addenda: [{ body: { summary: 'Earlier saved results' } }] }] });
    expect(record).toContain('Current plan results'); expect(record).toContain('Earlier saved results'); expect(record).not.toContain('[object Object]');
  });

  it('omits the pronouns field and gives the trained note sections and MSE separate smaller blocks', () => {
    const html = buildClinicalRecordHtml({ client: { full_name:'Example',pronouns:'PRIVATE_PRONOUN_FIELD' }, notes:[{ note:{ note_payload: JSON.stringify({sections:{Subjective:'Reported facts',Objective:'Observed facts',Interventions:'Psychoeducation',Plan:'Provider plan','Mental Status Examination':'Assessed domains'}}) } }] });
    expect(html).not.toContain('PRIVATE_PRONOUN_FIELD');expect(html).not.toContain('<dt>Pronouns</dt>');
    expect(html).toContain('note-section--mse');expect(html).toContain('font-size:9pt');expect(html).toContain('font-size:8pt');
    expect(html.match(/<section class="note-section/g)).toHaveLength(5);
  });

});
