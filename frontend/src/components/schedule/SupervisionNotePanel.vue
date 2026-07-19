<template>
  <div class="snp" data-testid="supervision-note-panel">
    <div class="snp-head">
      <div>
        <h3 class="snp-title">Supervision note</h3>
        <p class="snp-sub muted">Short note, transcript, and summary for this session.</p>
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

    <label class="snp-label">Short note</label>
    <textarea
      class="snp-input"
      rows="3"
      :value="notes"
      :disabled="disabled"
      placeholder="Brief supervision note…"
      @input="emit('update:notes', $event.target.value)"
    />

    <div class="snp-artifacts">
      <label class="snp-label">Transcript link</label>
      <input
        class="snp-input"
        type="url"
        :value="transcriptUrl"
        :disabled="disabled"
        placeholder="https://… transcript link"
        @input="emit('update:transcriptUrl', $event.target.value)"
      />
      <label class="snp-label">Transcript text</label>
      <textarea
        class="snp-input"
        rows="4"
        :value="transcript"
        :disabled="disabled"
        placeholder="Paste transcript text so Gemini can generate a summary."
        @input="emit('update:transcript', $event.target.value)"
      />
      <label class="snp-label">Summary</label>
      <textarea
        class="snp-input"
        rows="3"
        :value="summary"
        :disabled="disabled"
        placeholder="Session summary"
        @input="emit('update:summary', $event.target.value)"
      />
      <div class="snp-artifact-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="saving || loading || !sessionId || disabled"
          @click="emit('save', { autoSummarize: false })"
        >
          {{ saving ? 'Saving…' : 'Save transcript + summary' }}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="saving || loading || !sessionId || disabled || !String(transcript || '').trim()"
          @click="emit('save', { autoSummarize: true })"
        >
          Generate summary with Gemini
        </button>
      </div>
      <p v-if="loading" class="muted">Loading transcript / summary…</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  sessionId: { type: [Number, String], default: 0 },
  notes: { type: String, default: '' },
  transcriptUrl: { type: String, default: '' },
  transcript: { type: String, default: '' },
  summary: { type: String, default: '' },
  joinUrl: { type: String, default: '' },
  showJoin: { type: Boolean, default: false },
  showAgenda: { type: Boolean, default: false },
  joinBusy: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:notes',
  'update:transcriptUrl',
  'update:transcript',
  'update:summary',
  'save',
  'join',
  'open-agenda'
]);
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
.snp-sub { margin: 2px 0 0; font-size: 0.82rem; }
.snp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.snp-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.snp-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.snp-artifacts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.snp-artifact-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.muted { color: #64748b; }
</style>
