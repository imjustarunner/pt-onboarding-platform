<template>
  <div class="ona-root">
    <!-- Header -->
    <div class="ona-header">
      <div>
        <h2 class="ona-title">Onboarding</h2>
        <p class="ona-subtitle">Hired employees completing their onboarding checklist.</p>
      </div>
      <div class="ona-header-right">
        <div v-if="canChooseAgency" class="ona-agency-picker">
          <label class="ona-agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="ona-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button class="ona-btn ona-btn-secondary" @click="load" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Refresh
        </button>
        <router-link :to="applicantsRoute" class="ona-btn ona-btn-secondary">View Applicants</router-link>
        <router-link :to="preHireRoute" class="ona-btn ona-btn-secondary">View Pre-Hire</router-link>
        <span class="ona-btn ona-btn-primary ona-btn-active">View Onboarding</span>
      </div>
    </div>

    <!-- Stats -->
    <div class="ona-stats">
      <div class="ona-stat-card">
        <div class="ona-stat-icon ona-stat-icon-green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <div>
          <div class="ona-stat-count">{{ employees.length }}</div>
          <div class="ona-stat-label">Onboarding</div>
        </div>
      </div>
      <div class="ona-stat-card">
        <div class="ona-stat-icon ona-stat-icon-indigo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <div class="ona-stat-count">{{ completedCount }}</div>
          <div class="ona-stat-label">Completed</div>
        </div>
      </div>
      <div class="ona-stat-card">
        <div class="ona-stat-icon ona-stat-icon-red">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div>
          <div class="ona-stat-count">{{ totalOverdue }}</div>
          <div class="ona-stat-label">Overdue Items</div>
        </div>
      </div>
      <div class="ona-stat-card">
        <div class="ona-stat-icon ona-stat-icon-gray">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </div>
        <div>
          <div class="ona-stat-count">{{ filteredEmployees.length }}</div>
          <div class="ona-stat-label">Total in View</div>
        </div>
      </div>
    </div>

    <div v-if="error" class="ona-error">{{ error }}</div>

    <!-- Controls -->
    <div class="ona-controls">
      <div class="ona-search-wrap">
        <svg class="ona-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="q" class="ona-input" placeholder="Search by name, email, or job…" />
      </div>
      <select v-model="progressFilter" class="ona-select ona-select-sm">
        <option value="">All onboarding</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="overdue">Has Overdue Items</option>
      </select>
      <button class="ona-btn ona-btn-secondary ona-btn-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
        Filters
      </button>
    </div>

    <!-- Table -->
    <div class="ona-table-section">
      <table class="ona-table">
        <thead>
          <tr>
            <th class="ona-th ona-th-sortable" @click="setSort('name')">
              Employee <span class="sort-arrow">{{ sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th class="ona-th">Job Title</th>
            <th class="ona-th ona-th-sortable" @click="setSort('hired_at')">
              Hire Date <span class="sort-arrow">{{ sortCol === 'hired_at' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th class="ona-th ona-th-sortable" @click="setSort('created_at')">
              Onboarding Start <span class="sort-arrow">{{ sortCol === 'created_at' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th class="ona-th ona-th-sortable" @click="setSort('progress_pct')">
              Overall Progress <span class="sort-arrow">{{ sortCol === 'progress_pct' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th class="ona-th">Tasks Completed</th>
            <th class="ona-th">Overdue Items</th>
            <th class="ona-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="i in 5" :key="i"><td colspan="8" class="ona-td"><div class="ona-skeleton"></div></td></tr>
          </template>
          <template v-else-if="sortedEmployees.length === 0">
            <tr><td colspan="8" class="ona-td ona-empty-row">
              <div class="ona-empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <p>No employees currently onboarding</p>
                <span>Employees appear here after being promoted from Pre-Hire.</span>
              </div>
            </td></tr>
          </template>
          <tr
            v-else
            v-for="e in sortedEmployees"
            :key="e.id"
            class="ona-tr"
            @click="goToProfile(e)"
          >
            <td class="ona-td">
              <div class="ona-emp-cell">
                <div class="ona-avatar" :style="avatarStyle(e)">{{ initials(e) }}</div>
                <div>
                  <div class="ona-emp-name">{{ fullName(e) }}</div>
                  <div class="ona-emp-email">{{ e.work_email || e.personal_email || e.email }}</div>
                </div>
              </div>
            </td>
            <td class="ona-td ona-td-muted">{{ e.job_title || '—' }}</td>
            <td class="ona-td ona-td-muted">{{ fmtDate(e.hired_at) }}</td>
            <td class="ona-td ona-td-muted">{{ fmtDate(e.created_at) }}</td>
            <td class="ona-td">
              <div v-if="e.progress_pct === 100" class="ona-complete-row">
                <div class="ona-progress-bar-wrap">
                  <div class="ona-progress-bar-fill ona-progress-bar-complete" style="width:100%"></div>
                </div>
                <span class="ona-complete-badge">Completed</span>
              </div>
              <div v-else class="ona-progress-cell">
                <span class="ona-progress-pct">{{ e.progress_pct }}%</span>
                <div class="ona-progress-bar-wrap">
                  <div class="ona-progress-bar-fill" :style="{ width: e.progress_pct + '%' }"></div>
                </div>
              </div>
            </td>
            <td class="ona-td">
              <span class="ona-tasks-badge">{{ e.task_completed }} of {{ e.task_total }}</span>
            </td>
            <td class="ona-td">
              <span v-if="e.overdue_count > 0" class="ona-overdue-badge">{{ e.overdue_count }}</span>
              <span v-else class="ona-td-muted">0</span>
            </td>
            <td class="ona-td" @click.stop>
              <div class="ona-actions-wrap">
                <button class="ona-action-btn" @click.stop="toggleMenu(e.id)">⋮</button>
                <div v-if="openMenu === e.id" class="ona-action-menu" @mouseleave="openMenu = null">
                  <button class="ona-action-item" @click="goToProfile(e); openMenu = null">View profile</button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();

// ── Agency chooser ────────────────────────────────────────────────────────────
const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || []).filter(Boolean);
});
const canChooseAgency = computed(() => agencyChoices.value.length > 1);
const selectedAgencyId = ref(String(agencyStore.currentAgencyId || agencyChoices.value[0]?.id || ''));

// ── Routes ────────────────────────────────────────────────────────────────────
const slug = computed(() => route.params.organizationSlug || '');
const applicantsRoute = computed(() => slug.value ? `/${slug.value}/admin/hiring/candidates` : '/admin/hiring/candidates');
const preHireRoute = computed(() => slug.value ? `/${slug.value}/admin/pre-hire` : '/admin/pre-hire');
const userProfileRoute = (id) => slug.value ? `/${slug.value}/admin/users/${id}` : `/admin/users/${id}`;

const goToProfile = (e) => router.push(userProfileRoute(e.id));

// ── State ─────────────────────────────────────────────────────────────────────
const employees = ref([]);
const loading = ref(false);
const error = ref('');
const q = ref('');
const progressFilter = ref('');
const sortCol = ref('hired_at');
const sortDir = ref('desc');
const openMenu = ref(null);

// ── Load ──────────────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const params = selectedAgencyId.value ? { agencyId: selectedAgencyId.value } : {};
    const { data } = await api.get('/hiring/onboarding-candidates', { params });
    employees.value = data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load employees.';
  } finally {
    loading.value = false;
  }
};

// ── Computed ──────────────────────────────────────────────────────────────────
const completedCount = computed(() => employees.value.filter((e) => e.progress_pct === 100).length);
const totalOverdue = computed(() => employees.value.reduce((sum, e) => sum + (e.overdue_count || 0), 0));

const filteredEmployees = computed(() => {
  let list = employees.value;
  if (q.value.trim()) {
    const lq = q.value.toLowerCase();
    list = list.filter((e) =>
      fullName(e).toLowerCase().includes(lq) ||
      (e.work_email || e.personal_email || e.email || '').toLowerCase().includes(lq) ||
      (e.job_title || '').toLowerCase().includes(lq)
    );
  }
  if (progressFilter.value === 'completed') list = list.filter((e) => e.progress_pct === 100);
  else if (progressFilter.value === 'in_progress') list = list.filter((e) => e.progress_pct < 100);
  else if (progressFilter.value === 'overdue') list = list.filter((e) => e.overdue_count > 0);
  return list;
});

const sortedEmployees = computed(() => {
  const list = [...filteredEmployees.value];
  list.sort((a, b) => {
    let av, bv;
    if (sortCol.value === 'name') { av = fullName(a); bv = fullName(b); }
    else if (sortCol.value === 'progress_pct') { av = a.progress_pct; bv = b.progress_pct; }
    else if (sortCol.value === 'created_at') { av = a.created_at || ''; bv = b.created_at || ''; }
    else { av = a.hired_at || a.created_at || ''; bv = b.hired_at || b.created_at || ''; }
    if (av < bv) return sortDir.value === 'asc' ? -1 : 1;
    if (av > bv) return sortDir.value === 'asc' ? 1 : -1;
    return 0;
  });
  return list;
});

const setSort = (col) => {
  if (sortCol.value === col) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortCol.value = col; sortDir.value = 'asc'; }
};

const toggleMenu = (id) => { openMenu.value = openMenu.value === id ? null : id; };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';
const initials = (u) => ((u.first_name || '').charAt(0) + (u.last_name || '').charAt(0)).toUpperCase() || '?';
const AVATAR_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
const avatarStyle = (u) => ({ background: AVATAR_COLORS[(u.id || 0) % AVATAR_COLORS.length], color: 'white' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

watch(selectedAgencyId, () => load());
onMounted(load);
</script>

<style scoped>
.ona-root { padding: 24px; font-family: inherit; min-height: 100vh; background: #f9fafb; }

.ona-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 16px; flex-wrap: wrap; }
.ona-title { font-size: 28px; font-weight: 800; color: #111827; margin: 0; }
.ona-subtitle { font-size: 13px; color: #6b7280; margin: 4px 0 0; }
.ona-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ona-agency-label { font-size: 12px; color: #6b7280; }
.ona-agency-picker { display: flex; align-items: center; gap: 6px; }

.ona-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s; white-space: nowrap; text-decoration: none; }
.ona-btn-primary { background: #111827; color: white; }
.ona-btn-secondary { background: white; color: #374151; border: 1px solid #e5e7eb; }
.ona-btn-secondary:hover { background: #f9fafb; }
.ona-btn-active { cursor: default; opacity: 0.8; }
.ona-btn-sm { padding: 6px 12px; font-size: 12px; }
.ona-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.ona-stats { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.ona-stat-card { display: flex; align-items: center; gap: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 18px; flex: 1 1 140px; }
.ona-stat-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ona-stat-icon-green { background: #f0fdf4; color: #16a34a; }
.ona-stat-icon-indigo { background: #eef2ff; color: #4338ca; }
.ona-stat-icon-red { background: #fef2f2; color: #dc2626; }
.ona-stat-icon-gray { background: #f9fafb; color: #6b7280; }
.ona-stat-count { font-size: 22px; font-weight: 800; color: #111827; }
.ona-stat-label { font-size: 12px; color: #6b7280; margin-top: 1px; }

.ona-error { background: #fee2e2; color: #991b1b; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; }

.ona-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.ona-search-wrap { position: relative; flex: 1; min-width: 200px; }
.ona-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; }
.ona-input { width: 100%; padding: 7px 10px 7px 30px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: white; box-sizing: border-box; }
.ona-select { border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 10px; font-size: 13px; background: white; color: #374151; }
.ona-select-sm { font-size: 12px; padding: 6px 10px; }

.ona-table-section { background: white; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.ona-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ona-th { padding: 11px 14px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; background: #f9fafb; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
.ona-th-sortable { cursor: pointer; user-select: none; }
.ona-th-sortable:hover { color: #111827; }
.sort-arrow { color: #9ca3af; }
.ona-tr { cursor: pointer; transition: background 0.1s; }
.ona-tr:hover { background: #f9fafb; }
.ona-td { padding: 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
.ona-td-muted { color: #6b7280; }
.ona-empty-row { text-align: center; padding: 48px 14px; }
.ona-empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #9ca3af; }
.ona-empty-state p { font-size: 14px; font-weight: 600; margin: 0; }
.ona-empty-state span { font-size: 12px; }
.ona-skeleton { height: 20px; background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%); background-size: 200%; border-radius: 4px; animation: shimmer 1.4s infinite; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.ona-emp-cell { display: flex; align-items: center; gap: 10px; }
.ona-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.ona-emp-name { font-weight: 600; color: #111827; }
.ona-emp-email { font-size: 11px; color: #6b7280; margin-top: 1px; }

.ona-progress-cell { display: flex; align-items: center; gap: 8px; }
.ona-progress-pct { font-size: 13px; font-weight: 700; color: #111827; width: 36px; }
.ona-complete-row { display: flex; align-items: center; gap: 8px; }
.ona-progress-bar-wrap { flex: 1; height: 8px; background: #f3f4f6; border-radius: 99px; overflow: hidden; min-width: 60px; }
.ona-progress-bar-fill { height: 100%; background: #22c55e; border-radius: 99px; transition: width 0.3s; }
.ona-progress-bar-complete { background: #22c55e; }
.ona-complete-badge { font-size: 11px; font-weight: 700; background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
.ona-tasks-badge { font-size: 12px; color: #374151; background: #f3f4f6; padding: 3px 8px; border-radius: 20px; }
.ona-overdue-badge { font-size: 12px; font-weight: 700; background: #fef2f2; color: #dc2626; padding: 3px 8px; border-radius: 20px; }

.ona-actions-wrap { position: relative; }
.ona-action-btn { background: transparent; border: none; cursor: pointer; font-size: 18px; color: #6b7280; padding: 4px 8px; border-radius: 4px; }
.ona-action-btn:hover { background: #f3f4f6; }
.ona-action-menu { position: absolute; right: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); z-index: 100; min-width: 140px; padding: 4px 0; }
.ona-action-item { display: block; width: 100%; text-align: left; padding: 8px 14px; font-size: 13px; background: transparent; border: none; cursor: pointer; color: #374151; }
.ona-action-item:hover { background: #f9fafb; }
</style>
