<template>
  <article class="panel ops-board-card escalations-panel" aria-label="Escalations">
    <div class="ops-board-stack">
      <section class="ops-board-main">
        <div class="ops-board-header">
          <div>
            <span class="ops-board-title">Escalations</span>
            <p class="ops-board-legend">
              Raise leadership issues with issue, root cause, and recommended resolution — tracked and assignable.
            </p>
          </div>
          <button type="button" class="ops-board-link" @click="$emit('navigate', deskPath)">Open desk</button>
        </div>

        <form class="ops-board-form" @submit.prevent="submit">
          <label class="ops-board-field">
            <span>Issue</span>
            <textarea v-model="issue" rows="2" maxlength="4000" placeholder="What happened?" required />
          </label>
          <div class="ops-board-form-row-2">
            <label class="ops-board-field">
              <span>Root cause (optional)</span>
              <input v-model="rootCause" type="text" maxlength="500" placeholder="Why / contributing factors" />
            </label>
            <label class="ops-board-field">
              <span>Recommended resolution</span>
              <input v-model="recommended" type="text" maxlength="500" placeholder="How should this be addressed?" required />
            </label>
          </div>
          <div class="ops-board-form-row-3">
            <label class="ops-board-field">
              <span>Priority</span>
              <select v-model="priority">
                <option v-for="p in priorities" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </label>
            <label class="ops-board-field">
              <span>Department</span>
              <input v-model="department" type="text" maxlength="120" placeholder="e.g. Payroll" />
            </label>
            <label v-if="canManage" class="ops-board-field">
              <span>Assign to</span>
              <select v-model="assigneeUserId">
                <option value="">Auto (chain of responsibility)</option>
                <option v-for="u in assignees" :key="u.id" :value="String(u.id)">
                  {{ u.last_name }}, {{ u.first_name }}
                </option>
              </select>
            </label>
            <label class="ops-board-check">
              <input v-model="immediate" type="checkbox" />
              <span>Immediate action</span>
            </label>
          </div>
          <div class="ops-board-actions">
            <button type="submit" class="ops-board-btn primary" :disabled="sending || !issue.trim() || !recommended.trim() || !agencyId">
              {{ sending ? 'Submitting…' : 'Submit escalation' }}
            </button>
            <span v-if="flash" class="flash" :class="flashTone">{{ flash }}</span>
          </div>
        </form>
      </section>

      <aside class="ops-board-side">
        <div class="ops-board-side-head">
          <div>
            <strong>Open escalations</strong>
            <span class="ops-muted">{{ counts.open || items.length || 0 }} open</span>
          </div>
        </div>
        <div v-if="loading" class="ops-board-empty">Loading…</div>
        <div v-else-if="error" class="ops-board-empty error">{{ error }}</div>
        <ul v-else-if="items.length" class="ops-board-list">
          <li v-for="e in items" :key="e.id" class="ops-board-list-row esc-item">
            <button type="button" class="esc-row" @click="$emit('navigate', `${deskPath}?id=${e.id}`)">
              <span class="esc-id">#{{ e.id }}</span>
              <span class="esc-main">
                <strong>{{ e.subject || e.issue || 'Escalation' }}</strong>
                <small>
                  {{ statusLabel(e.escalation_status) }}
                  <template v-if="e.claimed_by_name"> · {{ e.claimed_by_name }}</template>
                  <template v-if="e.immediate_action_required"> · Immediate</template>
                </small>
              </span>
              <i class="ops-board-badge" :class="e.priority">{{ e.priority }}</i>
            </button>
            <select
              v-if="canManage"
              class="esc-assign-inline"
              :value="e.claimed_by_user_id ? String(e.claimed_by_user_id) : ''"
              :disabled="assigningId === e.id"
              :aria-label="`Assign escalation #${e.id}`"
              @click.stop
              @change="assignEscalation(e, $event)"
            >
              <option value="">Unassigned</option>
              <option v-for="u in assignOptionsFor(e)" :key="u.id" :value="String(u.id)">
                {{ u.last_name }}, {{ u.first_name }}
              </option>
            </select>
          </li>
        </ul>
        <div v-else class="empty-state">
          <p class="ops-board-empty">No open escalations yet.</p>
          <p class="empty-hint">Submitted items from admin, support, or superadmin appear here after you submit.</p>
        </div>
      </aside>
    </div>
  </article>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import { ESCALATION_PRIORITIES, escalationStatusLabel } from '../../../utils/orgEscalations';
import '../../../styles/ops-board-card.css';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  deskPath: { type: String, default: '/admin/escalations' }
});

const emit = defineEmits(['navigate', 'assigned']);

const authStore = useAuthStore();
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManage = computed(() => ['admin', 'support', 'super_admin', 'superadmin'].includes(role.value));

const priorities = ESCALATION_PRIORITIES;
const issue = ref('');
const rootCause = ref('');
const recommended = ref('');
const department = ref('');
const priority = ref('medium');
const immediate = ref(false);
const assigneeUserId = ref('');
const sending = ref(false);
const flash = ref('');
const flashTone = ref('ok');
const loading = ref(true);
const error = ref('');
const items = ref([]);
const counts = ref({ open: 0 });
const assignees = ref([]);
const assigningId = ref(null);

const statusLabel = escalationStatusLabel;

const assignOptionsFor = (escalation) => {
  const list = Array.isArray(assignees.value) ? [...assignees.value] : [];
  const ownerId = Number(escalation?.claimed_by_user_id || 0);
  if (ownerId > 0 && !list.some((u) => Number(u.id) === ownerId)) {
    const parts = String(escalation?.claimed_by_name || '').trim().split(/\s+/);
    list.unshift({
      id: ownerId,
      first_name: parts[0] || 'Assigned',
      last_name: parts.slice(1).join(' ') || 'user'
    });
  }
  return list;
};

async function loadAssignees() {
  if (!canManage.value || !agencyNum.value) {
    assignees.value = [];
    return;
  }
  try {
    const res = await api.get('/escalations/assignees', {
      params: { agencyId: agencyNum.value },
      skipGlobalLoading: true
    });
    assignees.value = Array.isArray(res.data?.users) ? res.data.users : [];
  } catch {
    assignees.value = [];
  }
}

async function assignEscalation(escalation, evt) {
  if (!canManage.value || !escalation?.id) return;
  const next = evt?.target?.value ? Number(evt.target.value) : null;
  const prev = escalation.claimed_by_user_id ? Number(escalation.claimed_by_user_id) : null;
  if ((next || null) === (prev || null)) return;

  assigningId.value = escalation.id;
  try {
    const res = await api.post(`/escalations/${escalation.id}/assign`, {
      assigneeUserId: next
    }, { skipGlobalLoading: true });
    const idx = items.value.findIndex((row) => row.id === escalation.id);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], ...res.data };
    emit('assigned', res.data);
    await loadList();
  } catch (e) {
    if (evt?.target) evt.target.value = prev ? String(prev) : '';
    flashTone.value = 'err';
    flash.value = e.response?.data?.error?.message || 'Assign failed';
  } finally {
    assigningId.value = null;
  }
}

const agencyNum = computed(() => {
  const n = Number(props.agencyId);
  return Number.isFinite(n) && n > 0 ? n : null;
});

async function loadList() {
  if (!agencyNum.value) {
    items.value = [];
    loading.value = false;
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/escalations', {
      params: { agencyId: agencyNum.value, openOnly: 1, limit: 8 },
      skipGlobalLoading: true
    });
    items.value = Array.isArray(res.data?.escalations) ? res.data.escalations : [];
    counts.value = res.data?.counts || { open: items.value.length };
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load escalations';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!agencyNum.value || !issue.value.trim() || !recommended.value.trim()) return;
  sending.value = true;
  flash.value = '';
  try {
    await api.post(
      '/escalations',
      {
        agencyId: agencyNum.value,
        issue: issue.value.trim(),
        rootCause: rootCause.value.trim() || undefined,
        recommendedResolution: recommended.value.trim(),
        affectedDepartment: department.value.trim() || undefined,
        priority: priority.value,
        immediateActionRequired: immediate.value,
        ...(canManage.value && assigneeUserId.value
          ? { assigneeUserId: Number(assigneeUserId.value) }
          : {})
      },
      { skipGlobalLoading: true }
    );
    issue.value = '';
    rootCause.value = '';
    recommended.value = '';
    department.value = '';
    immediate.value = false;
    priority.value = 'medium';
    assigneeUserId.value = '';
    flashTone.value = 'ok';
    flash.value = 'Escalation submitted';
    await loadList();
  } catch (e) {
    flashTone.value = 'err';
    flash.value = e.response?.data?.error?.message || 'Submit failed';
  } finally {
    sending.value = false;
  }
}

watch(agencyNum, () => {
  loadList();
  loadAssignees();
});
onMounted(() => {
  loadList();
  loadAssignees();
});
</script>

<style scoped>
.escalations-panel {
  display: flex;
  flex-direction: column;
}
.flash { font-size: 12px; font-weight: 700; }
.flash.ok { color: #15803d; }
.flash.err { color: #b91c1c; }
.esc-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.esc-assign-inline {
  flex: 0 0 min(148px, 34%);
  min-width: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #0f172a;
  background: #fff;
  font-family: inherit;
}
.esc-assign-inline:disabled { opacity: 0.6; }
.esc-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0;
  cursor: pointer;
  font: inherit;
}
.esc-row:hover { opacity: 0.85; }
.esc-id {
  font-size: 11px;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
  min-width: 36px;
}
.esc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.esc-main strong {
  font-size: 12px;
  font-weight: 800;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.esc-main small {
  font-size: 11px;
  color: #64748b;
}
.empty-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}
</style>
