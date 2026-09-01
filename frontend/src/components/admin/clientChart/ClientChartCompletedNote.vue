<template>
  <div class="ccn-view">
    <div v-if="loading" class="ccn-muted">Loading note…</div>
    <div v-else-if="error" class="ccn-error">{{ error }}</div>
    <template v-else-if="note">
      <header class="ccn-head">
        <div>
          <h3>{{ note.title || 'Clinical note' }}</h3>
          <p>
            <span v-if="note.dateOfService">DOS {{ String(note.dateOfService).slice(0, 10) }}</span>
            <span v-if="note.serviceCode"> · {{ note.serviceCode }}</span>
            <span v-if="note.noteType"> · {{ note.noteType }}</span>
          </p>
        </div>
        <div class="ccn-sign">
          <span v-if="note.providerSignedAt">Provider signed</span>
          <span v-if="note.supervisorCosignedAt"> · Supervisor signed</span>
          <span v-else-if="note.providerSignedAt && note.needsSupervisorCosign"> · Awaiting supervisor</span>
        </div>
      </header>
      <article v-for="panel in panels" :key="panel.id" class="ccn-section">
        <h4>
          <span v-if="panel.letter" class="ccn-letter">{{ panel.letter }}</span>
          {{ panel.title }}
        </h4>
        <pre>{{ panel.text }}</pre>
      </article>
      <p v-if="!panels.length" class="ccn-muted">This note has no displayable sections.</p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api.js';
import { buildDisplaySections, extractSections } from '../../../utils/noteAidUiHelpers.js';

const props = defineProps({
  noteId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});

const loading = ref(false);
const error = ref('');
const note = ref(null);

const panels = computed(() => {
  const sections = extractSections(note.value?.outputJson || {});
  return buildDisplaySections(sections);
});

async function load() {
  const nid = Number(props.noteId || 0);
  const aid = Number(props.agencyId || 0);
  if (!nid || !aid) {
    error.value = 'Missing note or organization.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/medical-billing/notes/${nid}`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    note.value = res?.data?.note || null;
    if (!note.value) error.value = 'Note not found.';
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
.ccn-view { padding: 4px 2px 16px; }
.ccn-muted { color: #64748b; font-size: 0.9rem; }
.ccn-error { color: #b91c1c; }
.ccn-head {
  display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;
  margin-bottom: 14px;
}
.ccn-head h3 { margin: 0; font-size: 1.05rem; }
.ccn-head p { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
.ccn-sign { font-size: 0.78rem; color: #0f766e; font-weight: 700; }
.ccn-section {
  border: 1px solid #e2e8f0; border-radius: 10px; background: #fff;
  padding: 10px 12px; margin-bottom: 8px;
}
.ccn-section h4 {
  margin: 0 0 8px; font-size: 0.82rem; display: flex; align-items: center; gap: 8px;
}
.ccn-letter {
  width: 22px; height: 22px; border-radius: 6px; background: #ccfbf1; color: #0f766e;
  display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem;
}
.ccn-section pre {
  margin: 0; white-space: pre-wrap; font: inherit; color: #0f172a; line-height: 1.45;
}
</style>
