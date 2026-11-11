<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Eye, ChartNoAxesCombined, FileText, X } from '@lucide/vue';
import NarrivaTreatmentHistory from './NarrivaTreatmentHistory.vue';
import NarrivaNoteSummary from './NarrivaNoteSummary.vue';
import { NARRIVA_BRAND } from '../../config/narrivaBrand.js';

const props = defineProps({
  item: { type: Object, required: true },
  loadInsights: { type: Function, default: null },
  accessKey: { type: String, default: '' },
  unavailableReason: { type: String, default: '' },
  allowQuickSign: { type: Boolean, default: false },
  showOpenNote: { type: Boolean, default: true }
});
const emit = defineEmits(['open-note', 'quick-sign']);
const canonicalId = value => /^[1-9]\d*$/.test(String(value ?? '')) ? Number(value) : null;
const noteId = computed(() => canonicalId(props.item.clinicalNoteId || props.item.noteId || props.item.clinical_note_id));
const agencyId = computed(() => canonicalId(props.item.agencyId || props.item.agency_id));
const hasPendingRevision = computed(() => !!(props.item.clinicalRevisionId || props.item.clinical_revision_id));
const eligible = computed(() => props.allowQuickSign && !hasPendingRevision.value && (props.item.narriva?.quickSignEligible === true || props.item.quickSignEligible === true));
const canPreview = computed(() => !!noteId.value && !!agencyId.value && !hasPendingRevision.value);
const active = ref(''), pinned = ref(false), loading = ref(false), error = ref(''), insights = ref(null), popup = ref(null), trigger = ref(null), placement = ref({});
let generation = 0, hoverTimer, closeTimer, restoreTarget, restoringFocus = false;
function clearTimers() { clearTimeout(hoverTimer); clearTimeout(closeTimer); }
function positionPopup() {
  if (!trigger.value || !active.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth || 390, viewportHeight = window.innerHeight || 800;
  const width = Math.min(active.value === 'history' ? 620 : 480, viewportWidth - 24);
  const top = viewportWidth < 640 || active.value === 'history' ? 24 : Math.max(12, Math.min(rect.bottom + 8, viewportHeight - 330));
  placement.value = { width: `${width}px`, left: `${viewportWidth < 640 || active.value === 'history' ? (viewportWidth - width) / 2 : Math.max(12, Math.min(rect.left, viewportWidth - width - 12))}px`, top: `${top}px`, maxHeight: `${Math.max(160, viewportHeight - top - 24)}px` };
}
function reset() { generation++; clearTimers(); active.value = ''; pinned.value = false; loading.value = false; error.value = ''; insights.value = null; }
watch(() => [noteId.value, agencyId.value, props.accessKey, props.item.narriva?.reviewId, props.item.updatedAt, props.item.contentHash, props.item.content_hash, props.item.clinicalRevisionId, props.item.clinical_revision_id], reset);
async function fetchInsights() {
  if (!canPreview.value || loading.value || insights.value || props.unavailableReason) return;
  const requestGeneration = ++generation;
  const requestNoteId = noteId.value, requestAgencyId = agencyId.value;
  loading.value = true; error.value = '';
  try {
    let result;
    if (props.loadInsights) result = await props.loadInsights({ noteId: requestNoteId, agencyId: requestAgencyId });
    else {
      const { default: api } = await import('../../services/api.js');
      if (requestGeneration !== generation) return;
      result = await api.get(`/narriva/notes/${requestNoteId}/review-insights`, { params: { agencyId: requestAgencyId }, headers: { 'X-Agency-Id': String(requestAgencyId) }, skipGlobalLoading: true });
    }
    if (requestGeneration !== generation) return;
    const data = result?.data?.insights || result?.insights;
    if (!data || Number(data.noteId) !== requestNoteId || (data.agencyId != null && Number(data.agencyId) !== requestAgencyId)) throw new Error('Unexpected review context');
    insights.value = data;
  } catch (cause) {
    if (requestGeneration !== generation) return;
    error.value = cause?.response?.status === 403 ? 'Open the note in its authorized workspace to review these details.' : 'These review details could not be loaded. Your note has not changed.';
  } finally { if (requestGeneration === generation) loading.value = false; }
}
async function open(kind, event, keepOpen = true) {
  if (!canPreview.value) return;
  clearTimers();
  trigger.value = event?.currentTarget || trigger.value;
  restoreTarget = trigger.value;
  if (active.value === kind && pinned.value && keepOpen) { close(true); return; }
  active.value = kind; pinned.value = keepOpen;
  positionPopup();
  await nextTick();
  if (keepOpen) popup.value?.focus();
  fetchInsights();
}
function hover(event) {
  if (event.pointerType && event.pointerType !== 'mouse' || pinned.value || !canPreview.value) return;
  const target = event.currentTarget;
  clearTimers(); hoverTimer = setTimeout(() => open('summary', { currentTarget: target }, false), 180);
}
function leave() { clearTimeout(hoverTimer); if (!pinned.value) closeTimer = setTimeout(() => close(false), 180); }
function keep() { clearTimeout(closeTimer); }
function close(restore = false) {
  clearTimers(); active.value = ''; pinned.value = false;
  // Do not retain a stale fetched preview after it is dismissed. Every opening authorizes afresh.
  generation++; loading.value = false; insights.value = null; error.value = '';
  if (restore) { restoringFocus = true; restoreTarget?.focus?.(); queueMicrotask(() => { restoringFocus = false; }); }
}
function handleKey(event) {
  if (!active.value) return;
  if (event.key === 'Escape') { event.preventDefault(); close(true); }
  if (event.key === 'Tab' && pinned.value && popup.value) {
    const items = [...popup.value.querySelectorAll('button:not([disabled]), a[href], summary, [tabindex="0"]')];
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === popup.value)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === popup.value)) { event.preventDefault(); first?.focus(); }
  }
}
function openNote() { close(); emit('open-note', props.item); }
watch(active, value => {
  if (value) { window.addEventListener('keydown', handleKey); window.addEventListener('resize', positionPopup); }
  else { window.removeEventListener('keydown', handleKey); window.removeEventListener('resize', positionPopup); }
});
onBeforeUnmount(() => { reset(); window.removeEventListener('keydown', handleKey); window.removeEventListener('resize', positionPopup); });
</script>

<template>
  <div class="note-review-actions" @click.stop>
    <button v-if="eligible" type="button" class="nra-quick-sign" @click="emit('quick-sign',item)"><img :src="NARRIVA_BRAND.verified" alt=""/>Quick Sign</button>
    <button v-if="canPreview" type="button" class="nra-summary" :aria-expanded="active==='summary'" aria-haspopup="dialog" @pointerenter="hover" @pointerleave="leave" @focus="!restoringFocus && open('summary',$event,false)" @click="open('summary',$event,true)"><Eye :size="14"/>Quick look</button>
    <button v-if="showOpenNote" type="button" class="nra-open" @click="openNote"><FileText :size="14"/>Open note</button>
    <button v-if="canPreview" type="button" class="nra-history" :aria-expanded="active==='history'" aria-haspopup="dialog" @click="open('history',$event,true)"><ChartNoAxesCombined :size="14"/>Treatment history</button>
    <Teleport to="body">
      <div v-if="active && pinned" class="nra-backdrop" @click="close(true)"/>
      <section v-if="active" ref="popup" class="nra-popup" :class="{ 'nra-popup--history':active==='history' }" :style="placement" role="dialog" :aria-modal="pinned?'true':undefined" :aria-label="active==='history'?'Treatment history':'Session quick look'" tabindex="-1" @pointerenter="keep" @pointerleave="leave" @focusin="keep" @focusout="!pinned && leave()">
        <header><div><img :src="NARRIVA_BRAND.icon" alt=""/><h3>{{ active==='history'?'Treatment history':'Session quick look' }}</h3></div><button type="button" aria-label="Close review details" @click="close(true)"><X :size="18"/></button></header>
        <div class="nra-popup-body">
          <p v-if="unavailableReason" role="status">{{ unavailableReason }}</p>
          <p v-else-if="loading" role="status">Loading authorized review details…</p>
          <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="fetchInsights">Try again</button></p>
          <template v-else-if="insights">
            <p v-if="insights.sourceRevision?.pendingAmendment" class="nra-pending" role="status">An amendment is pending. This preview shows the saved reviewed version; open the note to review the pending version before signing.</p>
            <NarrivaNoteSummary v-if="active==='summary'" :quick-look="insights.quickLook" :source-revision="insights.sourceRevision" @open-note="openNote" />
            <NarrivaTreatmentHistory v-else :history="insights.treatmentHistory || {}"/>
          </template>
        </div>
        <footer><button type="button" @click="openNote">Open note for full review</button><button type="button" @click="close(true)">Close</button></footer>
      </section>
    </Teleport>
  </div>
</template>

<style scoped>
.note-review-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 10px 10px;min-width:0}.note-review-actions>button{display:inline-flex;align-items:center;gap:5px;background:#f3f7fb;border:1px solid #d5e1ed;border-radius:7px;padding:7px 8px;font:inherit;font-size:11px;color:#244d73;cursor:pointer;min-height:32px}.note-review-actions .nra-quick-sign{background:#eaf6ef;border-color:#bddcc9;color:#24653f}.nra-quick-sign img{width:17px;height:17px;object-fit:contain}.nra-backdrop{position:fixed;inset:0;z-index:15000;background:rgba(22,45,69,.2)}.nra-popup{position:fixed;z-index:15001;display:flex;flex-direction:column;background:#fff;border:1px solid #ccdae8;border-radius:15px;box-shadow:0 18px 60px #18395933;color:#203b56;font-family:inherit;overflow:hidden;box-sizing:border-box}.nra-popup>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #e2eaf2;background:#f7fafe}.nra-popup>header>div{display:flex;gap:9px;align-items:center}.nra-popup>header img{width:29px;height:29px;object-fit:contain}.nra-popup h3{font-size:17px;margin:0}.nra-popup header button{display:flex;border:0;background:transparent;color:#526d85;padding:7px;cursor:pointer}.nra-popup-body{padding:15px 17px;overflow-y:auto;overscroll-behavior:contain;min-height:0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.nra-explainer,.nra-version{color:#63788c;font-size:12px}.nra-sections{margin:14px 0}.nra-sections>div{margin:0 0 14px}.nra-sections dt{font-size:12px;font-weight:700;color:#214f75;margin-bottom:4px}.nra-sections dd{margin:0;white-space:pre-wrap}.nra-artifacts{border-top:1px solid #e1e9f0;padding-top:10px}.nra-artifacts h4{margin:0 0 8px}.nra-artifacts ul{list-style:none;margin:0;padding:0}.nra-artifacts li{padding:9px;border-radius:7px;background:#f3f7fb;margin:7px 0}.nra-popup footer{padding:12px 16px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #e1e9f0;flex-wrap:wrap}.nra-popup-body button,.nra-popup footer button{font:inherit;font-size:12px;padding:7px 10px;background:#f2f7fc;border:1px solid #ccddea;border-radius:7px;color:#235176;cursor:pointer}.nra-popup footer button:first-child{background:#1e5684;border-color:#1e5684;color:white}.note-review-actions button:focus-visible,.nra-popup button:focus-visible,.nra-popup:focus-visible{outline:2px solid #2869b3;outline-offset:2px}@media(max-width:640px){.note-review-actions>button{min-height:38px}.nra-popup-body{padding:13px}.nra-popup h3{font-size:16px}}
</style>
