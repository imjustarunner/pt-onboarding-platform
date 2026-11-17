import { createHash } from 'node:crypto';
import ClientIntakeNoteDraft from '../models/ClientIntakeNoteDraft.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { parseIntakeSections } from './intakeImport.service.js';
import { parseTreatmentPlanText } from './treatmentPlanImport.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { intakeDraftContext } from './intakeDraftReview.service.js';
import { withHistoricalImportLock } from './ehrHistoricalImportLock.service.js';
import { saveChartRecord } from './clientChartImport.service.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
const fingerprint = text => createHash('sha256').update(text).digest('hex');
function sourceText(input) {
  const text = String(input.recordsImport?.text || input.text || '').trim();
  if (!text || text.length > 200000) throw fail('Paste the source record (at most 200,000 characters).');
  if (input.finalize || input.status && input.status !== 'draft' || input.clinicalSessionId || input.clinicalNoteId || input.officeEventId || input.sessionContext) {
    throw fail('Imported records must remain unsigned and unlinked to appointments or billing.');
  }
  return text;
}

/** Retain the source, without signing for the original author or creating care/billing. */
export async function importRecordsIntake({ agencyId, clientId, actorId, input }, deps = {}) {
  const text = sourceText(input), serviceCode = String(input.serviceCode || '').toUpperCase();
  if (!['H0031', '90791'].includes(serviceCode)) throw fail('Choose H0031 or 90791 for the imported intake.');
  const drafts = deps.drafts || ClientIntakeNoteDraft;
  const lock = deps.lock || withHistoricalImportLock;
  return lock(agencyId, clientId, 'intake', async () => {
    const rows = await drafts.listForClient({ agencyId, clientId });
    const sourceHash = fingerprint(text);
    const same = rows.find(row => {
      const context = intakeDraftContext(row);
      return row.status !== 'failed' && context.recordsImport?.fingerprint === sourceHash && row.service_code === serviceCode;
    });
    if (same) return { draft: same, reused: true };
    // Recover the pre-fix import that saved a draft but failed at /finalize.
    // A finalized note is never reopened or rewritten by records import.
    const legacy = rows.find(row => row.status !== 'final' && row.status !== 'failed'
      && ['client_creation_record_import','client_records_import'].includes(intakeDraftContext(row).source)
      && String(maybeDecryptNotePayload(row.scrubbed_input_enc) || '').trim() === text);
    const parsed = parseIntakeSections(text);
    const sections = (parsed.sections || []).map((section, index) => ({
      key: section.key || `section_${index + 1}`, label: section.title || section.label || section.key,
      body: section.content || section.body || '', order: index + 1
    }));
    const context = { source: 'client_records_import', nonBillable: true, clinicalSessionId: null, officeEventId: null,
      recordsImport: { fingerprint: sourceHash, importedByUserId: actorId, importedAt: new Date().toISOString(), sourceText: text } };
    const content = { status: 'draft', serviceCode,
      toolId: serviceCode === 'H0031' ? 'clinical_h0031_intake' : 'clinical_90791_intake_plan',
      scrubbedInputEnc: maybeEncryptNotePayload(text), noteBodyEnc: maybeEncryptNotePayload(text),
      noteSectionsJsonEnc: maybeEncryptNotePayload(JSON.stringify(sections)),
      sessionContextEnc: maybeEncryptNotePayload(JSON.stringify(context)),
      suggestedDxJson: parsed.diagnoses?.length ? JSON.stringify({ diagnoses: parsed.diagnoses, primary: parsed.diagnoses[0] }) : null };
    const draft = legacy
      ? await drafts.updateContent({ draftId: legacy.id, ...content, confirmedDxJson: null, diagnosisAction: null })
      : await drafts.create({ agencyId, clientId, providerUserId: null, ...content });
    return { draft, reused: false, recovered: !!legacy };
  });
}

export async function importRecordsTreatmentPlan({ agencyId, clientId, actorId, input }, deps = {}) {
  const text = sourceText(input), sourceToolId = `client_records_import:${createHash('sha256').update(text).digest('base64url')}`;
  const plans = deps.plans || ClinicalTreatmentPlan;
  return (deps.lock || withHistoricalImportLock)(agencyId, clientId, 'plan', async () => {
    const existing = await plans.listByClient({ agencyId, clientId });
    const same = existing.find(plan => plan.source_tool_id === sourceToolId && !['discarded','inactive'].includes(plan.status));
    const parsed = parseTreatmentPlanText(text);
    const plan = same ? await plans.findById(same.id) : await plans.create({ agencyId, clientId, createdByUserId: actorId,
      title: 'Imported Treatment Plan — provider finalization required', status: 'draft', sourceToolId,
      clinicalSessionId: null, clinicalNoteId: null, effectiveDate: parsed.effectiveDate || null,
      presentingProblem: parsed.presentingProblem || null, prescribedFrequency: parsed.prescribedFrequency || null,
      dischargePlan: parsed.dischargePlan || null,
      diagnosticJustification: parsed.diagnosticJustification || null, goals: parsed.goals || [] });
    // Keep the complete source encrypted, separate from editable discharge criteria.
    // Retry also repairs source persistence if the first response failed after creation.
    await (deps.saveSource || saveChartRecord)({ agencyId,clientId }, `plan_source_${plan.id}`, 0, { text,parsed }, actorId);
    return { plan, reused: !!same };
  });
}
