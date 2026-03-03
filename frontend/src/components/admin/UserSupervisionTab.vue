<template>
  <div class="user-supervision-tab">
    <div v-if="loading" class="loading">Loading supervision sessions…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!sessions.length" class="empty-state">
      <p>No supervision sessions found.</p>
    </div>
    <div v-else class="sessions-list">
      <article
        v-for="session in sessions"
        :key="session.id"
        class="supervision-session-card"
      >
        <div class="session-header">
          <details v-if="session.summaryText" class="session-details-inline">
            <summary class="session-meta session-meta-clickable">
              <strong>{{ formatSessionType(session.sessionType) }}</strong>
              <span class="session-date">{{ formatSessionDate(session.startAt) }}</span>
              <span v-if="session.supervisorName" class="session-supervisor">with {{ session.supervisorName }}</span>
            </summary>
            <div class="artifact-content markdown-body" v-html="renderedSummary(session.summaryText)"></div>
          </details>
          <div v-else class="session-meta">
            <strong>{{ formatSessionType(session.sessionType) }}</strong>
            <span class="session-date">{{ formatSessionDate(session.startAt) }}</span>
            <span v-if="session.supervisorName" class="session-supervisor">with {{ session.supervisorName }}</span>
          </div>
          <a
            v-if="session.joinUrl && isUpcoming(session)"
            :href="session.joinUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-primary btn-sm"
          >
            Join
          </a>
        </div>
        <details v-if="session.transcriptText" class="artifact-block">
          <summary>Transcript</summary>
          <pre class="artifact-content">{{ session.transcriptText }}</pre>
        </details>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});

const loading = ref(false);
const error = ref('');
const sessions = ref([]);

async function fetchSessions() {
  const uid = props.userId;
  if (!uid && uid !== 0) return;
  loading.value = true;
  error.value = '';
  try {
    const params = props.agencyId ? { agencyId: props.agencyId } : {};
    const resp = String(uid) === 'me'
      ? await api.get('/supervision/my-sessions', { params })
      : await api.get(`/supervision/supervisee/${uid}/sessions`, { params });
    sessions.value = resp?.data?.sessions || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load sessions';
    sessions.value = [];
  } finally {
    loading.value = false;
  }
}

function formatSessionType(type) {
  const t = String(type || 'individual').toLowerCase();
  if (t === 'group') return 'Group supervision';
  if (t === 'triadic') return 'Triadic supervision';
  return 'Individual supervision';
}

function formatSessionDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function isUpcoming(session) {
  const end = new Date(session.endAt || 0);
  return end.getTime() > Date.now();
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

onMounted(fetchSessions);
watch([() => props.userId, () => props.agencyId], fetchSessions);
</script>

<style scoped>
.user-supervision-tab {
  padding: 16px 0;
}
.loading,
.error,
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
.error {
  color: #b91c1c;
}
.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.supervision-session-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background: var(--bg-secondary);
}
.session-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.session-meta-clickable {
  cursor: pointer;
  list-style: none;
}
.session-meta-clickable::-webkit-details-marker {
  display: none;
}
.session-meta-clickable::before {
  content: '▸ ';
  margin-right: 4px;
  font-size: 0.85em;
}
details[open] .session-meta-clickable::before {
  content: '▾ ';
}
.session-details-inline .artifact-content {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.session-date {
  color: var(--text-secondary);
  font-size: 0.9em;
}
.session-supervisor {
  color: var(--text-secondary);
  font-size: 0.9em;
}
.session-artifacts {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.artifact-block summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--text-primary);
}
.artifact-content {
  margin-top: 8px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 6px;
  font-size: 0.9em;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}
.markdown-body :deep(h2) { font-size: 1.1em; margin: 8px 0 4px; }
.markdown-body :deep(h3) { font-size: 1em; margin: 6px 0 4px; }
.markdown-body :deep(h4) { font-size: 0.95em; margin: 4px 0 2px; }
</style>
