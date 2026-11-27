<template>
  <div class="cndf">
    <div v-if="loading" class="cndf-muted">Loading clinical note…</div>
    <div v-else-if="error" class="cndf-error">{{ error }}</div>
    <template v-else-if="note">
      <p v-if="amendmentNotice" role="status" class="cndf-notice">{{ amendmentNotice }}</p>
      <ClinicalRecordDownloads v-if="note.providerSignedAt && note.agencyId" :note-id="note.id" :agency-id="note.agencyId" />
      <ClinicalNoteReadOnlyView ref="readOnlyView" :note="note" :compact="compact" :linked-review-id="linkedReviewId" @amended="onAmended" />
    </template>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api.js';
import ClinicalNoteReadOnlyView from './ClinicalNoteReadOnlyView.vue';
import ClinicalRecordDownloads from './ClinicalRecordDownloads.vue';

const props = defineProps({
  noteId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  compact: { type: Boolean, default: false },
  linkedReviewId: { type: String, default: '' }
});

const emit = defineEmits(['amended']);
const readOnlyView = ref(null);
defineExpose({ refresh:()=>load(),openRevision: revisionId => readOnlyView.value?.openRevision(revisionId), openCorrection: () => readOnlyView.value?.openCorrection() });
const amendmentNotice = ref('');
async function onAmended(result) {
  amendmentNotice.value = result?.message || '';
  emit('amended', result);
  await load();
}

const loading = ref(false);
const error = ref('');
const note = ref(null);

let generation = 0;
onBeforeUnmount(() => { generation++; });
async function load() {
  const seq = ++generation;
  const nid = Number(props.noteId || 0);
  if (!nid) {
    error.value = 'Missing note id.';
    note.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  note.value = null;
  const agencyCandidates = [];
  const aid = Number(props.agencyId || 0);
  if (aid > 0) agencyCandidates.push(aid);
  agencyCandidates.push(null);
  try {
    let loaded = null;
    let lastErr = null;
    for (const aid of agencyCandidates) {
      try {
        const res = await api.get(`/medical-billing/notes/${nid}`, {
          params: aid ? { agencyId: aid } : undefined,
          skipGlobalLoading: true
        });
        if (seq !== generation) return;
        loaded = res?.data?.note || null;
        if (loaded) break;
      } catch (e) {
        if (seq !== generation) return;
        lastErr = e;
      }
    }
    if (seq !== generation) return;
    note.value = loaded;
    if (!note.value) {
      error.value = lastErr?.response?.data?.error?.message || lastErr?.message || 'Note not found.';
    }
  } catch (e) {
    if (seq !== generation) return;
    error.value = e.response?.data?.error?.message || e.message || 'Could not load note.';
    note.value = null;
  } finally {
    if (seq === generation) loading.value = false;
  }
}

watch(() => [props.noteId, props.agencyId], () => { amendmentNotice.value = ''; return load(); }, { immediate: true });
</script>

<style scoped>
.cndf-notice { color: #145c45; padding: 8px 10px; background: #edf8f3; }
.cndf-muted { color: #64748b; font-size: 0.8rem; padding: 6px 2px; }
.cndf-error { color: #b91c1c; font-size: 0.8rem; padding: 6px 2px; }
</style>
