<template>
  <div class="learning-workspace">
    <header class="workspace-header">
      <div>
        <h1>{{ classTitle }}</h1>
        <p class="hint">Group class workspace for slides, documents, moderation, and standards-linked live scoring.</p>
      </div>
      <div class="workspace-actions">
        <button class="btn btn-secondary btn-sm" :disabled="loading" @click="loadWorkspace">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button v-if="canManageSessions" class="btn btn-primary btn-sm" :disabled="createBusy" @click="createSession">
          {{ createBusy ? 'Creating…' : 'New group session' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="error">{{ error }}</div>

    <section class="workspace-grid">
      <aside class="sessions-list">
        <h2>Sessions</h2>
        <div v-if="!sessions.length" class="hint">No sessions yet.</div>
        <button
          v-for="row in sessions"
          :key="row.id"
          type="button"
          class="session-item"
          :class="{ active: Number(activeSessionId) === Number(row.id) }"
          @click="openSession(row.id)"
        >
          <div class="session-item-title">{{ row.title }}</div>
          <div class="session-item-meta">{{ row.status }} · {{ formatDate(row.starts_at || row.created_at) }}</div>
        </button>
      </aside>

      <main class="session-room-wrap">
        <div v-if="activeSessionId">
          <GroupClassSessionRoom :session-id="activeSessionId" />
        </div>
        <div v-else class="hint">Select a session to open the live room.</div>
      </main>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import GroupClassSessionRoom from '../../components/learning/GroupClassSessionRoom.vue';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const createBusy = ref(false);
const error = ref('');
const classInfo = ref(null);
const sessions = ref([]);
const canManageSessions = ref(false);

const classId = computed(() => Number(route.params.classId || 0));
const activeSessionId = computed(() => Number(route.query.sessionId || 0) || null);
const classTitle = computed(() => classInfo.value?.class_name || `Learning class #${classId.value || ''}`);

function formatDate(raw) {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return '';
  }
}

async function loadWorkspace() {
  if (!classId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [klassRes, sessionsRes] = await Promise.all([
      api.get(`/learning-program-classes/${classId.value}`, { skipGlobalLoading: true }),
      api.get(`/learning-class-sessions/classes/${classId.value}/sessions`, { skipGlobalLoading: true })
    ]);
    classInfo.value = klassRes.data?.class || null;
    sessions.value = Array.isArray(sessionsRes.data?.sessions) ? sessionsRes.data.sessions : [];
    canManageSessions.value = ['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus', 'clinical_practice_assistant']
      .includes(String(authStore.user?.role || '').toLowerCase());
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load learning workspace';
  } finally {
    loading.value = false;
  }
}

function openSession(sessionId) {
  router.replace({
    query: {
      ...route.query,
      sessionId: String(sessionId)
    }
  });
}

async function createSession() {
  createBusy.value = true;
  try {
    const resp = await api.post(`/learning-class-sessions/classes/${classId.value}/sessions`, {
      title: `Group Session ${new Date().toLocaleString()}`,
      mode: 'group'
    }, { skipGlobalLoading: true });
    const id = Number(resp.data?.session?.id || 0);
    await loadWorkspace();
    if (id > 0) openSession(id);
  } finally {
    createBusy.value = false;
  }
}

watch(() => classId.value, () => {
  loadWorkspace();
}, { immediate: true });

onMounted(loadWorkspace);
</script>

<style scoped>
.workspace-header { display:flex; justify-content:space-between; gap:12px; margin-bottom:12px; align-items:flex-start; }
.workspace-actions { display:flex; gap:8px; }
.workspace-grid { display:grid; grid-template-columns: 320px 1fr; gap:12px; }
.sessions-list { border:1px solid var(--border-color,#d4d8de); border-radius:12px; padding:10px; background:var(--surface-card,#fff); max-height:80vh; overflow:auto; }
.session-item { width:100%; text-align:left; border:1px solid var(--border-color,#d4d8de); border-radius:10px; padding:10px; margin-top:8px; background:#fff; }
.session-item.active { border-color:#4f7cff; box-shadow:0 0 0 1px rgba(79,124,255,.28) inset; }
.session-item-title { font-weight:600; }
.session-item-meta { color:var(--text-muted,#657383); font-size:12px; margin-top:3px; }
.session-room-wrap { min-height:70vh; }
@media (max-width: 1024px) {
  .workspace-grid { grid-template-columns:1fr; }
}
</style>
