<template>
  <div class="learning-workspace">
    <PlatformPreviewBanner
      v-if="isSuperadminPreview"
      :title="`Previewing ${classTitle}`"
      subtitle="This platform preview opens the learning workspace in a read-only shell."
    />
    <header class="workspace-header">
      <div>
        <h1>{{ classTitle }}</h1>
        <p class="hint">Group class workspace for slides, documents, moderation, and standards-linked live scoring.</p>
      </div>
      <div class="workspace-actions">
        <button class="btn btn-secondary btn-sm" :disabled="loading" @click="refresh">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button
          v-if="activeTab === 'sessions' && canManageSessions && !isSuperadminPreview"
          class="btn btn-primary btn-sm"
          :disabled="createBusy"
          @click="createSession"
        >
          {{ createBusy ? 'Creating…' : 'New group session' }}
        </button>
        <router-link
          v-if="activeTab === 'packages' && canManageSessions && !isSuperadminPreview && orgSlug"
          class="btn btn-primary btn-sm"
          :to="{ path: `/${orgSlug}/admin/package-catalog`, query: { programId: String(classId) } }"
        >
          Add package to this program
        </router-link>
      </div>
    </header>

    <div class="workspace-tabs">
      <button type="button" :class="{ active: activeTab === 'sessions' }" @click="activeTab = 'sessions'">Sessions</button>
      <button type="button" :class="{ active: activeTab === 'packages' }" @click="activeTab = 'packages'">Packages</button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <section v-if="activeTab === 'sessions'" class="workspace-grid">
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

    <section v-else class="packages-panel">
      <p class="hint">
        Packages scoped to this program appear in the guardian catalog for enrolled students.
        Tenant-wide individual packages are managed in the package catalog without a program.
      </p>
      <div v-if="packagesLoading" class="hint">Loading packages…</div>
      <div v-else-if="!programPackages.length" class="hint">No packages linked to this program yet.</div>
      <div v-else class="pkg-list">
        <div v-for="pkg in programPackages" :key="pkg.id" class="pkg-card">
          <div>
            <strong>{{ pkg.name }}</strong>
            <div class="hint">
              {{ pkg.sessionCount }} sessions · {{ formatMoney(pkg.priceCents) }}
              · {{ pkg.isPublic ? 'Public' : 'Staff only' }}
              · {{ pkg.isActive ? 'Active' : 'Inactive' }}
            </div>
            <p v-if="pkg.description" class="hint">{{ pkg.description }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import * as unifiedPackages from '../../services/unifiedPackages';
import PlatformPreviewBanner from '../../components/admin/PlatformPreviewBanner.vue';
import { useSuperadminPlatformPreview } from '../../composables/useSuperadminPlatformPreview';
import GroupClassSessionRoom from '../../components/learning/GroupClassSessionRoom.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const { isSuperadminPreview } = useSuperadminPlatformPreview({ route });

const loading = ref(false);
const packagesLoading = ref(false);
const createBusy = ref(false);
const error = ref('');
const classInfo = ref(null);
const sessions = ref([]);
const programPackages = ref([]);
const canManageSessions = ref(false);
const activeTab = ref('sessions');

const classId = computed(() => Number(route.params.classId || 0));
const activeSessionId = computed(() => Number(route.query.sessionId || 0) || null);
const classTitle = computed(() => classInfo.value?.class_name || `Learning class #${classId.value || ''}`);
const orgSlug = computed(() =>
  agencyStore.currentAgency?.slug ||
  agencyStore.currentAgency?.value?.slug ||
  route.params.organizationSlug ||
  classInfo.value?.organization_slug ||
  ''
);

const formatMoney = unifiedPackages.formatMoney;

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
    canManageSessions.value = !isSuperadminPreview.value && ['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus', 'clinical_practice_assistant']
      .includes(String(authStore.user?.role || '').toLowerCase());
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load learning workspace';
  } finally {
    loading.value = false;
  }
}

async function loadPackages() {
  if (!classId.value) return;
  packagesLoading.value = true;
  try {
    const data = await unifiedPackages.listProgramPackages(classId.value, {
      includeInactive: 'true'
    });
    programPackages.value = data?.packages || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load packages';
  } finally {
    packagesLoading.value = false;
  }
}

async function refresh() {
  if (activeTab.value === 'packages') await loadPackages();
  else await loadWorkspace();
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
  if (activeTab.value === 'packages') loadPackages();
}, { immediate: true });

watch(activeTab, (tab) => {
  if (tab === 'packages') loadPackages();
});

onMounted(loadWorkspace);
</script>

<style scoped>
.workspace-header { display:flex; justify-content:space-between; gap:12px; margin-bottom:12px; align-items:flex-start; }
.workspace-actions { display:flex; gap:8px; flex-wrap:wrap; }
.workspace-tabs { display:flex; gap:8px; margin-bottom:12px; }
.workspace-tabs button {
  border:1px solid var(--border-color,#d4d8de); background:#fff; border-radius:999px;
  padding:6px 14px; cursor:pointer; font:inherit;
}
.workspace-tabs button.active { background:#0f766e; color:#fff; border-color:#0f766e; }
.workspace-grid { display:grid; grid-template-columns: 320px 1fr; gap:12px; }
.sessions-list { border:1px solid var(--border-color,#d4d8de); border-radius:12px; padding:10px; background:var(--surface-card,#fff); max-height:80vh; overflow:auto; }
.session-item { width:100%; text-align:left; border:1px solid var(--border-color,#d4d8de); border-radius:10px; padding:10px; margin-top:8px; background:#fff; }
.session-item.active { border-color:#4f7cff; box-shadow:0 0 0 1px rgba(79,124,255,.28) inset; }
.session-item-title { font-weight:600; }
.session-item-meta { color:var(--text-muted,#657383); font-size:12px; margin-top:3px; }
.session-room-wrap { min-height:70vh; }
.packages-panel { border:1px solid var(--border-color,#d4d8de); border-radius:12px; padding:14px; background:#fff; }
.pkg-list { display:flex; flex-direction:column; gap:10px; margin-top:12px; }
.pkg-card { border:1px solid #e2e8f0; border-radius:10px; padding:12px; }
.hint { color:var(--text-muted,#657383); }
.error { color:#b91c1c; margin-bottom:8px; }
.btn { text-decoration:none; display:inline-flex; align-items:center; }
@media (max-width: 1024px) {
  .workspace-grid { grid-template-columns:1fr; }
}
</style>
