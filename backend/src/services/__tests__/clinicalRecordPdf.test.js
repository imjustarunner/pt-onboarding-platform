import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
vi.mock('../documentSigning.service.js', () => ({ default: {} }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: value => value }));
import { buildClinicalRecordHtml, clinicalValueHtml, generateClinicalRecordPdf } from '../clinicalRecordPdf.service.js';
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
});
