<template>
  <div class="cndf">
    <div v-if="loading" class="cndf-muted">Loading clinical note…</div>
    <div v-else-if="error" class="cndf-error">{{ error }}</div>
    <ClinicalNoteReadOnlyView v-else-if="note" :note="note" :compact="compact" />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api.js';
import ClinicalNoteReadOnlyView from './ClinicalNoteReadOnlyView.vue';

const props = defineProps({
  noteId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  compact: { type: Boolean, default: false }
});

const loading = ref(false);
const error = ref('');
const note = ref(null);

async function load() {
  const nid = Number(props.noteId || 0);
  if (!nid) {
    error.value = 'Missing note id.';
    note.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
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
        loaded = res?.data?.note || null;
        if (loaded) break;
      } catch (e) {
        lastErr = e;
      }
    }
    note.value = loaded;
    if (!note.value) {
      error.value = lastErr?.response?.data?.error?.message || lastErr?.message || 'Note not found.';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not load note.';
    note.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.noteId, props.agencyId], load);
</script>

<style scoped>
.cndf-muted { color: #64748b; font-size: 0.8rem; padding: 6px 2px; }
.cndf-error { color: #b91c1c; font-size: 0.8rem; padding: 6px 2px; }
</style>
