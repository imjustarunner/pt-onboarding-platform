<template>
  <div class="container prehire-root">
    <!-- Header -->
    <div class="ph-header">
      <div>
        <h2 class="ph-title" data-tour="prehire-title">Pre-Hire</h2>
        <div class="ph-subtitle">Candidates in setup, pre-hire, and ready-for-review stages</div>
      </div>
      <div class="ph-header-actions">
        <div v-if="canChooseAgency" class="agency-picker">
          <label class="agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="input agency-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button class="btn btn-secondary" @click="loadUsers" :disabled="loading">Refresh</button>
      </div>
    </div>

    <!-- Status counts -->
    <div class="ph-stats" data-tour="prehire-stats">
      <div class="stat-card">
        <div class="stat-count">{{ countByStatus('PENDING_SETUP') }}</div>
        <div class="stat-label">Pending Setup</div>
      </div>
      <div class="stat-card stat-prehire">
        <div class="stat-count">{{ countByStatus('PREHIRE_OPEN') }}</div>
        <div class="stat-label">Pre-Hire</div>
      </div>
      <div class="stat-card stat-review">
        <div class="stat-count">{{ countByStatus('PREHIRE_REVIEW') }}</div>
        <div class="stat-label">Ready for Review</div>
      </div>
      <div class="stat-card stat-total">
        <div class="stat-count">{{ filteredUsers.length }}</div>
        <div class="stat-label">Total in view</div>
      </div>
      <div v-if="pendingCountersignCount > 0" class="stat-card stat-countersign">
        <div class="stat-count">{{ pendingCountersignCount }}</div>
        <div class="stat-label">Pending countersigns</div>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Main grid -->
    <div class="ph-grid">
      <!-- Left: candidate list -->
      <div class="panel list-panel">
        <div class="list-controls" data-tour="prehire-filters">
          <select v-model="statusFilter" class="input" style="max-width:180px;">
            <option value="">All pre-hire</option>
            <option value="PENDING_SETUP">Pending Setup</option>
            <option value="PREHIRE_OPEN">Pre-Hire</option>
            <option value="PREHIRE_REVIEW">Ready for Review</option>
          </select>
          <input v-model="q" class="input" placeholder="Search name/email…" @keyup.enter="applySearch" />
        </div>

        <div v-if="loading" class="loading">Loading…</div>
        <div v-else-if="filteredUsers.length === 0" class="empty-list">
          <div class="empty-icon">👤</div>
          <div class="empty-text">No pre-hire candidates found</div>
          <div class="empty-sub">Candidates appear here after you click "Mark hired" on an applicant.</div>
        </div>
        <div v-else class="user-list" data-tour="prehire-list">
          <button
            v-for="u in filteredUsers"
            :key="u.id"
            class="user-item"
            :class="{ active: selectedId === u.id }"
            @click="selectUser(u.id)"
          >
            <div class="user-item-top">
              <span class="user-name">{{ fullName(u) }}</span>
              <span class="status-pill" :class="statusPillClass(u.status)">{{ statusLabel(u.status) }}</span>
            </div>
            <div class="user-item-meta">
              <span class="user-email">{{ u.personal_email || u.email }}</span>
              <span v-if="daysSince(u)" class="days-badge">{{ daysSince(u) }}d</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Right: detail panel -->
      <div class="panel detail-panel" data-tour="prehire-detail">
        <div v-if="!selectedId" class="empty-detail">
          <div class="empty-icon">←</div>
          <div class="empty-text">Select a candidate to view details</div>
        </div>

        <template v-else-if="selectedUser">
          <!-- Candidate detail header -->
          <div class="detail-header">
            <div class="detail-name-row">
              <h3 class="detail-name">{{ fullName(selectedUser) }}</h3>
              <span class="status-pill status-pill-lg" :class="statusPillClass(selectedUser.status)">
                {{ statusLabel(selectedUser.status) }}
              </span>
            </div>
            <div class="detail-meta">
              <span>{{ selectedUser.personal_email || selectedUser.email }}</span>
              <span v-if="selectedUser.phone" class="sep">·</span>
              <span v-if="selectedUser.phone">{{ selectedUser.phone }}</span>
            </div>
          </div>

          <!-- Quick info cards -->
          <div class="info-cards">
            <div class="info-card">
              <div class="info-card-label">Days since hired</div>
              <div class="info-card-value">{{ daysSince(selectedUser) ?? '—' }}</div>
            </div>
            <div class="info-card">
              <div class="info-card-label">Role</div>
              <div class="info-card-value">{{ selectedUser.role || '—' }}</div>
            </div>
            <div class="info-card">
              <div class="info-card-label">Tasks</div>
              <div class="info-card-value">
                <span v-if="tasksLoading" class="muted">…</span>
                <span v-else>
                  {{ completedTaskCount }}/{{ totalTaskCount }}
                  <span class="muted small"> done</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Stage-specific banners -->
          <div v-if="selectedUser.status === 'PENDING_SETUP'" class="stage-banner stage-banner-warn" data-tour="prehire-stage-banner">
            <div class="stage-banner-title">Waiting on candidate setup</div>
            <div class="stage-banner-sub">
              The candidate has not yet set their password or completed initial account setup.
              Resend their access link if it has expired or was not received.
            </div>
            <div class="stage-actions">
              <button class="btn btn-secondary btn-sm" @click="resendSetupLink" :disabled="resendLoading">
                {{ resendLoading ? 'Sending…' : 'Resend setup link' }}
              </button>
            </div>
            <div v-if="resendMsg" class="stage-msg">{{ resendMsg }}</div>
          </div>

          <div v-else-if="selectedUser.status === 'PREHIRE_OPEN'" class="stage-banner stage-banner-info">
            <div class="stage-banner-title">Pre-hire in progress</div>
            <div class="stage-banner-sub">
              The candidate is completing their pre-hire documents and checklist items.
              Once all required items are finished, their status will advance to Ready for Review automatically.
            </div>
          </div>

          <div v-else-if="selectedUser.status === 'PREHIRE_REVIEW'" class="stage-banner stage-banner-primary">
            <div class="stage-banner-title">Ready for review</div>
            <div class="stage-banner-sub">
              The candidate has completed their pre-hire requirements. Review their submission and promote them to Onboarding when ready.
              A work email address is required before promotion.
            </div>
            <div class="stage-actions">
              <button
                class="btn btn-primary btn-sm"
                @click="promoteToOnboarding"
                :disabled="promoteLoading"
              >
                {{ promoteLoading ? 'Promoting…' : 'Promote to Onboarding' }}
              </button>
            </div>
            <div v-if="promoteMsg" class="stage-msg" :class="{ 'stage-msg-error': promoteError }">{{ promoteMsg }}</div>
          </div>

          <!-- Countersign to-dos -->
          <div v-if="pendingCountersigns.length > 0" class="tasks-section" style="padding-bottom:0;" data-tour="prehire-tasks">
            <div class="section-label">
              Staff countersignatures needed
              <span class="countersign-badge">{{ pendingCountersigns.length }}</span>
            </div>
            <div class="task-list">
              <div
                v-for="t in pendingCountersigns"
                :key="t.id"
                class="task-row task-row-countersign"
              >
                <span class="task-check">✍️</span>
                <div class="task-info">
                  <div class="task-title">{{ t.title }}</div>
                  <div class="task-meta">
                    <span class="task-type-pill pill-countersign">Countersign</span>
                    <span v-if="t.countersign_role_label" class="task-due">{{ t.countersign_role_label }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Candidate tasks -->
          <div class="tasks-section">
            <div class="section-label">Candidate tasks</div>
            <div v-if="tasksLoading" class="loading-sm">Loading tasks…</div>
            <div v-else-if="candidateTasks.length === 0" class="empty-sm">No tasks assigned yet.</div>
            <div v-else class="task-list">
              <div
                v-for="t in candidateTasks"
                :key="t.id"
                class="task-row"
                :class="{ 'task-done': t.status === 'completed' }"
              >
                <span class="task-check" :class="{ 'task-check-done': t.status === 'completed' }">
                  {{ t.status === 'completed' ? '✓' : '○' }}
                </span>
                <div class="task-info">
                  <div class="task-title">{{ t.title }}</div>
                  <div class="task-meta">
                    <span class="task-type-pill">{{ t.task_type }}</span>
                    <span v-if="t.due_date" class="task-due">Due {{ formatDate(t.due_date) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Link to full profile -->
          <div class="profile-link-row">
            <router-link
              :to="orgPath(`/admin/users/${selectedUser.id}`)"
              class="btn btn-secondary btn-sm"
            >
              View full profile →
            </router-link>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();

const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}${path}` : path;
};

// Agency chooser
const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || []).filter(Boolean);
});

const canChooseAgency = computed(() => agencyChoices.value.length > 1);

const selectedAgencyId = ref(
  String(agencyStore.currentAgencyId || agencyChoices.value[0]?.id || '')
);

// Load users
const users = ref([]);
const loading = ref(false);
const error = ref('');
const q = ref('');
const statusFilter = ref('');

// Canonical statuses + legacy aliases for older DB records
const PRE_HIRE_STATUSES = ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW'];
const LEGACY_STATUS_MAP = {
  pending: 'PENDING_SETUP',
  'pending_setup': 'PENDING_SETUP',
  prehire_open: 'PREHIRE_OPEN',
  prehire_review: 'PREHIRE_REVIEW',
  ready_for_review: 'PREHIRE_REVIEW'
};

const normalizeStatus = (s) => {
  if (!s) return s;
  const upper = String(s).toUpperCase();
  if (PRE_HIRE_STATUSES.includes(upper)) return upper;
  return LEGACY_STATUS_MAP[String(s).toLowerCase()] || s;
};

const loadUsers = async () => {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/users');
    users.value = (data || [])
      .map((u) => ({ ...u, status: normalizeStatus(u.status) }))
      .filter((u) => PRE_HIRE_STATUSES.includes(u.status));
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load users.';
  } finally {
    loading.value = false;
  }
};

const filteredUsers = computed(() => {
  let list = users.value;
  if (statusFilter.value) list = list.filter((u) => u.status === statusFilter.value);
  const search = q.value.trim().toLowerCase();
  if (search) {
    list = list.filter((u) =>
      [u.first_name, u.last_name, u.email, u.personal_email]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(search))
    );
  }
  return list;
});

const countByStatus = (status) => users.value.filter((u) => normalizeStatus(u.status) === status).length;
// Global pending countersign count across all pre-hire candidates (approximation from selected user's data)
const pendingCountersignCount = computed(() => pendingCountersigns.value.length);

// Search
const applySearch = () => { /* reactive */ };

// Helpers
const fullName = (u) =>
  `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';

const statusLabel = (status) => {
  const map = {
    PENDING_SETUP: 'Pending Setup',
    PREHIRE_OPEN: 'Pre-Hire',
    PREHIRE_REVIEW: 'Ready for Review'
  };
  return map[status] || status;
};

const statusPillClass = (status) => {
  const map = {
    PENDING_SETUP: 'pill-warning',
    PREHIRE_OPEN: 'pill-info',
    PREHIRE_REVIEW: 'pill-primary'
  };
  return map[status] || '';
};

const daysSince = (u) => {
  const date = u.updated_at || u.created_at;
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Selected user
const selectedId = ref(null);
const selectedUser = computed(() => users.value.find((u) => u.id === selectedId.value) || null);

// Tasks for selected user
const tasks = ref([]);
const tasksLoading = ref(false);

// Countersign tasks: assigned to staff, linked to the candidate's pre-hire docs
const pendingCountersigns = computed(() =>
  tasks.value.filter(t => t.document_action_type === 'countersignature' && t.status !== 'completed')
);
// Candidate-facing tasks (exclude staff countersign tasks)
const candidateTasks = computed(() =>
  tasks.value.filter(t => t.document_action_type !== 'countersignature')
);
const totalTaskCount = computed(() => candidateTasks.value.length);
const completedTaskCount = computed(() => candidateTasks.value.filter(t => t.status === 'completed').length);

const loadTasks = async (userId) => {
  tasksLoading.value = true;
  tasks.value = [];
  try {
    // Load both candidate tasks (assignedToUserId) and staff countersign tasks (reference_id matching)
    const [candidateRes, countersignRes] = await Promise.all([
      api.get('/tasks/all', { params: { assignedToUserId: userId } }),
      api.get('/tasks/all', { params: { taskType: 'document' } }).catch(() => ({ data: [] }))
    ]);
    const candidateTaskData = candidateRes.data || [];
    // Filter countersign tasks that reference a task assigned to this candidate
    const candidateTaskIds = new Set(candidateTaskData.map(t => t.id));
    const countersignData = (countersignRes.data || []).filter(
      t => t.document_action_type === 'countersignature' && candidateTaskIds.has(t.reference_id)
    );
    tasks.value = [...candidateTaskData, ...countersignData];
  } catch {
    tasks.value = [];
  } finally {
    tasksLoading.value = false;
  }
};

const selectUser = (id) => {
  selectedId.value = id;
  resendMsg.value = '';
  promoteMsg.value = '';
  promoteError.value = false;
  loadTasks(id);
};

watch(selectedId, (id) => {
  if (!id) tasks.value = [];
});

// Resend setup link
const resendLoading = ref(false);
const resendMsg = ref('');

const resendSetupLink = async () => {
  if (!selectedId.value) return;
  resendLoading.value = true;
  resendMsg.value = '';
  try {
    await api.post(`/users/${selectedId.value}/resend-setup-link`, { expiresInHours: 168 });
    resendMsg.value = 'Setup link resent successfully.';
  } catch (e) {
    resendMsg.value = e.response?.data?.error?.message || 'Failed to resend link.';
  } finally {
    resendLoading.value = false;
  }
};

// Promote to onboarding
const promoteLoading = ref(false);
const promoteMsg = ref('');
const promoteError = ref(false);

const promoteToOnboarding = async () => {
  if (!selectedId.value) return;
  promoteLoading.value = true;
  promoteMsg.value = '';
  promoteError.value = false;
  try {
    await api.post(`/users/${selectedId.value}/promote-to-onboarding`);
    promoteMsg.value = 'Candidate promoted to Onboarding.';
    await loadUsers();
    selectedId.value = null;
  } catch (e) {
    const err = e.response?.data?.error;
    if (err?.requiresWorkEmail) {
      promoteMsg.value = 'A work email address must be set before promoting. Open the full profile to add one.';
    } else {
      promoteMsg.value = err?.message || 'Failed to promote.';
    }
    promoteError.value = true;
  } finally {
    promoteLoading.value = false;
  }
};

// Agency change
watch(selectedAgencyId, () => {
  selectedId.value = null;
  loadUsers();
});

onMounted(loadUsers);
</script>

<style scoped>
.prehire-root {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px;
}

/* Header */
.ph-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.ph-title { font-size: 22px; font-weight: 700; margin: 0 0 2px; }
.ph-subtitle { font-size: 13px; color: #6b7280; }
.ph-header-actions { display: flex; align-items: center; gap: 10px; }

.agency-picker { display: flex; align-items: center; gap: 8px; }
.agency-label { font-size: 13px; color: #6b7280; white-space: nowrap; }
.agency-select { min-width: 160px; }

/* Stats row */
.ph-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.stat-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 18px;
  min-width: 110px;
}

.stat-prehire { border-color: #bae6fd; background: #f0f9ff; }
.stat-review { border-color: #c7d2fe; background: #eef2ff; }
.stat-total { border-color: #d1d5db; background: white; }
.stat-countersign { border-color: #fde68a; background: #fffbeb; }

.stat-count { font-size: 26px; font-weight: 700; color: #111827; line-height: 1; }
.stat-label { font-size: 12px; color: #6b7280; margin-top: 3px; }

/* Error banner */
.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  color: #dc2626;
  padding: 10px 14px;
  font-size: 14px;
  margin-bottom: 16px;
}

/* Main grid */
.ph-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 768px) {
  .ph-grid { grid-template-columns: 1fr; }
}

.panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
}

/* List panel */
.list-panel { }

.list-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 6px;
  border-bottom: 1px solid #e5e7eb;
}

.user-list { display: flex; flex-direction: column; }

.user-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.12s;
}

.user-item:last-child { border-bottom: none; }
.user-item:hover { background: #f9fafb; }
.user-item.active { background: #eff6ff; }

.user-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.user-name { font-size: 14px; font-weight: 600; color: #111827; flex: 1; }

.user-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.user-email { font-size: 12px; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.days-badge { font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 20px; padding: 2px 7px; flex-shrink: 0; }

/* Status pills */
.status-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-pill-lg { font-size: 13px; padding: 4px 12px; }

.pill-warning { background: #fef9c3; color: #854d0e; }
.pill-info { background: #e0f2fe; color: #0369a1; }
.pill-primary { background: #e0e7ff; color: #4338ca; }

/* Empty states */
.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  text-align: center;
  gap: 6px;
}

.empty-icon { font-size: 32px; }
.empty-text { font-size: 15px; font-weight: 600; color: #374151; }
.empty-sub { font-size: 13px; color: #9ca3af; max-width: 220px; }

.empty-detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
  gap: 8px;
  color: #9ca3af;
}

/* Detail panel */
.detail-panel { min-height: 400px; }

.detail-header {
  padding: 16px 18px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.detail-name { font-size: 18px; font-weight: 700; margin: 0; }
.detail-meta { font-size: 13px; color: #6b7280; display: flex; gap: 6px; align-items: center; }
.sep { color: #d1d5db; }

/* Info cards */
.info-cards {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
}

.info-card {
  flex: 1;
  padding: 12px 18px;
  border-right: 1px solid #e5e7eb;
}

.info-card:last-child { border-right: none; }
.info-card-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; margin-bottom: 4px; }
.info-card-value { font-size: 16px; font-weight: 700; color: #111827; }

/* Stage banners */
.stage-banner {
  margin: 16px 18px 4px;
  border-radius: 10px;
  padding: 12px 14px;
}

.stage-banner-warn { background: #fffbeb; border: 1px solid #fde68a; }
.stage-banner-info { background: #f0f9ff; border: 1px solid #bae6fd; }
.stage-banner-primary { background: #eef2ff; border: 1px solid #c7d2fe; }

.stage-banner-title { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.stage-banner-sub { font-size: 13px; color: #374151; line-height: 1.5; }
.stage-actions { margin-top: 10px; }
.stage-msg { font-size: 13px; margin-top: 8px; color: #374151; }
.stage-msg-error { color: #dc2626; }

/* Tasks */
.tasks-section {
  padding: 16px 18px;
  border-top: 1px solid #f3f4f6;
}

.section-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #374151;
  margin-bottom: 10px;
}

.task-list { display: flex; flex-direction: column; gap: 6px; }

.task-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.task-done { opacity: 0.55; }
.task-check { font-size: 14px; color: #9ca3af; width: 18px; flex-shrink: 0; margin-top: 1px; }
.task-check-done { color: #16a34a; }
.task-row-countersign { background: #fffbeb; border-color: #fde68a; }
.countersign-badge { display: inline-flex; align-items: center; justify-content: center; background: #f59e0b; color: white; border-radius: 20px; font-size: 11px; padding: 1px 7px; font-weight: 700; margin-left: 6px; }
.pill-countersign { background: #fef3c7; color: #92400e; }
.task-info { flex: 1; min-width: 0; }
.task-title { font-size: 13px; font-weight: 500; color: #111827; }
.task-meta { display: flex; gap: 8px; align-items: center; margin-top: 2px; }
.task-type-pill { font-size: 11px; background: #e0e7ff; color: #4338ca; padding: 1px 6px; border-radius: 20px; }
.task-due { font-size: 11px; color: #9ca3af; }

/* Profile link */
.profile-link-row {
  padding: 12px 18px 16px;
  border-top: 1px solid #f3f4f6;
}

/* Misc */
.loading { padding: 20px 14px; font-size: 14px; color: #9ca3af; }
.loading-sm { font-size: 13px; color: #6b7280; padding: 6px 0; }
.empty-sm { font-size: 13px; color: #9ca3af; padding: 6px 0; }
.muted { color: #9ca3af; }
.small { font-size: 12px; }
</style>
