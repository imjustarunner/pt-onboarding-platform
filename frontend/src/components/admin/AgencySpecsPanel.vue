<template>
  <div class="agency-specs">
    <div class="panel-header">
      <div class="title">
        <h2>{{ title }}</h2>
        <p class="sub">At-a-glance operational metrics for this organization.</p>
      </div>

      <div v-if="showSelector" class="selector">
        <label>Organization</label>
        <select v-model.number="localOrgId">
          <option v-for="o in organizations" :key="o.id" :value="o.id">
            {{ o.name }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading overview…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="grid">
      <div class="metric">
        <div class="k">Recent Total Payroll</div>
        <div class="v">{{ payrollDisplay }}</div>
        <div class="hint" v-if="stats?.recentPayrollPeriod">
          {{ stats.recentPayrollPeriod.label || formatPeriod(stats.recentPayrollPeriod) }}
        </div>
        <div class="hint" v-else>—</div>
      </div>

      <div class="metric">
        <div class="k">Active Undone Checklist Items</div>
        <div class="v">{{ number(stats?.undoneChecklistItemsActive) }}</div>
        <div class="hint">Across active employees</div>
      </div>

      <div class="metric">
        <div class="k">Pending Employees</div>
        <div class="v">{{ number(stats?.pendingEmployees) }}</div>
        <div class="hint">Non-active, non-archived</div>
      </div>

      <div class="metric">
        <div class="k">Active Employees</div>
        <div class="v">{{ number(stats?.activeEmployees) }}</div>
        <div class="hint">Status: ACTIVE_EMPLOYEE</div>
      </div>

      <div class="metric">
        <div class="k">Unread Notifications</div>
        <div class="v">{{ number(stats?.unreadNotifications) }}</div>
        <div class="hint">Muted notifications excluded</div>
      </div>
    </div>

    <div class="footer">
      <div class="meta">
        <span v-if="stats?.refreshedAt">Updated {{ formatDateTime(stats.refreshedAt) }}</span>
      </div>
      <div class="links">
        <router-link class="link" :to="orgTo('/admin/payroll')">Payroll</router-link>
        <router-link class="link" :to="orgTo('/admin/users')">Users</router-link>
        <router-link class="link" :to="orgTo('/admin/checklist-items')">Checklist Items</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  title: { type: String, default: 'Agency Specs' },
  organizationId: { type: Number, default: null },
  organizations: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:organizationId']);

const route = useRoute();

const localOrgId = computed({
  get() {
    return props.organizationId;
  },
  set(v) {
    emit('update:organizationId', v);
  }
});

const showSelector = computed(() => Array.isArray(props.organizations) && props.organizations.length > 1);

const loading = ref(false);
const error = ref('');
const stats = ref(null);

const number = (v) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toLocaleString() : '0';
};

const currency = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
};

const payrollDisplay = computed(() => {
  if (!stats.value) return '—';
  if (!stats.value.recentPayrollPeriod) return '—';
  return currency(stats.value.recentPayrollTotal);
});

const formatPeriod = (p) => {
  if (!p) return '';
  const start = String(p.period_start || '').slice(0, 10);
  const end = String(p.period_end || '').slice(0, 10);
  if (!start && !end) return '';
  return `${start} → ${end}`;
};

const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
};

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const fetchSpecs = async () => {
  const id = props.organizationId;
  if (!id) {
    stats.value = null;
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/dashboard/agency-specs', { params: { agencyId: id } });
    stats.value = resp.data || null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load agency specs';
    stats.value = null;
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.organizationId,
  () => {
    fetchSpecs();
  },
  { immediate: true }
);
</script>

<style scoped>
.agency-specs {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.title h2 {
  margin: 0;
  color: var(--text-primary);
}

.sub {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 240px;
}

.selector label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.selector select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.loading {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
}

.error {
  text-align: center;
  padding: 14px;
  color: #dc3545;
  background: #f8d7da;
  border-radius: 10px;
  border: 1px solid #f5c6cb;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.metric {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-alt);
}

.k {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  font-weight: 800;
  margin-bottom: 8px;
}

.v {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
}

.hint {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.link {
  text-decoration: none;
  color: var(--primary);
  font-weight: 700;
  font-size: 13px;
}

.link:hover {
  text-decoration: underline;
}
</style>

