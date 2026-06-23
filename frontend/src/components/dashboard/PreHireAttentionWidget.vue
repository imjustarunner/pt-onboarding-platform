<template>
  <div v-if="hasItems" class="phaw-root">
    <div class="phaw-header">
      <span class="phaw-icon">🤝</span>
      <span class="phaw-title">Pre-Hire — Needs Attention</span>
      <router-link :to="preHireRoute" class="phaw-see-all">View all →</router-link>
    </div>

    <div class="phaw-items">
      <!-- Staff countersign to-dos -->
      <template v-if="countersignTasks.length > 0">
        <div class="phaw-group-label">Awaiting your countersignature</div>
        <div
          v-for="task in countersignTasks.slice(0, 3)"
          :key="'cs-' + task.id"
          class="phaw-item phaw-item-amber"
        >
          <span class="phaw-item-icon">✍️</span>
          <div class="phaw-item-body">
            <div class="phaw-item-title">{{ task.title }}</div>
            <div class="phaw-item-sub" v-if="task.countersign_role_label">{{ task.countersign_role_label }}</div>
          </div>
          <span class="phaw-badge phaw-badge-amber">Action needed</span>
        </div>
        <div v-if="countersignTasks.length > 3" class="phaw-overflow">
          +{{ countersignTasks.length - 3 }} more countersignature{{ countersignTasks.length - 3 !== 1 ? 's' : '' }}
        </div>
      </template>

      <!-- Candidates ready for review (PREHIRE_REVIEW) -->
      <template v-if="reviewCandidates.length > 0">
        <div class="phaw-group-label">Ready for your review</div>
        <div
          v-for="u in reviewCandidates.slice(0, 3)"
          :key="'rv-' + u.id"
          class="phaw-item phaw-item-indigo"
        >
          <span class="phaw-item-icon">📋</span>
          <div class="phaw-item-body">
            <div class="phaw-item-title">{{ fullName(u) }}</div>
            <div class="phaw-item-sub">{{ u.personal_email || u.email }}</div>
          </div>
          <span class="phaw-badge phaw-badge-indigo">Review</span>
        </div>
        <div v-if="reviewCandidates.length > 3" class="phaw-overflow">
          +{{ reviewCandidates.length - 3 }} more ready for review
        </div>
      </template>

      <!-- Candidates stuck in PENDING_SETUP (> 3 days) -->
      <template v-if="stalePendingCandidates.length > 0">
        <div class="phaw-group-label">Setup link not started (3+ days)</div>
        <div
          v-for="u in stalePendingCandidates.slice(0, 2)"
          :key="'sp-' + u.id"
          class="phaw-item phaw-item-warn"
        >
          <span class="phaw-item-icon">⏳</span>
          <div class="phaw-item-body">
            <div class="phaw-item-title">{{ fullName(u) }}</div>
            <div class="phaw-item-sub">{{ daysSince(u.created_at) }} days since hired</div>
          </div>
          <span class="phaw-badge phaw-badge-warn">Stale</span>
        </div>
        <div v-if="stalePendingCandidates.length > 2" class="phaw-overflow">
          +{{ stalePendingCandidates.length - 2 }} more
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();

const users = ref([]);
const countersignTasks = ref([]);

const agencyId = computed(() => agencyStore.currentAgency?.id || null);
const preHireRoute = computed(() => {
  const slug = route.params.organizationSlug;
  return slug ? `/${slug}/admin/pre-hire` : '/admin/pre-hire';
});

const PRE_HIRE_STATUSES = new Set(['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'pending', 'ready_for_review']);

const normalizeStatus = (s) => {
  if (!s) return s;
  const map = { pending: 'PENDING_SETUP', ready_for_review: 'PREHIRE_REVIEW', prehire_review: 'PREHIRE_REVIEW' };
  return map[String(s).toLowerCase()] || String(s).toUpperCase();
};

const reviewCandidates = computed(() =>
  users.value.filter((u) => normalizeStatus(u.status) === 'PREHIRE_REVIEW')
);

const stalePendingCandidates = computed(() =>
  users.value.filter((u) => normalizeStatus(u.status) === 'PENDING_SETUP' && daysSince(u.created_at) >= 3)
);

const hasItems = computed(() =>
  countersignTasks.value.length > 0 ||
  reviewCandidates.value.length > 0 ||
  stalePendingCandidates.value.length > 0
);

const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';

const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const load = async () => {
  try {
    const params = agencyId.value ? { agencyId: agencyId.value } : {};

    const [usersRes, tasksRes] = await Promise.all([
      api.get('/users'),
      api.get('/tasks/all', { params: { ...params, taskType: 'document' } }).catch(() => ({ data: [] }))
    ]);

    users.value = (usersRes.data || [])
      .map((u) => ({ ...u, status: normalizeStatus(u.status) }))
      .filter((u) => PRE_HIRE_STATUSES.has(u.status) || ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW'].includes(u.status));

    // My pending countersign tasks
    const myId = authStore.user?.id;
    countersignTasks.value = (tasksRes.data || []).filter(
      (t) =>
        t.document_action_type === 'countersignature' &&
        t.countersign_signer_user_id === myId &&
        t.status !== 'completed'
    );
  } catch { /* non-fatal */ }
};

onMounted(load);
</script>

<style scoped>
.phaw-root {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.phaw-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  background: #fafafa;
}
.phaw-icon { font-size: 16px; }
.phaw-title { font-size: 13px; font-weight: 700; color: #111827; flex: 1; }
.phaw-see-all { font-size: 12px; color: #2563eb; text-decoration: none; }
.phaw-see-all:hover { text-decoration: underline; }

.phaw-items { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }

.phaw-group-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #9ca3af;
  padding: 8px 0 4px;
}
.phaw-group-label:first-child { padding-top: 2px; }

.phaw-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
}
.phaw-item-amber { background: #fffbeb; border-color: #fde68a; }
.phaw-item-indigo { background: #eef2ff; border-color: #c7d2fe; }
.phaw-item-warn { background: #fff7ed; border-color: #fed7aa; }

.phaw-item-icon { font-size: 16px; flex-shrink: 0; }
.phaw-item-body { flex: 1; min-width: 0; }
.phaw-item-title { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.phaw-item-sub { font-size: 11px; color: #6b7280; margin-top: 1px; }

.phaw-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  flex-shrink: 0;
}
.phaw-badge-amber { background: #fef3c7; color: #92400e; }
.phaw-badge-indigo { background: #e0e7ff; color: #3730a3; }
.phaw-badge-warn { background: #ffedd5; color: #9a3412; }

.phaw-overflow { font-size: 11px; color: #9ca3af; padding: 4px 10px 2px; }
</style>
