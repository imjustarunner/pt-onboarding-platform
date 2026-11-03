// DEMO QA ONLY: synthetic, in-memory records. This module has no network client.
const copy = value => JSON.parse(JSON.stringify(value));
const stamp = '2026-11-03T17:12:34Z';
let sequence = 0;
const original = noteId => ({ id: noteId * 10, revisionNumber: 1, origin: 'original', status: 'original', contentHash: `DEMO-QA-original-${noteId}`, createdAt: '2026-11-01T17:00:00Z', entryManifestHash: 'DEMO-QA-empty-entry-manifest', currentAddenda: [], signatures: [{ id: 1, action: 'initial_author_sign', actorUserId: 990009, signedAt: '2026-11-01T17:00:00Z', contentHash: `DEMO-QA-original-${noteId}` }], capabilities: {}, snapshot: { title: `DEMO QA clinical note ${noteId}`, notePayload: { sections: { Subjective: 'DEMO QA original signed narrative. This synthetic client practiced a grounding exercise.', Interventions: 'DEMO QA guided skills practice.', Plan: 'DEMO QA follow up with the agreed practice.' }, meta: { synthetic: true } }, metadataJson: { structuredChart: { participants: 'DEMO QA client', patientPresent: true } }, encounterContext: { clinicalSessionId: noteId + 1000, dateOfService: '2026-11-01', serviceCode: 'H0002', durationMinutes: 45, startTime: '10:00', endTime: '10:45', locationLabel: 'DEMO QA Office', placeOfService: '11', serviceLocationId: 990005, participants: 'DEMO QA client', patientPresent: true, sourceTimezone: 'America/Denver' } } });
export const qa = { scenario: 'supervisor', calls: [], completed: [], authorTasks: [], records: {}, queue: [], failSignature: false, delaySignature: 0 };
export function resetScenario(scenario = 'supervisor') {
  Object.assign(qa, { scenario, calls: [], completed: [], authorTasks: [], records: {}, queue: [990071, 990072], failSignature: scenario === 'conflict', delaySignature: 0 });
  for (const noteId of qa.queue) {
    const first = original(noteId); qa.records[noteId] = { revisions: [first], effectiveRevisionId: first.id, pendingRevisionId: null };
  }
  if (['provider', 'conflict'].includes(scenario)) {
    const base = original(990071); const pending = { ...base, id: base.id + 1, revisionNumber: 2, origin: scenario === 'provider' ? 'billing' : 'supervisor', status: scenario === 'provider' ? 'awaiting_author_signature' : 'draft', reason: 'DEMO QA proposed clarification', proposedByUserId: 990022, originalAuthorUserId: 990009, responsibleSupervisorUserId: 990008, requiresSupervisorCosign: true, contentHash: 'DEMO-QA-proposed-content', signatures: [], capabilities: scenario === 'provider' ? { canSign: true } : { canCosign: true } };
    if (scenario === 'provider') { pending.entryManifestHash = 'DEMO-QA-attached-entry-manifest'; pending.currentAddenda = [{ id: 990044, entry_kind: 'addendum', body: 'DEMO QA separately signed addition attached after the amendment draft was prepared.', created_by_user_id: 990077, author_signed_at: '2026-11-03T16:00:00Z', revision_signature_id: 990031, signature_content_hash: 'DEMO-QA-independent-entry-signature' }]; }
    pending.snapshot = copy(base.snapshot); pending.snapshot.notePayload.sections.Subjective = 'DEMO QA proposed revised narrative; original version remains available.';
    qa.records[990071].revisions.push(pending); qa.records[990071].pendingRevisionId = pending.id;
  }
}
resetScenario();
const capabilities = () => ({ canCreateProvider: false, canCreateSupervisor: qa.scenario === 'supervisor', canCreateBilling: qa.scenario === 'billing' });
function summary(noteId) { const record = qa.records[noteId]; return copy({ originalRevisionId: record.revisions[0].id, effectiveRevisionId: record.effectiveRevisionId, pendingRevisionId: record.pendingRevisionId, revisions: record.revisions, effectiveRevision: record.revisions.find(item => item.id === record.effectiveRevisionId), pendingRevision: record.revisions.find(item => item.id === record.pendingRevisionId) || null, capabilities: capabilities() }); }
const legacy = { durationMinutes: 10, startTime: '10:00', endTime: '10:10', locationLabel: 'DEMO QA Virtual — client home', placeOfService: '10', serviceLocationId: null, participants: 'Guardian: DEMO QA; interpreter: DEMO QA', patientPresent: false };
function note(noteId) {
  const record = qa.records[noteId], effective = record.revisions.find(item => item.id === record.effectiveRevisionId), context = effective.snapshot.encounterContext;
  const hasLegacy = noteId === 990071 && record.effectiveRevisionId === record.revisions[0].id;
  return { id: noteId, agencyId: 990002, clientName: `DEMO QA synthetic client ${noteId}`, title: effective.snapshot.title, reviewSnapshotToken: `DEMO-QA-snapshot-${noteId}`, providerSignedAt: '2026-11-01T17:00:00Z', providerSignedByUserId: 990009, providerSigner: { id: 990009, name: 'DEMO QA Original Author' }, isBillable: true, clinicalSessionId: context.clinicalSessionId, serviceCode: context.serviceCode, dateOfService: context.dateOfService, ...context, structuredChart: { ...context, ...effective.snapshot.metadataJson.structuredChart }, outputJson: effective.snapshot.notePayload, needsSupervisorCosign: !qa.completed.includes(noteId), pendingServiceDetails: hasLegacy ? legacy : null, serviceDetailAmendments: hasLegacy ? [{ id: 'DEMO-QA-legacy-correction', reason: 'DEMO QA verified guardian-only screening and virtual setting', createdByUserId: 990008, serviceDetails: legacy }] : [] };
}
function getResponse(url) {
  if (url === '/me/notes-to-sign') return { isSupervisor: true, notes: qa.queue.filter(id => !qa.completed.includes(id)).map(id => ({ id, clinical_note_id: id, agency_id: 990002, client_name: `DEMO QA synthetic client ${id}`, date_of_service: '2026-11-01', service_code: 'H0002', provider_name: 'DEMO QA Original Author' })) };
  if (url === '/me/notes-to-sign/count') return { isSupervisor: true, count: qa.queue.length - qa.completed.length };
  if (url === '/medical-billing/service-locations') return { items: [{ id: 990005, name: 'DEMO QA Office', place_of_service: '11', is_active: 1 }, { id: 990006, name: 'DEMO QA School', place_of_service: '03', is_active: 1 }, { id: 990007, name: 'DEMO QA Inactive', place_of_service: '11', is_active: 0 }] };
  const versions = url.match(/^\/medical-billing\/notes\/(\d+)\/versions$/); if (versions) return summary(Number(versions[1]));
  const detail = url.match(/^\/medical-billing\/notes\/(\d+)$/); if (detail) return { note: note(Number(detail[1])) };
  const review = url.match(/\/document-reviews\/note\/(\d+)$/); if (review) { const n = note(Number(review[1])); return { contentHash: `DEMO-QA-review-${review[1]}`, reviewSnapshotToken: n.reviewSnapshotToken, content: { note: n.outputJson, addenda: [] }, revisionSummary: summary(Number(review[1])), canCosign: true }; }
  if (url.includes('review-work')) return { items: qa.authorTasks };
  return {};
}
function error(status, message) { throw { response: { status, data: { error: { message } } } }; }
async function writeResponse(method, url, body) {
  const route = url.match(/^\/medical-billing\/notes\/(\d+)\/versions(?:\/(\d+))?(?:\/(sign|cosign|acknowledge))?$/);
  if (!route) error(405, 'DEMO QA refuses unsupported writes. Nothing was sent to a server.');
  const noteId = Number(route[1]), record = qa.records[noteId], revisionId = Number(route[2]), action = route[3];
  if (!action) {
    const base = record.revisions.find(item => item.id === (revisionId || body.baseRevisionId));
    if (!base || body.expectedContentHash !== base.contentHash) error(409, 'DEMO QA revision changed. Refresh before signing.');
    const revision = { ...copy(base), id: revisionId || noteId * 10 + 1, revisionNumber: revisionId ? base.revisionNumber : 2, origin: body.origin || base.origin, status: body.origin === 'billing' ? 'awaiting_author_signature' : 'draft', reason: body.reason, proposedByUserId: qa.scenario === 'billing' ? 990022 : 990008, originalAuthorUserId: 990009, responsibleSupervisorUserId: 990008, requiresSupervisorCosign: true, contentHash: `DEMO-QA-saved-${++sequence}`, signatures: [], capabilities: body.origin === 'billing' ? {} : { canEdit: true, canCosign: true }, snapshot: { ...base.snapshot, title: body.title, notePayload: body.notePayload, metadataJson: body.metadataJson, encounterContext: body.encounterContext } };
    record.revisions = record.revisions.filter(item => item.id !== revision.id).concat(revision); record.pendingRevisionId = revision.id;
    return { ...summary(noteId), revision: copy(revision) };
  }
  const revision = record.revisions.find(item => item.id === revisionId);
  if (!revision || !body.attested || body.expectedContentHash !== revision.contentHash || body.expectedEntryManifestHash !== revision.entryManifestHash) error(409, 'DEMO QA exact revision confirmation is required.');
  if (qa.failSignature) { qa.failSignature = false; error(409, 'DEMO QA revision changed. Refresh and review before signing.'); }
  if (qa.delaySignature) await new Promise(resolve => setTimeout(resolve, qa.delaySignature));
  revision.signatures.push({ id: ++sequence, action: action === 'sign' ? 'author_sign' : action === 'cosign' ? 'supervisor_sign' : 'author_acknowledge', actorUserId: action === 'sign' ? 990009 : 990008, signedAt: stamp, contentHash: revision.contentHash });
  revision.capabilities = {}; revision.status = action === 'sign' ? 'awaiting_supervisor_signature' : 'approved';
  if (revision.status === 'approved') { record.effectiveRevisionId = revision.id; record.pendingRevisionId = null; qa.completed.push(noteId); if (revision.origin === 'supervisor') qa.authorTasks.push({ noteId, assignedToUserId: 990009, action: 'review_acknowledge', revisionId }); }
  return { ...summary(noteId), revision: copy(revision) };
}
const api = {
  async get(url, config) { qa.calls.push({ method: 'get', url, skipGlobalLoading: config?.skipGlobalLoading }); return { data: getResponse(url) }; },
  async post(url, body, config) { qa.calls.push({ method: 'post', url, body: copy(body), skipGlobalLoading: config?.skipGlobalLoading }); return { data: await writeResponse('post', url, body) }; },
  async patch(url, body, config) { qa.calls.push({ method: 'patch', url, body: copy(body), skipGlobalLoading: config?.skipGlobalLoading }); return { data: await writeResponse('patch', url, body) }; }
};
export const isApiRateLimited = () => false;
export const apiRateLimitRetryAt = () => 0;
export default api;
