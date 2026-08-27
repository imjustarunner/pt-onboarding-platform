<template>
  <div class="tct-panel">
    <div class="tct-head">
      <div>
        <h3>Today’s tutoring caseload</h3>
        <p class="tct-muted">Prep status, subject track, and session times.</p>
      </div>
      <button type="button" class="tct-btn" :disabled="loading" @click="load">Refresh</button>
    </div>
    <p v-if="error" class="tct-error">{{ error }}</p>
    <p v-else-if="!loading && !sessions.length" class="tct-muted">No tutoring sessions scheduled for today.</p>
    <div v-for="s in sessions" :key="s.session_id" class="tct-card">
      <div class="tct-card-head">
        <strong>{{ s.clientName || s.title || `Session #${s.session_id}` }}</strong>
        <span class="tct-badge">{{ s.prepStatus }}</span>
      </div>
      <div class="tct-muted">
        {{ formatTime(s.starts_at) }}
        <template v-if="s.subject_label"> · {{ s.subject_label }}</template>
        <template v-if="s.subject_status"> · {{ String(s.subject_status).replace(/_/g, ' ') }}</template>
      </div>
      <div class="tct-actions">
        <router-link
          v-if="s.delivery_mode === 'in_person' || String(s.delivery_mode || '').includes('in_person')"
          class="tct-link"
          :to="inPersonPath(s.session_id)"
        >Open session guide</router-link>
        <router-link v-else class="tct-link" :to="virtualPath(s.session_id)">Open session guide</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { fetchTutorCaseloadToday } from '@/services/tutoringLearningOs';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  tutorUserId: { type: [Number, String], default: null },
  organizationSlug: { type: String, default: '' }
});

const sessions = ref([]);
const loading = ref(false);
const error = ref('');

function formatTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(v);
  }
}

function virtualPath(id) {
  return props.organizationSlug
    ? `/${props.organizationSlug}/tutoring-session/${id}`
    : `/tutoring-session/${id}`;
}

function inPersonPath(id) {
  return props.organizationSlug
    ? `/${props.organizationSlug}/in-person-tutoring-session/${id}`
    : `/in-person-tutoring-session/${id}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchTutorCaseloadToday({
      agencyId: Number(props.agencyId),
      tutorUserId: props.tutorUserId ? Number(props.tutorUserId) : undefined
    });
    sessions.value = data.sessions || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.tct-panel { display: flex; flex-direction: column; gap: 0.55rem; }
.tct-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
.tct-head h3 { margin: 0; font-size: 1rem; }
.tct-muted { color: #64748b; font-size: 0.85rem; margin: 0.15rem 0 0; }
.tct-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 0.35rem 0.65rem; cursor: pointer; }
.tct-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.7rem 0.85rem; background: #fff; }
.tct-card-head { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
.tct-badge { font-size: 0.72rem; background: #eff6ff; color: #1d4ed8; border-radius: 999px; padding: 0.15rem 0.45rem; text-transform: capitalize; }
.tct-actions { margin-top: 0.35rem; }
.tct-link { color: #2563eb; font-size: 0.85rem; text-decoration: none; }
.tct-error { color: #b91c1c; }
</style>
