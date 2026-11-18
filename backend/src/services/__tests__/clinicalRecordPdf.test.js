import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
vi.mock('../documentSigning.service.js', () => ({ default: {} }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: value => value }));
vi.mock('../packetBrandChrome.service.js', () => ({ resolvePacketBrandChrome: vi.fn(async () => ({})) }));
import { buildClinicalRecordHtml, clinicalValueHtml, generateClinicalRecordPdf, clinicalRecordPrintOptions } from '../clinicalRecordPdf.service.js';
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
});
