<template>
  <div class="aml container">
    <header class="aml__head">
      <div>
        <h1>Admin Meetings</h1>
        <p class="muted">Log of admin meetings with attendance, transcript, summary, and activity.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading && !rows.length" class="muted">Loading admin meetings…</p>
    <p v-else-if="!rows.length" class="muted">No admin meetings found for this agency.</p>

    <div v-else class="aml__list">
      <article
        v-for="row in rows"
        :key="row.eventId || row.id"
        class="aml__card"
        :class="{ 'aml__card--open': selectedId === (row.eventId || row.id) }"
      >
        <button type="button" class="aml__card-head" @click="toggle(row)">
          <div>
            <h2>{{ row.title || 'Admin Meeting' }}</h2>
            <p class="muted">
              {{ formatWhen(row.startAt) }}
              <span v-if="row.hostName"> · Host {{ row.hostName }}</span>
              <span v-if="row.meetingCompletedAt"> · Completed</span>
            </p>
          </div>
          <div class="aml__meta">
            <span>{{ formatDuration(row.attendanceDurationSeconds || row.attendanceTotalPersonSeconds) }} attended</span>
            <span>{{ row.participantCount || 0 }} people</span>
            <span v-if="row.hasTranscript">Transcript</span>
            <span v-if="row.hasSummary">Summary</span>
            <span v-if="row.hasActivity">Chat/Q&amp;A</span>
            <span v-if="row.hasWorkspace">Goals</span>
          </div>
        </button>

        <div v-if="selectedId === (row.eventId || row.id)" class="aml__detail">
          <p v-if="detailLoading" class="muted">Loading meeting data…</p>
          <template v-else>
            <section v-if="detail.attendance?.length">
              <h3>Attendance</h3>
              <ul>
                <li v-for="p in detail.attendance" :key="p.userId">
                  {{ p.name }} — {{ formatMins(p.totalMinutes) }}
                </li>
              </ul>
            </section>
            <section v-if="detail.summary">
              <h3>Summary</h3>
              <div class="aml__prose" v-html="toHtml(detail.summary)"></div>
            </section>
            <section v-if="detail.transcript">
              <h3>Transcript</h3>
              <pre class="aml__pre">{{ newestFirst(detail.transcript) }}</pre>
            </section>
            <section v-if="detail.chat?.length">
              <h3>Chat</h3>
              <ul>
                <li v-for="m in detail.chat" :key="m.id">
                  <strong>{{ m.author }}:</strong>
                  <span v-if="m.text"> {{ m.text }}</span>
                  <img v-if="m.imageUrl" :src="m.imageUrl" alt="" class="aml__img" />
                </li>
              </ul>
            </section>
            <section v-if="detail.goals?.length || detail.actions?.length">
              <h3>Goals &amp; actions</h3>
              <ul>
                <li v-for="g in detail.goals" :key="g.id">Goal: {{ g.text }}</li>
                <li v-for="a in detail.actions" :key="a.id">Action: {{ a.text }}</li>
              </ul>
            </section>
            <p v-if="!detail.summary && !detail.transcript && !detail.chat?.length" class="muted">
              No stored artifacts for this meeting yet.
            </p>
          </template>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const authStore = useAuthStore();
const loading = ref(false);
const detailLoading = ref(false);
const error = ref('');
const rows = ref([]);
const selectedId = ref(null);
const detail = ref({});

const agencyId = computed(() =>
  Number(authStore.user?.agencyId || authStore.user?.agency_id || authStore.currentAgencyId || 0)
);

function formatWhen(raw) {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return String(raw);
  }
}

function formatDuration(seconds) {
  const s = Number(seconds || 0);
  if (!s) return '0m';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function formatMins(m) {
  const n = Number(m || 0);
  return `${Math.round(n * 10) / 10}m`;
}

function newestFirst(text) {
  return String(text || '').split('\n').reverse().join('\n');
}

function toHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

async function load() {
  const aid = agencyId.value;
  if (!aid) {
    error.value = 'No agency selected.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/team-meetings/admin-log', {
      params: { agencyId: aid, limit: 100 },
      skipGlobalLoading: true
    });
    rows.value = Array.isArray(data?.meetings) ? data.meetings : (Array.isArray(data?.rows) ? data.rows : []);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load admin meetings';
  } finally {
    loading.value = false;
  }
}

async function toggle(row) {
  const eid = Number(row.eventId || row.id || 0);
  if (selectedId.value === eid) {
    selectedId.value = null;
    detail.value = {};
    return;
  }
  selectedId.value = eid;
  detailLoading.value = true;
  detail.value = {};
  try {
    const [notesRes, activityRes, workspaceRes, attendanceRes] = await Promise.all([
      api.get(`/team-meetings/${eid}/notes`, { skipGlobalLoading: true }).catch(() => ({ data: {} })),
      api.get(`/team-meetings/${eid}/activity`, { params: { limit: 500 }, skipGlobalLoading: true }).catch(() => ({ data: {} })),
      api.get(`/team-meetings/${eid}/workspace`, { skipGlobalLoading: true }).catch(() => ({ data: {} })),
      api.get(`/team-meetings/${eid}/attendance`, { skipGlobalLoading: true }).catch(() => ({ data: {} }))
    ]);
    const activity = Array.isArray(activityRes?.data?.activity) ? activityRes.data.activity : [];
    const chat = activity
      .filter((a) => String(a.activityType || '').toLowerCase() === 'chat')
      .map((a) => ({
        id: a.id,
        author: a.payload?.authorName || a.participantIdentity || 'Someone',
        text: a.payload?.text || '',
        imageUrl: a.payload?.imageUrl || ''
      }));
    detail.value = {
      summary: notesRes?.data?.summary || '',
      transcript: notesRes?.data?.transcript || '',
      chat,
      goals: workspaceRes?.data?.workspace?.goals || [],
      actions: workspaceRes?.data?.workspace?.actionItems || [],
      attendance: attendanceRes?.data?.participants || attendanceRes?.data?.attendance || []
    };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load meeting detail';
  } finally {
    detailLoading.value = false;
  }
}

onMounted(() => { void load(); });
</script>

<style scoped>
.aml { padding: 20px 16px 40px; max-width: 960px; }
.aml__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.aml__head h1 { margin: 0 0 4px; font-size: 1.5rem; }
.aml__list { display: flex; flex-direction: column; gap: 10px; }
.aml__card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.aml__card-head {
  width: 100%;
  text-align: left;
  border: none;
  background: #fff;
  padding: 14px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.aml__card-head h2 { margin: 0 0 4px; font-size: 1.05rem; }
.aml__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
}
.aml__meta span {
  background: #f1f5f9;
  border-radius: 999px;
  padding: 3px 8px;
}
.aml__detail {
  border-top: 1px solid #e2e8f0;
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.aml__detail h3 {
  margin: 0 0 6px;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.aml__detail ul { margin: 0; padding-left: 18px; }
.aml__pre {
  white-space: pre-wrap;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  font-size: 0.82rem;
  max-height: 280px;
  overflow: auto;
}
.aml__prose { font-size: 0.9rem; line-height: 1.45; color: #334155; }
.aml__img { display: block; max-width: 180px; border-radius: 8px; margin-top: 4px; }
.muted { color: #64748b; }
.error { color: #b91c1c; }
</style>
