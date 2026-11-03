<template>
  <section :id="`immutable-note-versions-${noteId}`" class="note-versions" :aria-busy="loading || busy" aria-label="Immutable note version history">
    <header class="version-heading"><div><h3>Note versions</h3><p>Signed versions remain on record. An amendment creates a linked revision; an addendum is a separate addition.</p></div><button type="button" :disabled="loading || busy" @click="load">Refresh versions</button></header>
    <p v-if="loading" role="status">Loading note versions…</p>
    <p v-if="error" class="version-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="version-notice" role="status">{{ notice }}</p>
    <template v-if="summary && !loading">
      <div class="version-status" role="status">
        <strong>{{ effective ? `Latest approved: version ${effective.revisionNumber}` : 'No approved version recorded' }}</strong>
        <span v-if="pending">Pending: version {{ pending.revisionNumber }} · {{ statusLabel(pending.status) }}</span>
        <span v-else>No pending amendment</span>
      </div>
      <p v-if="hasLegacyPending" class="legacy-provenance" role="status">A historical service correction is awaiting submission. Its saved details and reason will prefill a new amendment for review; a new signature is required to submit it.</p>
      <p v-if="pending" class="workflow-help">{{ workflowHelp(pending) }}</p>
      <div class="version-controls">
        <label>Version history<select v-model="selectedId" data-testid="version-select" :disabled="busy || editing"><option v-for="revision in revisions" :key="revision.id" :value="revision.id">Version {{ revision.revisionNumber }} · {{ originLabel(revision.origin) }} · {{ statusLabel(revision.status) }}</option></select></label>
        <button v-if="createOrigins.length && !pending && !editing" type="button" data-testid="create-amendment" :disabled="busy || !effective" @click="startAmendment">{{ hasLegacyPending ? 'Review saved service correction' : 'Create amendment' }}</button>
        <button v-if="selected?.capabilities?.canEdit && !editing" type="button" data-testid="edit-amendment" :disabled="busy" @click="startEditing">Edit amendment draft</button>
      </div>
      <ClinicalNoteVersionAddenda v-if="!editing" :entries="reviewAddenda" />
      <article v-if="selected && !editing" class="revision-record" :aria-label="`Immutable version ${selected.revisionNumber}`">
        <div class="revision-title"><strong>Version {{ selected.revisionNumber }} · {{ statusLabel(selected.status) }}</strong><span>{{ originLabel(selected.origin) }} · {{ timestamp(selected.createdAt) }}</span></div>
        <p v-if="selected.reason" class="revision-reason"><strong>Reason:</strong> {{ selected.reason }}</p>
        <p v-if="selected.proposedByUserId">{{ selected.origin === 'billing' ? 'Proposed by billing' : 'Created by' }}: {{ actorLabel(selected.proposedByUserId, selected.proposedByName) }}</p>
        <p v-if="selected.parentRevisionId || selected.baseRevisionId" class="muted">Linked to revision #{{ selected.parentRevisionId || selected.baseRevisionId }}.</p>
        <details :key="selected.id" :open="viewOpen" class="revision-content"><summary>Read version {{ selected.revisionNumber }} · saved narrative and service context</summary>
          <p class="muted">This saved snapshot is read only. Signatures below cover this exact revision.</p>
          <h4>{{ selected.snapshot?.title || 'Clinical note' }}</h4>
          <dl class="context-grid"><div v-for="fact in serviceFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div></dl>
          <section v-for="field in selectedNarrative" :key="field.key" class="narrative-section"><h4>{{ field.label }}</h4><p>{{ field.value }}</p></section>
          <p v-if="!selectedNarrative.length" class="muted">No narrative fields were recorded in this snapshot.</p>
          <details v-if="Object.keys(selected.snapshot?.metadataJson?.structuredChart || {}).length"><summary>Additional saved clinical context</summary><dl class="saved-context"><div v-for="field in savedClinicalContext" :key="field.path"><dt>{{ field.path }}</dt><dd>{{ field.value }}</dd></div></dl></details>
        </details>
        <section class="revision-signatures" :aria-label="`Signatures covering version ${selected.revisionNumber}`">
          <h4>Signatures for version {{ selected.revisionNumber }}</h4>
          <article v-for="signature in selected.signatures || []" :key="signature.id || `${signature.action}-${signature.signedAt}`"><strong>{{ signatureLabel(signature.action) }}</strong><span>{{ actorLabel(signature.actorUserId, signature.actorName) }} · {{ timestamp(signature.signedAt) }}</span><small>Version {{ selected.revisionNumber }} · revision #{{ selected.id }} · fingerprint {{ signature.contentHash }}</small></article>
          <div v-if="selected.provenance?.kind === 'legacy_observed'" class="legacy-provenance"><strong>Legacy record captured {{ timestamp(selected.provenance.observedAt) }}</strong><p>The following dates and identities were observed on the legacy note. They do not establish a new signature over this saved snapshot.</p><p v-if="selected.provenance.legacyProviderSignedAt">Legacy author: {{ actorLabel(selected.provenance.legacyProviderSignedByUserId) }} · {{ timestamp(selected.provenance.legacyProviderSignedAt) }}</p><p v-if="selected.provenance.legacySupervisorCosignedAt">Legacy supervisor: {{ actorLabel(selected.provenance.legacySupervisorCosignedByUserId) }} · {{ timestamp(selected.provenance.legacySupervisorCosignedAt) }}</p></div>
          <p v-else-if="!selected.signatures?.length" class="muted">No signatures recorded for this revision.</p>
        </section>
        <form v-if="selectedAction" class="revision-attestation" @submit.prevent="signRevision">
          <p>{{ workflowHelp(selected) }}</p><label class="check-line"><input v-model="attested" type="checkbox" data-testid="version-attestation" :disabled="busy || conflicted" /> {{ attestationText }}</label>
          <button type="submit" data-testid="sign-version" :disabled="busy || conflicted || !attested">{{ busy ? 'Saving…' : actionLabel }}</button>
        </form>
      </article>
      <form v-if="editing" class="revision-editor" @submit.prevent="saveDraft">
        <h4>{{ draftRevision ? `Edit amendment · version ${draftRevision.revisionNumber}` : 'New linked amendment' }}</h4>
        <p>The saved original and earlier signatures remain available in version history. {{ draftOrigin === 'supervisor' ? 'Review all changes, then sign and submit this amended version once. The original author receives a separate review task.' : 'Save this draft, then review and sign the exact saved revision.' }}</p>
        <ClinicalNoteVersionAddenda :entries="draftAddenda" />
        <label v-if="!draftRevision && createOrigins.length > 1">Amendment role<select v-model="draftOrigin" :disabled="busy"><option v-for="origin in createOrigins" :key="origin" :value="origin">{{ originLabel(origin) }}</option></select></label>
        <p v-if="draftOrigin === 'billing'">Your identity and reason will be recorded as a billing proposal. The original clinical author must sign it; the responsible supervisor must cosign when required.</p>
        <label>Reason for amendment<textarea v-model="draftReason" data-testid="version-reason" rows="2" maxlength="2000" required :disabled="busy" /></label>
        <label>Note title<input v-model="draftTitle" maxlength="255" :disabled="busy" /></label>
        <fieldset :disabled="busy"><legend>Clinical narrative</legend><label v-for="field in draftFields" :key="field.key">{{ field.label }}<textarea v-model="field.value" :data-testid="`revision-narrative-${field.key}`" rows="5" maxlength="100000" /></label><p v-if="!draftFields.length">No editable narrative fields are available in this saved payload.</p></fieldset>
        <fieldset :disabled="busy"><legend>Service context</legend>
          <p v-if="locationsLoading" role="status">Loading documented service locations…</p><p v-if="locationsError" class="version-error" role="alert">{{ locationsError }} <button type="button" @click="loadLocations">Retry locations</button></p>
          <label>Service location<select v-model="draftLocationId" data-testid="revision-serviceLocationId" :disabled="locationsLoading"><option value="">Keep saved location: {{ draftSavedLocation.locationLabel || 'Not recorded' }} · POS {{ draftSavedLocation.placeOfService || 'Not recorded' }}</option><option v-for="location in serviceLocations" :key="location.id" :value="String(location.id)">{{ location.name }} · POS {{ location.place_of_service }}</option></select></label>
          <p v-if="draftContext.locationLabel">{{ draftContext.locationLabel }} · POS {{ draftContext.placeOfService || 'Not recorded' }}</p>
          <div class="editor-context"><label v-for="field in editableContextFields" :key="field.key">{{ field.label }}<input v-model="draftContext[field.key]" :data-testid="`revision-${field.key}`" :type="field.type || 'text'" :min="field.type === 'number' ? 1 : undefined" :max="field.key === 'durationMinutes' ? 1440 : undefined" /></label><label>Patient present<select v-model="draftContext.patientPresent"><option :value="null">Not recorded</option><option :value="true">Present</option><option :value="false">Not present</option></select></label></div></fieldset>
        <label v-if="draftOrigin === 'supervisor'" class="check-line"><input v-model="draftAttested" type="checkbox" data-testid="supervisor-draft-attestation" :disabled="busy || conflicted" /> I authored and reviewed this amended narrative and service context and electronically sign this version as accurate. It will be submitted now for the original author to review and acknowledge.</label>
        <button type="submit" data-testid="save-version-draft" :disabled="busy || conflicted || !draftReason.trim() || (draftOrigin === 'supervisor' && !draftAttested)">{{ busy ? 'Saving…' : draftOrigin === 'supervisor' ? 'Sign & submit amended version' : draftOrigin === 'billing' ? 'Save billing proposal' : 'Save amendment draft' }}</button><button type="button" :disabled="busy" @click="cancelEditing">Cancel</button>
      </form>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api.js';
import ClinicalNoteVersionAddenda from './ClinicalNoteVersionAddenda.vue';
import { cloneRevisionValue, revisionNarrativeFields, revisedNarrativePayload, revisionSignatureLabel, revisionStatusLabel } from '../../utils/clinicalNoteVersions.js';

const props = defineProps({ noteId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], required: true }, preferPending: { type: Boolean, default: false }, legacyPendingServiceDetails: { type: Object, default: null }, legacyAmendment: { type: Object, default: null } });
const emit = defineEmits(['changed', 'loaded', 'editing']);
defineExpose({ openRevision });
const summary = ref(null), selectedId = ref(null), loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), attested = ref(false), conflicted = ref(false), viewOpen = ref(false);
const draftAttested = ref(false);
const serviceLocations = ref([]), locationsLoading = ref(false), locationsError = ref(''), draftLocationId = ref(''), draftSavedLocation = ref({});
const editing = ref(false), draftRevision = ref(null), draftBase = ref(null), draftOrigin = ref('provider'), draftReason = ref(''), draftTitle = ref(''), draftFields = ref([]), draftContext = ref({});
let generation = 0;
const revisions = computed(() => summary.value?.revisions || []);
const effective = computed(() => summary.value?.effectiveRevision || revisions.value.find(item => item.id === summary.value?.effectiveRevisionId));
const pending = computed(() => summary.value?.pendingRevision || revisions.value.find(item => item.id === summary.value?.pendingRevisionId));
const hasLegacyPending = computed(() => !!props.legacyPendingServiceDetails && !pending.value);
const selected = computed(() => revisions.value.find(item => String(item.id) === String(selectedId.value)) || null);
const createOrigins = computed(() => ['provider', 'supervisor', 'billing'].filter(origin => summary.value?.capabilities?.[`canCreate${origin[0].toUpperCase()}${origin.slice(1)}`] === true));
function attachedEntries(revision) { const entries = [...(revision?.snapshot?.addenda || []), ...(revision?.currentAddenda || [])]; return entries.filter((entry, index) => entries.findIndex(other => entry.id ? String(other.id) === String(entry.id) : other.body === entry.body && other.created_at === entry.created_at) === index); }
const reviewAddenda = computed(() => attachedEntries(selected.value));
const draftAddenda = computed(() => attachedEntries(draftBase.value));
const selectedNarrative = computed(() => revisionNarrativeFields(selected.value?.snapshot?.notePayload));
const statusLabel = revisionStatusLabel, signatureLabel = revisionSignatureLabel;
const originLabel = origin => ({ original: 'Original', provider: 'Provider amendment', supervisor: 'Supervisor amendment', billing: 'Billing proposal' }[origin] || origin);
const actorLabel = (id, name) => name ? `${name}${id ? ` · user #${id}` : ''}` : id ? `User #${id}` : 'Identity not recorded';
const timestamp = value => { if (!value) return 'Time not recorded'; const time = new Date(value); return Number.isNaN(time.getTime()) ? String(value) : time.toLocaleString(); };
const contextFields = [{ key: 'dateOfService', label: 'Date of service', type: 'date' }, { key: 'serviceCode', label: 'Service code' }, { key: 'durationMinutes', label: 'Duration (minutes)', type: 'number' }, { key: 'startTime', label: 'Start time', type: 'time' }, { key: 'endTime', label: 'End time', type: 'time' }, { key: 'locationLabel', label: 'Documented service location' }, { key: 'placeOfService', label: 'Place of service' }, { key: 'participants', label: 'Participants' }];
const editableContextFields = computed(() => [...contextFields.filter(field => !['locationLabel', 'placeOfService'].includes(field.key)), ...(draftContext.value.billingPrimaryUnits != null ? [{ key: 'billingPrimaryUnits', label: 'Primary service units', type: 'number' }] : [])]);
const serviceFacts = computed(() => { const context = selected.value?.snapshot?.encounterContext || {}; return [...contextFields, { key: 'billingPrimaryUnits', label: 'Primary service units' }, { key: 'sourceTimezone', label: 'Time zone' }, { key: 'clinicalSessionId', label: 'Clinical session' }].filter(field => context[field.key] != null && context[field.key] !== '').map(field => ({ label: field.label, value: context[field.key] })).concat(typeof context.patientPresent === 'boolean' ? [{ label: 'Patient present', value: context.patientPresent ? 'Yes' : 'No' }] : []); });
function flattenedContext(value, path = '', result = []) { for (const [key, entry] of Object.entries(value || {})) { const next = path ? `${path} · ${key}` : key; if (entry && typeof entry === 'object') flattenedContext(entry, next, result); else if (entry != null && entry !== '') result.push({ path: next.replace(/([a-z])([A-Z])/g, '$1 $2'), value: String(entry) }); } return result; }
const savedClinicalContext = computed(() => flattenedContext(selected.value?.snapshot?.metadataJson?.structuredChart));
const selectedAction = computed(() => { const caps = selected.value?.capabilities || {}; return caps.canSign ? 'sign' : caps.canCosign ? 'cosign' : caps.canAcknowledge ? 'acknowledge' : ''; });
const actionLabel = computed(() => ({ sign: selected.value?.origin === 'supervisor' ? 'Sign supervisor amendment' : 'Sign as original clinical author', cosign: selected.value?.origin === 'supervisor' ? 'Sign & submit amended version' : 'Cosign this revision', acknowledge: 'Acknowledge reviewed amendment' }[selectedAction.value]));
const attestationText = computed(() => selectedAction.value === 'acknowledge' ? `I reviewed the supervisor's amendment in version ${selected.value.revisionNumber}. This records my acknowledgement of that exact revision.` : selectedAction.value === 'cosign' && selected.value?.origin !== 'supervisor' ? `I reviewed version ${selected.value.revisionNumber}, including its narrative and service context, and electronically cosign it under my supervisory responsibility.` : selected.value?.origin === 'supervisor' ? `I authored and reviewed version ${selected.value.revisionNumber} and electronically sign this supervisor amendment as accurate. The original author will review and acknowledge it.` : `I am the original clinical author. I reviewed version ${selected.value?.revisionNumber}, including any proposed billing changes, and electronically sign this revision as accurate and complete.`);
function workflowHelp(revision) { if (revision.origin === 'supervisor') return 'The responsible supervisor signs this amendment once. The original clinical author then reviews and acknowledges it; no second supervisor signature is needed.'; return revision.requiresSupervisorCosign ? 'The original clinical author signs this revision first. The responsible supervisor then cosigns this same revision before it becomes the latest approved version.' : 'The original clinical author must sign this revision before it becomes the latest approved version.'; }
function errorMessage(e) { return e.response?.data?.error?.message || e.message || 'Unable to update note versions.'; }
watch(editing, value => emit('editing', value));
watch([draftFields, draftContext, draftReason, draftTitle, draftOrigin], () => { draftAttested.value = false; }, { deep: true });
watch(draftLocationId, value => { const location = serviceLocations.value.find(item => String(item.id) === value); const original = draftSavedLocation.value; if (location) Object.assign(draftContext.value, { serviceLocationId: Number(location.id), locationLabel: location.name, placeOfService: location.place_of_service }); else for (const key of ['serviceLocationId', 'locationLabel', 'placeOfService']) { if (Object.prototype.hasOwnProperty.call(original, key)) draftContext.value[key] = original[key]; else delete draftContext.value[key]; } });
watch(selectedId, () => { attested.value = false; viewOpen.value = !!selected.value && (String(selected.value.id) !== String(effective.value?.id) || !!selectedAction.value); });
watch(() => `${props.agencyId}:${props.noteId}`, () => { notice.value = ''; summary.value = null; selectedId.value = null; editing.value = false; load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
async function openRevision(revisionId) {
  if (!summary.value || loading.value) await load(revisionId);
  if (!revisions.value.some(item => String(item.id) === String(revisionId))) { error.value = 'The requested revision is unavailable. Refresh versions before reviewing this request.'; return; }
  selectedId.value = revisionId; viewOpen.value = true; attested.value = false;
}
async function load(preferredId = null) {
  const g = ++generation; loading.value = true; error.value = ''; attested.value = false;
  try { const { data } = await api.get(`/medical-billing/notes/${props.noteId}/versions`, { params: { agencyId: Number(props.agencyId) }, skipGlobalLoading: true }); if (g !== generation) return; if (!Array.isArray(data?.revisions)) throw new Error('Version history is unavailable. Refresh before amending or signing.'); summary.value = data; selectedId.value = typeof preferredId === 'number' || typeof preferredId === 'string' ? preferredId : props.preferPending && data.pendingRevisionId ? data.pendingRevisionId : data.effectiveRevisionId || data.originalRevisionId; conflicted.value = false; editing.value = false; emit('loaded', data); }
  catch (e) { if (g === generation) error.value = errorMessage(e); }
  finally { if (g === generation) loading.value = false; }
}
function prepareDraft(revision) {
  draftBase.value = revision; const snapshot = revision.snapshot || {};
  draftTitle.value = snapshot.title || ''; draftFields.value = revisionNarrativeFields(snapshot.notePayload);
  draftContext.value = cloneRevisionValue(snapshot.encounterContext || {});
  if (!draftRevision.value && hasLegacyPending.value) Object.assign(draftContext.value, cloneRevisionValue(props.legacyPendingServiceDetails));
  draftContext.value.dateOfService = String(draftContext.value.dateOfService || '').slice(0, 10);
  draftSavedLocation.value = cloneRevisionValue(draftContext.value);
  draftLocationId.value = ''; editing.value = true; attested.value = false; notice.value = ''; loadLocations();
}
async function loadLocations() {
  const g = generation; locationsLoading.value = true; locationsError.value = '';
  try { const { data } = await api.get('/medical-billing/service-locations', { params: { agencyId: Number(props.agencyId) }, skipGlobalLoading: true }); if (g !== generation) return; serviceLocations.value = (data.items || []).filter(location => ![false, 0, '0'].includes(location.is_active)); }
  catch (e) { if (g === generation) locationsError.value = errorMessage(e); }
  finally { if (g === generation) locationsLoading.value = false; }
}
function startAmendment() { if (!effective.value || pending.value || !createOrigins.value.length) return; draftRevision.value = null; draftReason.value = hasLegacyPending.value ? props.legacyAmendment?.reason || '' : ''; draftOrigin.value = createOrigins.value[0]; prepareDraft(effective.value); }
function startEditing() { if (!selected.value?.capabilities?.canEdit) return; draftRevision.value = selected.value; draftReason.value = selected.value.reason || ''; draftOrigin.value = selected.value.origin; prepareDraft(selected.value); }
function cancelEditing() { editing.value = false; draftRevision.value = null; }
async function saveDraft() {
  if (busy.value || conflicted.value || !draftReason.value.trim() || !draftBase.value || (draftOrigin.value === 'supervisor' && !draftAttested.value)) return;
  const g = generation; busy.value = true; error.value = ''; let saved = null;
  try {
    const base = draftBase.value;
    const body = { agencyId: Number(props.agencyId), title: draftTitle.value, notePayload: revisedNarrativePayload(base.snapshot?.notePayload, draftFields.value), metadataJson: cloneRevisionValue(base.snapshot?.metadataJson || {}), encounterContext: { ...draftContext.value, ...(draftContext.value.durationMinutes !== '' && draftContext.value.durationMinutes != null ? { durationMinutes: Number(draftContext.value.durationMinutes) } : {}) }, reason: draftReason.value.trim(), expectedContentHash: base.contentHash, expectedVersionNumber: base.revisionNumber };
    const url = `/medical-billing/notes/${props.noteId}/versions`;
    const result = draftRevision.value ? await api.patch(`${url}/${draftRevision.value.id}`, body, { skipGlobalLoading: true }) : await api.post(url, { ...body, baseRevisionId: base.id, origin: draftOrigin.value }, { skipGlobalLoading: true });
    if (g !== generation) return;
    const revision = result.data?.revision;
    if (!revision?.id || !revision.contentHash) throw new Error('The server did not confirm the saved revision. Refresh versions to check its status.');
    saved = result.data;
    if (draftOrigin.value === 'supervisor') {
      if (revision.entryManifestHash && base.entryManifestHash !== revision.entryManifestHash) throw new Error('Separate additions changed while this draft was being saved. Review the saved revision and its attached additions before signing.');
      const signed = await api.post(`${url}/${revision.id}/cosign`, { agencyId: Number(props.agencyId), expectedContentHash: revision.contentHash, ...(base.entryManifestHash ? { expectedEntryManifestHash: base.entryManifestHash } : {}), attested: true }, { skipGlobalLoading: true });
      if (g !== generation) return;
      if (String(signed.data?.revision?.id) !== String(revision.id) || signed.data.revision.contentHash !== revision.contentHash || signed.data.revision.status !== 'approved') throw new Error('The server did not confirm submission of the signed amendment. Refresh versions to check its status.');
      draftAttested.value = false;
      notice.value = `Version ${revision.revisionNumber} signed and submitted. The original author has a separate review task.`;
      emit('changed', { noteId: Number(props.noteId), agencyId: Number(props.agencyId), revision: signed.data.revision, action: 'cosign' });
      if (g === generation) await load(revision.id);
    } else {
      await load(revision.id);
      if (summary.value && !error.value) { notice.value = draftOrigin.value === 'billing' ? 'Billing proposal saved. It awaits the original clinical author’s signature.' : 'Amendment draft saved. Review the saved revision before signing.'; emit('changed', { noteId: Number(props.noteId), agencyId: Number(props.agencyId), revision, action: 'draft' }); }
    }
  } catch (e) {
    if (g === generation) {
      draftAttested.value = false;
      if (saved?.revision) { summary.value = saved; selectedId.value = saved.revision.id; editing.value = false; error.value = `Amendment draft saved. ${errorMessage(e)} Review this saved revision and retry its signature.`; }
      else error.value = errorMessage(e);
      if (e.response?.status === 409) conflicted.value = true;
    }
  } finally { busy.value = false; }
}
async function signRevision() {
  if (busy.value || conflicted.value || !attested.value || !selectedAction.value || !selected.value?.contentHash) return;
  const g = generation, revision = selected.value, action = selectedAction.value; busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post(`/medical-billing/notes/${props.noteId}/versions/${revision.id}/${action}`, { agencyId: Number(props.agencyId), expectedContentHash: revision.contentHash, ...(revision.entryManifestHash ? { expectedEntryManifestHash: revision.entryManifestHash } : {}), attested: true }, { skipGlobalLoading: true });
    if (g !== generation) return;
    if (String(data?.revision?.id) !== String(revision.id) || data.revision.contentHash !== revision.contentHash || (revision.origin === 'supervisor' && action === 'cosign' && data.revision.status !== 'approved')) throw new Error('The server did not confirm this signature. Refresh versions before continuing.');
    attested.value = false;
    notice.value = action === 'acknowledge' ? 'Your review acknowledgement was recorded for this revision.' : `Signature recorded for version ${revision.revisionNumber}. ${statusLabel(data.revision.status)}.`;
    emit('changed', { noteId: Number(props.noteId), agencyId: Number(props.agencyId), revision: data.revision, action });
    if (g === generation) await load(revision.id);
  }
  catch (e) { if (g === generation) { attested.value = false; error.value = errorMessage(e); if (e.response?.status === 409) conflicted.value = true; } }
  finally { busy.value = false; }
}
</script>

<style scoped>
.note-versions{border:1px solid #b9cdd9;background:#f8fbfd;border-radius:10px;padding:14px;margin:12px 0;color:#243d51;font-size:.82rem;overflow-wrap:anywhere}.version-heading,.version-controls,.revision-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.version-heading h3{margin:0;font-size:.95rem}.version-heading p{margin:5px 0 10px;line-height:1.45}.note-versions button{background:#fff;border:1px solid #aac3d1;border-radius:6px;padding:8px 10px;font:inherit;color:#1b526c;cursor:pointer}.note-versions button:disabled{opacity:.5;cursor:not-allowed}.version-status{display:flex;flex-wrap:wrap;gap:8px 18px;border-left:3px solid #287e75;background:#edf7f4;padding:9px 12px}.version-status span{color:#71521b}.workflow-help{line-height:1.45}.version-controls{align-items:flex-end;flex-wrap:wrap;margin:12px 0}.version-controls label{flex:1;min-width:180px}.note-versions label{display:block;line-height:1.45}.note-versions input:not([type=checkbox]),.note-versions select,.note-versions textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #afc5d3;border-radius:5px;background:#fff;color:#243d51;padding:8px;font:inherit;margin:4px 0 10px}.revision-record{background:#fff;border:1px solid #d8e4eb;border-radius:8px;padding:12px}.revision-title span{font-size:.74rem;color:#617589}.revision-reason{white-space:pre-wrap}.revision-content{border-top:1px solid #e1eaf0;padding-top:10px}.note-versions summary{cursor:pointer;color:#23536e;font-weight:600;padding:4px 0}.note-versions h4{font-size:.83rem;margin:10px 0 6px}.context-grid,.editor-context{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px}.context-grid dt,.saved-context dt{font-size:.7rem;color:#5b7187}.context-grid dd,.saved-context dd{margin:3px 0;white-space:pre-wrap}.saved-context div{margin:8px 0}.narrative-section p{white-space:pre-wrap;line-height:1.5}.revision-signatures{margin-top:12px;border-top:1px solid #e1eaf0;padding-top:4px}.revision-signatures article{padding:8px 0}.revision-signatures article span,.revision-signatures article small{display:block;margin-top:3px}.revision-signatures small{font-size:.69rem;color:#617589}.legacy-provenance{background:#fff8eb;padding:9px;border-radius:6px}.legacy-provenance p{margin:6px 0;line-height:1.4}.revision-attestation{background:#f0f7fa;margin-top:12px;padding:10px;border-radius:6px}.check-line{display:flex!important;gap:8px;align-items:flex-start;margin:8px 0 12px}.check-line input{margin-top:3px}.revision-editor{margin-top:12px}.revision-editor fieldset{border:1px solid #d0dfe8;border-radius:6px;margin:12px 0;padding:12px}.revision-editor legend{font-weight:600}.revision-editor button+button{margin-left:8px}.version-error{color:#9a3412;background:#fff2eb;padding:10px}.version-notice{color:#17604c;background:#e6f5ef;padding:10px}.muted{color:#617589}.note-versions :is(button,input,textarea,select,summary):focus-visible{outline:3px solid #339ac9;outline-offset:2px}@media(max-width:600px){.note-versions{padding:10px}.version-heading,.revision-title{flex-direction:column;gap:5px}.version-heading>button{align-self:flex-end}.version-controls{align-items:stretch}.version-controls>button{width:100%}.context-grid,.editor-context{grid-template-columns:1fr}.revision-record{padding:9px}.revision-editor button{min-height:42px}}
</style>
