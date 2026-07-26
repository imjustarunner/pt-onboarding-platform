<template>
  <div class="snp" data-testid="supervision-note-panel">
    <div class="snp-head">
      <div>
        <h3 class="snp-title">Supervision note</h3>
        <p class="snp-sub muted">
          Private note to yourself before or after the session. Encrypted and visible only to you — not your supervisor or supervisee.
        </p>
      </div>
      <div class="snp-actions">
        <button
          v-if="showJoin"
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="joinBusy || !sessionId"
          @click="emit('join')"
        >
          {{ joinBusy ? 'Joining…' : 'Join with app' }}
        </button>
        <a
          v-if="joinUrl"
          class="btn btn-secondary btn-sm"
          :href="joinUrl"
          target="_blank"
          rel="noreferrer"
        >Open in new tab</a>
        <button
          v-if="showAgenda"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!sessionId"
          @click="emit('open-agenda')"
        >
          Agenda
        </button>
      </div>
    </div>

    <p v-if="!sessionId" class="muted snp-hint">Save the session first, then you can add a personal note.</p>
    <p v-else-if="noteLoading" class="muted">Loading your note…</p>

    <template v-else>
      <div class="snp-private">
        <div class="snp-private-head">
          <label class="snp-label" for="snp-personal-note">Your private note</label>
          <span v-if="saveStatus" class="snp-status" :class="`snp-status--${saveStatus}`" aria-live="polite">
            <span v-if="saveStatus === 'saving'">Saving…</span>
            <span v-else-if="saveStatus === 'saved'">Saved</span>
            <span v-else-if="saveStatus === 'error'">Couldn't save</span>
          </span>
        </div>
        <textarea
          id="snp-personal-note"
          class="snp-input"
          rows="4"
          :value="noteText"
          :disabled="disabled || noteSaving"
          placeholder="Brief note to yourself — prep, reflections, follow-ups…"
          @input="onNoteInput"
        />
        <p class="snp-lock muted">
          <span aria-hidden="true">🔒</span>
          Encrypted in the database. Only you can read this note.
        </p>
      </div>

      <div class="snp-artifacts">
        <section class="snp-section">
          <h4 class="snp-label">Session transcript</h4>
          <p v-if="loading" class="muted">Loading session transcript…</p>
          <pre v-else-if="transcript" class="snp-readonly">{{ transcript }}</pre>
          <p v-else class="muted snp-empty">
            No transcript yet. Transcript is captured automatically when participants join through the app video room.
          </p>
        </section>

        <section class="snp-section">
          <h4 class="snp-label">AI summary</h4>
          <p v-if="loading" class="muted">Loading session summary…</p>
          <div
            v-else-if="summary"
            class="snp-readonly snp-readonly--summary markdown-body"
            v-html="renderedSummary(summary)"
          />
          <p v-else class="muted snp-empty">
            No summary yet. Summary is generated automatically after the session is finalized.
          </p>
        </section>
      </div>
    </template>

    <p v-if="error || noteError" class="error">{{ noteError || error }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  sessionId: { type: [Number, String], default: 0 },
  transcript: { type: String, default: '' },
  summary: { type: String, default: '' },
  joinUrl: { type: String, default: '' },
  showJoin: { type: Boolean, default: false },
  showAgenda: { type: Boolean, default: false },
  joinBusy: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['join', 'open-agenda']);

const noteText = ref('');
const noteLoading = ref(false);
const noteSaving = ref(false);
const noteError = ref('');
const saveStatus = ref('');
let saveTimer = null;
let flashTimer = null;

async function loadNote() {
  const sid = Number(props.sessionId || 0);
  noteText.value = '';
  noteError.value = '';
  if (!sid) return;
  noteLoading.value = true;
  try {
    const { data } = await api.get(`/supervision/sessions/${sid}/personal-note`, { skipGlobalLoading: true });
    noteText.value = String(data?.note || '');
  } catch (e) {
    noteError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load your note';
  } finally {
    noteLoading.value = false;
  }
}

async function saveNote() {
  const sid = Number(props.sessionId || 0);
  if (!sid || noteSaving.value) return;
  noteSaving.value = true;
  saveStatus.value = 'saving';
  noteError.value = '';
  try {
    const { data } = await api.put(`/supervision/sessions/${sid}/personal-note`, {
      noteText: noteText.value || ''
    }, { skipGlobalLoading: true });
    noteText.value = String(data?.note ?? noteText.value ?? '');
    saveStatus.value = 'saved';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { saveStatus.value = ''; }, 2000);
  } catch (e) {
    noteError.value = e?.response?.data?.error?.message || e?.message || 'Failed to save your note';
    saveStatus.value = 'error';
  } finally {
    noteSaving.value = false;
  }
}

function queueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveNote(); }, 700);
}

function onNoteInput(event) {
  noteText.value = event?.target?.value || '';
  queueSave();
}

function renderedSummary(text) {
  if (!text) return '';
  return String(text)
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

watch(() => Number(props.sessionId || 0), () => { void loadNote(); }, { immediate: true });
</script>

<style scoped>
.snp { display: flex; flex-direction: column; gap: 10px; }
.snp-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.snp-title { margin: 0; font-size: 1rem; font-weight: 800; color: #0f172a; }
.snp-sub { margin: 2px 0 0; font-size: 0.82rem; max-width: 42rem; line-height: 1.4; }
.snp-hint { margin: 0; font-size: 0.85rem; }
.snp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.snp-private {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.snp-private-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.snp-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.snp-status {
  font-size: 0.78rem;
  font-weight: 700;
}
.snp-status--saving { color: #64748b; }
.snp-status--saved { color: #15803d; }
.snp-status--error { color: #b91c1c; }
.snp-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.snp-lock {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
}
.snp-artifacts {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.snp-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.snp-readonly {
  margin: 0;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  font-size: 0.88rem;
  line-height: 1.45;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow-y: auto;
}
.snp-readonly--summary {
  white-space: normal;
}
.markdown-body :deep(h2) { font-size: 1.05em; margin: 8px 0 4px; }
.markdown-body :deep(h3) { font-size: 1em; margin: 6px 0 4px; }
.markdown-body :deep(h4) { font-size: 0.95em; margin: 4px 0 2px; }
.snp-empty { margin: 0; font-size: 0.82rem; line-height: 1.4; }
.error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.muted { color: #64748b; }
</style>
