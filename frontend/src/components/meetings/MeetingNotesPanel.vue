<template>
  <div class="mnp" data-testid="meeting-notes-panel">
    <div class="mnp__head">
      <h4>Meeting transcript</h4>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load">Refresh</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p class="muted mnp__hint">
      <template v-if="liveCapturing || liveHint">
        {{ liveHint || 'Capturing live speech from participants’ mics…' }}
      </template>
      <template v-else>
        Live speech is captured automatically while people are in the video room (Chrome/Safari). You can also paste notes or import chat.
      </template>
    </p>
    <p v-if="livePreview" class="mnp__live">
      <span class="mnp__live-label">Live</span>
      {{ livePreview }}
    </p>
    <label class="mnp__label">Transcript</label>
    <textarea
      v-model="transcript"
      class="mnp__textarea"
      rows="8"
      :disabled="loading || saving || importing"
      placeholder="Live speech appears here as the meeting runs…"
      @input="dirty = true"
    />
    <div class="mnp__actions">
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading || saving || importing" @click="importChat">
        {{ importing ? 'Importing…' : 'Import chat' }}
      </button>
      <button type="button" class="btn btn-primary btn-sm" :disabled="loading || saving || !transcript.trim()" @click="save">
        {{ saving ? 'Saving…' : 'Save & summarize' }}
      </button>
    </div>
    <label class="mnp__label">Summary</label>
    <div class="mnp__summary" v-html="summaryHtml"></div>
    <p v-if="!summary && !loading && !transcript.trim()" class="muted">No transcript yet — join the video room to start capturing speech, or paste notes.</p>
    <p v-else-if="!summary && !loading && transcript.trim()" class="muted">No summary yet. Click Save &amp; summarize when the meeting is done.</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  eventId: { type: [Number, String], required: true },
  liveCapturing: { type: Boolean, default: false },
  liveHint: { type: String, default: '' },
  livePreview: { type: String, default: '' },
  autoRefresh: { type: Boolean, default: false }
});

const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const error = ref('');
const transcript = ref('');
const summary = ref('');
const dirty = ref(false);
let refreshTimer = null;

const summaryHtml = computed(() => {
  const s = String(summary.value || '').trim();
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
});

async function load({ force = false } = {}) {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  if (!force && dirty.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/team-meetings/${eid}/notes`, { skipGlobalLoading: true });
    const next = String(data?.transcript || '');
    if (!dirty.value || force) {
      transcript.value = next;
      dirty.value = false;
    }
    summary.value = String(data?.summary || '');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load notes';
  } finally {
    loading.value = false;
  }
}

async function importChat() {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  importing.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/team-meetings/${eid}/activity`, {
      params: { limit: 500 },
      skipGlobalLoading: true
    });
    const list = Array.isArray(data?.activity) ? data.activity : [];
    const lines = list
      .filter((a) => String(a?.activityType || '').toLowerCase() === 'chat')
      .map((a) => {
        const name = a?.payload?.authorName
          || String(a?.participantIdentity || '').replace(/^user-/, 'User ');
        const text = String(a?.payload?.text || '').trim();
        return text ? `${name}: ${text}` : '';
      })
      .filter(Boolean);
    if (!lines.length) {
      error.value = 'No chat messages to import yet.';
      return;
    }
    const block = lines.join('\n');
    transcript.value = transcript.value.trim()
      ? `${transcript.value.trim()}\n\n${block}`
      : block;
    dirty.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to import chat';
  } finally {
    importing.value = false;
  }
}

async function save() {
  const eid = Number(props.eventId || 0);
  const text = String(transcript.value || '').trim();
  if (!eid || !text) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(
      `/team-meetings/${eid}/client-transcript`,
      { transcript: text, replace: true },
      { skipGlobalLoading: true }
    );
    dirty.value = false;
    setTimeout(() => { load({ force: true }); }, 1200);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save transcript';
  } finally {
    saving.value = false;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!props.autoRefresh) return;
  refreshTimer = setInterval(() => {
    if (!dirty.value) void load();
  }, 12000);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

watch(() => props.eventId, () => {
  dirty.value = false;
  load({ force: true });
});
watch(() => props.autoRefresh, () => startAutoRefresh(), { immediate: true });
onMounted(() => load({ force: true }));
onUnmounted(stopAutoRefresh);

defineExpose({ load });
</script>

<style scoped>
.mnp { display: flex; flex-direction: column; gap: 8px; }
.mnp__head { display: flex; justify-content: space-between; align-items: center; }
.mnp__head h4 { margin: 0; font-size: 0.95rem; }
.mnp__hint { margin: 0; font-size: 0.8rem; line-height: 1.35; }
.mnp__live {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #0f172a;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 8px 10px;
}
.mnp__live-label {
  display: inline-block;
  margin-right: 6px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #047857;
}
.mnp__label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.mnp__textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
  min-height: 120px;
}
.mnp__actions { display: flex; gap: 8px; }
.mnp__summary {
  font-size: 0.9rem;
  line-height: 1.45;
  color: #334155;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  min-height: 48px;
}
.error { color: #b91c1c; margin: 0; font-size: 0.85rem; }
.muted { color: #64748b; margin: 0; font-size: 0.85rem; }
</style>
