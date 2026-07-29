<template>
  <div class="mnp" data-testid="meeting-notes-panel">
    <div class="mnp__head">
      <button type="button" class="mnp__collapse" @click="expanded = !expanded">
        <h4>Meeting transcript</h4>
        <span class="mnp__chevron">{{ expanded ? '▾' : '▸' }}</span>
      </button>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load({ force: true })">Refresh</button>
    </div>

    <p v-if="stopLabel" class="mnp__stop">{{ stopLabel }}</p>
    <p v-else-if="paused || roomPaused" class="mnp__paused">Transcript paused</p>

    <div v-if="canControlTranscript" class="mnp__controls">
      <button
        v-if="!roomStopped && !stopLabel"
        type="button"
        class="btn btn-secondary btn-sm"
        :disabled="controlling"
        @click="onPauseResume"
      >
        {{ (paused || roomPaused) ? 'Resume' : 'Pause' }}
      </button>
      <button
        v-if="canStopTranscript && !roomStopped && !stopLabel"
        type="button"
        class="btn btn-danger btn-sm"
        :disabled="controlling"
        @click="onStop"
      >
        Stop transcription
      </button>
    </div>

    <template v-if="expanded">
      <p v-if="error" class="error">{{ error }}</p>
      <p class="muted mnp__hint">
        <template v-if="liveCapturing || liveHint">
          {{ liveHint || 'Capturing live speech from participants’ mics…' }}
        </template>
        <template v-else>
          Live speech is captured automatically while people are in the video room (Chrome/Safari). Newest lines appear first.
        </template>
      </p>
      <p v-if="livePreview" class="mnp__live">
        <span class="mnp__live-label">Caption</span>
        {{ livePreview }}
      </p>
      <label class="mnp__label">Transcript (newest first)</label>
      <textarea
        v-model="transcriptDisplay"
        class="mnp__textarea"
        rows="8"
        :disabled="loading || saving || importing"
        placeholder="Live speech appears here as the meeting runs…"
        @input="onDisplayInput"
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
      <p v-else-if="!summary && !loading && transcript.trim()" class="muted">No summary yet. It is generated when the meeting is completed, or click Save &amp; summarize.</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  eventId: { type: [Number, String], default: null },
  sessionId: { type: [Number, String], default: null },
  liveCapturing: { type: Boolean, default: false },
  liveHint: { type: String, default: '' },
  livePreview: { type: String, default: '' },
  autoRefresh: { type: Boolean, default: false },
  canControlTranscript: { type: Boolean, default: false },
  canStopTranscript: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  roomStopped: { type: Boolean, default: false },
  stopMeta: { type: Object, default: null }
});

const emit = defineEmits(['pause', 'resume', 'stop', 'control']);

const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const controlling = ref(false);
const error = ref('');
const transcript = ref('');
const summary = ref('');
const dirty = ref(false);
const expanded = ref(false);
const roomPaused = ref(false);
const localStopMeta = ref(null);
let refreshTimer = null;

const stopLabel = computed(() => {
  const meta = props.stopMeta || localStopMeta.value;
  if (!meta?.stoppedByName && !meta?.stoppedAt && !props.roomStopped) return '';
  const who = meta?.stoppedByName || 'Host';
  const when = meta?.stoppedAt ? new Date(meta.stoppedAt).toLocaleString() : '';
  return when ? `Transcription stopped by ${who} at ${when}` : `Transcription stopped by ${who}`;
});

const summaryHtml = computed(() => {
  const s = String(summary.value || '').trim();
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
});

function reverseLines(text) {
  const lines = String(text || '').split('\n');
  return lines.reverse().join('\n');
}

const transcriptDisplay = computed({
  get() {
    return reverseLines(transcript.value);
  },
  set(v) {
    transcript.value = reverseLines(v);
    dirty.value = true;
  }
});

function onDisplayInput() {
  dirty.value = true;
}

function notesPath() {
  const eid = Number(props.eventId || 0);
  const sid = Number(props.sessionId || 0);
  if (eid) return `/team-meetings/${eid}/notes`;
  if (sid) return `/supervision/sessions/${sid}/artifacts`;
  return null;
}

function controlPath() {
  const eid = Number(props.eventId || 0);
  const sid = Number(props.sessionId || 0);
  if (eid) return `/team-meetings/${eid}/transcript-control`;
  if (sid) return `/supervision/sessions/${sid}/transcript-control`;
  return null;
}

async function load({ force = false } = {}) {
  const path = notesPath();
  if (!path) return;
  if (!force && dirty.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(path, { skipGlobalLoading: true });
    const next = String(data?.transcript || data?.artifact?.transcript_text || data?.transcript_text || '');
    if (!dirty.value || force) {
      transcript.value = next;
      dirty.value = false;
    }
    summary.value = String(data?.summary || data?.artifact?.summary_text || data?.summary_text || '');
    const stoppedAt = data?.transcriptStoppedAt || data?.artifact?.transcript_stopped_at;
    const stoppedBy = data?.transcriptStoppedByName || data?.artifact?.transcript_stopped_by_name;
    if (stoppedAt || stoppedBy) {
      localStopMeta.value = {
        stoppedAt,
        stoppedByName: stoppedBy
      };
    }
    roomPaused.value = !!(data?.transcriptPaused ?? data?.artifact?.transcript_paused);
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
    await api.post(`/team-meetings/${eid}/notes/import-chat`, {}, { skipGlobalLoading: true });
    dirty.value = false;
    await load({ force: true });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to import chat';
  } finally {
    importing.value = false;
  }
}

async function save() {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/team-meetings/${eid}/notes`, {
      transcript: transcript.value
    }, { skipGlobalLoading: true });
    dirty.value = false;
    await load({ force: true });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

async function postControl(action) {
  const path = controlPath();
  if (!path) {
    emit(action === 'pause' ? 'pause' : action === 'resume' ? 'resume' : 'stop');
    return;
  }
  controlling.value = true;
  try {
    const { data } = await api.post(path, { action }, { skipGlobalLoading: true });
    if (action === 'stop') {
      localStopMeta.value = {
        stoppedAt: data?.stoppedAt || new Date().toISOString(),
        stoppedByName: data?.stoppedByName || 'Host'
      };
    }
    if (action === 'pause') roomPaused.value = true;
    if (action === 'resume') roomPaused.value = false;
    emit('control', { action, ...(data || {}) });
    emit(action === 'pause' ? 'pause' : action === 'resume' ? 'resume' : 'stop', data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Transcript control failed';
  } finally {
    controlling.value = false;
  }
}

function onPauseResume() {
  void postControl((props.paused || roomPaused.value) ? 'resume' : 'pause');
}

function onStop() {
  void postControl('stop');
}

watch(() => [props.eventId, props.sessionId], () => {
  dirty.value = false;
  void load({ force: true });
});

onMounted(() => {
  void load({ force: true });
  if (props.autoRefresh) {
    refreshTimer = setInterval(() => { void load(); }, 15000);
  }
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<style scoped>
.mnp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.mnp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mnp__collapse {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
}
.mnp__collapse h4 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.mnp__chevron { color: #64748b; font-size: 0.85rem; }
.mnp__hint, .mnp__live { margin: 0; font-size: 0.8rem; }
.mnp__live {
  background: #f0f9ff;
  border-radius: 8px;
  padding: 8px;
  color: #0c4a6e;
}
.mnp__live-label {
  font-weight: 800;
  margin-right: 6px;
  text-transform: uppercase;
  font-size: 0.7rem;
}
.mnp__label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
}
.mnp__textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  min-height: 140px;
  resize: vertical;
}
.mnp__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mnp__summary {
  min-height: 48px;
  font-size: 0.88rem;
  color: #334155;
  line-height: 1.45;
}
.mnp__controls { display: flex; gap: 8px; flex-wrap: wrap; }
.mnp__stop {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: #b91c1c;
}
.mnp__paused {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: #b45309;
}
.muted { color: #64748b; font-size: 0.8rem; }
.error { color: #b91c1c; font-size: 0.8rem; margin: 0; }
</style>
