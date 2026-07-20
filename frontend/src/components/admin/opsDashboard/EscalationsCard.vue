<template>
  <article class="panel escalations-card" aria-label="Escalations">
    <div class="panel-header">
      <h2>Escalations</h2>
      <button type="button" class="link-btn" @click="$emit('navigate', deskPath)">Open desk</button>
    </div>
    <p class="panel-blurb">
      Raise leadership issues with issue, root cause, and recommended resolution — tracked and assignable.
    </p>

    <div class="esc-split">
      <form class="quick-form" @submit.prevent="submit">
        <label class="field">
          <span>Issue</span>
          <textarea v-model="issue" rows="2" maxlength="4000" placeholder="What happened?" required />
        </label>
        <div class="row-2">
          <label class="field">
            <span>Root cause (optional)</span>
            <input v-model="rootCause" type="text" maxlength="500" placeholder="Why / contributing factors" />
          </label>
          <label class="field">
            <span>Recommended resolution</span>
            <input v-model="recommended" type="text" maxlength="500" placeholder="How should this be addressed?" required />
          </label>
        </div>
        <div class="row-3">
          <label class="field">
            <span>Priority</span>
            <select v-model="priority">
              <option v-for="p in priorities" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>Department</span>
            <input v-model="department" type="text" maxlength="120" placeholder="e.g. Payroll" />
          </label>
          <label class="check">
            <input v-model="immediate" type="checkbox" />
            <span>Immediate action</span>
          </label>
        </div>
        <div class="actions">
          <button type="submit" class="mini-btn primary" :disabled="sending || !issue.trim() || !recommended.trim() || !agencyId">
            {{ sending ? 'Submitting…' : 'Submit escalation' }}
          </button>
          <span v-if="flash" class="flash" :class="flashTone">{{ flash }}</span>
        </div>
      </form>

      <div class="esc-side">
        <div class="list-head">
          <strong>Open escalations</strong>
          <span class="muted">{{ counts.open || items.length || 0 }} open</span>
        </div>
        <div v-if="loading" class="empty">Loading…</div>
        <div v-else-if="error" class="empty error">{{ error }}</div>
        <ul v-else-if="items.length" class="esc-list">
          <li v-for="e in items" :key="e.id">
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
              <i class="prio" :class="e.priority">{{ e.priority }}</i>
            </button>
          </li>
        </ul>
        <div v-else class="empty-state">
          <p class="empty">No open escalations yet.</p>
          <p class="empty-hint">Submitted items from admin, support, or superadmin appear here beside the form.</p>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import { ESCALATION_PRIORITIES, escalationStatusLabel } from '../../../utils/orgEscalations';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  deskPath: { type: String, default: '/admin/escalations' }
});

defineEmits(['navigate']);

const priorities = ESCALATION_PRIORITIES;
const issue = ref('');
const rootCause = ref('');
const recommended = ref('');
const department = ref('');
const priority = ref('medium');
const immediate = ref(false);
const sending = ref(false);
const flash = ref('');
const flashTone = ref('ok');
const loading = ref(true);
const error = ref('');
const items = ref([]);
const counts = ref({ open: 0 });

const statusLabel = escalationStatusLabel;

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
        immediateActionRequired: immediate.value
      },
      { skipGlobalLoading: true }
    );
    issue.value = '';
    rootCause.value = '';
    recommended.value = '';
    department.value = '';
    immediate.value = false;
    priority.value = 'medium';
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

watch(agencyNum, () => loadList());
onMounted(loadList);
</script>

<style scoped>
.escalations-card {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 220px;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-header h2 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
}
.link-btn {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.link-btn:hover { text-decoration: underline; }
.panel-blurb {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
.esc-split {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.9fr);
  gap: 14px;
  align-items: stretch;
}
.quick-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, #f8fafc);
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 12%, #e2e8f0);
}
.esc-side {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fafbfc;
  min-height: 160px;
  display: flex;
  flex-direction: column;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}
.field input,
.field textarea,
.field select {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
  background: #fff;
  font-family: inherit;
}
.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: end;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  padding-bottom: 6px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.mini-btn {
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 30%, #e2e8f0);
  background: #fff;
  color: var(--ops-primary, #1f6b4a);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.mini-btn.primary {
  background: var(--ops-primary, #1f6b4a);
  color: #fff;
  border-color: transparent;
}
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.flash { font-size: 12px; font-weight: 700; }
.flash.ok { color: #15803d; }
.flash.err { color: #b91c1c; }
.list-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
  font-size: 12px;
}
.list-head strong { color: #0f172a; }
.muted { color: #94a3b8; font-weight: 600; }
.esc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow: auto;
}
.esc-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 4px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  font: inherit;
}
.esc-row:hover { background: #f8fafc; }
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
  font-size: 13px;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.esc-main small {
  font-size: 11px;
  color: #64748b;
}
.prio {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  font-style: normal;
  padding: 2px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}
.prio.high { background: #fee2e2; color: #b91c1c; }
.prio.medium { background: #ffedd5; color: #c2410c; }
.empty {
  font-size: 13px;
  color: #94a3b8;
  padding: 6px 0;
  margin: 0;
}
.empty.error { color: #b91c1c; }
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}
@media (max-width: 900px) {
  .esc-split { grid-template-columns: 1fr; }
}
@media (max-width: 700px) {
  .row-2, .row-3 { grid-template-columns: 1fr; }
}
</style>
