<template>
  <div class="pcp">
    <div class="pcp-toolbar">
      <div class="pcp-filters" role="tablist" aria-label="Compliance view">
        <button
          v-for="opt in filterOptions"
          :key="opt.value"
          type="button"
          class="pcp-filter"
          :class="{ active: filterMode === opt.value }"
          @click="filterMode = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="pcp-actions">
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reload">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="loading || sendingAll || !providersWithContent.length"
          @click="sendAll"
        >
          {{ sendingAll ? 'Sending…' : 'Send all with remaining items' }}
        </button>
      </div>
    </div>

    <div v-if="!unlocked" class="pcp-locked">
      Compliance unlocks when the payroll processor selects pay period
      <strong>2026-08-15 → 2026-08-28</strong>. After that, this step stays available for later periods.
    </div>

    <div v-else-if="error" class="pcp-error">{{ error }}</div>
    <div v-else-if="loading" class="pcp-muted">Loading compliance digest…</div>
    <div v-else-if="!filteredProviders.length" class="pcp-muted">
      No outstanding late notes or session-limit items for this view.
    </div>

    <div v-else class="pcp-list">
      <article
        v-for="p in filteredProviders"
        :key="p.userId"
        class="pcp-person"
      >
        <header class="pcp-person-head">
          <div>
            <h3 class="pcp-person-name">{{ p.name }}</h3>
            <div class="pcp-person-meta">
              <span v-if="p.email">{{ p.email }}</span>
              <span v-if="p.supervisors?.length">
                · Supervisor CC:
                {{ p.supervisors.map((s) => s.name || s.email).join(', ') }}
              </span>
            </div>
          </div>
          <div class="pcp-person-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="previewOne(p)">
              Preview email
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="sendingUserId === p.userId || !providerHasSendable(p)"
              @click="sendOne(p)"
            >
              {{ sendingUserId === p.userId ? 'Sending…' : 'Send email' }}
            </button>
          </div>
        </header>

        <section
          v-if="showLateNotes && (p.lateNotesByPeriod || []).length"
          class="pcp-section"
        >
          <h4 class="pcp-section-title">Late notes</h4>
          <div
            v-for="group in p.lateNotesByPeriod"
            :key="group.payrollPeriodId"
            class="pcp-period"
          >
            <div class="pcp-period-label">{{ group.periodLabel }}</div>
            <label
              v-for="row in group.rows"
              :key="row.id"
              class="pcp-row"
            >
              <input
                type="checkbox"
                :checked="!isRowExcluded(p.userId, row.id)"
                @change="toggleRow(p.userId, row.id, $event.target.checked)"
              />
              <span>{{ row.label }}</span>
            </label>
          </div>
        </section>

        <section
          v-if="showSessionLimits && (p.sessionLimits || []).length"
          class="pcp-section"
        >
          <h4 class="pcp-section-title">Session limits</h4>
          <label
            v-for="item in p.sessionLimits"
            :key="item.id"
            class="pcp-row pcp-row--session"
            :class="{ muted: item.muted || isClientExcluded(p.userId, item) }"
          >
            <input
              type="checkbox"
              :checked="!item.muted && !isClientExcluded(p.userId, item)"
              @change="toggleClient(p, item, $event.target.checked)"
            />
            <span>
              <strong>{{ item.clientLabel }}</strong>
              — {{ item.total }} services (threshold {{ item.threshold }})
              <span v-if="item.muted" class="pcp-pill">muted</span>
            </span>
          </label>
        </section>
      </article>
    </div>

    <div v-if="previewOpen" class="pcp-modal-backdrop" @click.self="previewOpen = false">
      <div class="pcp-modal" role="dialog" aria-modal="true">
        <header class="pcp-modal-head">
          <h3>Email preview — {{ preview?.provider?.name }}</h3>
          <button type="button" class="btn btn-secondary btn-sm" @click="previewOpen = false">Close</button>
        </header>
        <div v-if="previewLoading" class="pcp-muted">Building preview…</div>
        <div v-else-if="previewError" class="pcp-error">{{ previewError }}</div>
        <template v-else-if="preview">
          <div class="pcp-preview-meta">
            <div><strong>To:</strong> {{ preview.provider?.email || '—' }}</div>
            <div v-if="preview.provider?.supervisors?.length">
              <strong>Cc:</strong>
              {{ preview.provider.supervisors.map((s) => s.email).filter(Boolean).join(', ') }}
            </div>
            <div><strong>Subject:</strong> {{ preview.subject || '(empty)' }}</div>
          </div>
          <pre class="pcp-preview-body">{{ preview.text || '(Nothing selected — email would not send.)' }}</pre>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  periodId: { type: [Number, String], required: true },
  /** Persisted wizard deselections: { [userId]: { excludedRowIds: number[], excludedClientKeys: string[] } } */
  exclusionsByUser: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:exclusionsByUser', 'unlocked']);

const loading = ref(false);
const error = ref('');
const unlocked = ref(false);
const providers = ref([]);
const filterMode = ref('all'); // all | late_notes | session_limits
const sendingUserId = ref(null);
const sendingAll = ref(false);

const previewOpen = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const preview = ref(null);

const filterOptions = [
  { value: 'all', label: 'All compliance' },
  { value: 'late_notes', label: 'Late notes' },
  { value: 'session_limits', label: 'Session limits' }
];

const showLateNotes = computed(() => filterMode.value === 'all' || filterMode.value === 'late_notes');
const showSessionLimits = computed(() => filterMode.value === 'all' || filterMode.value === 'session_limits');

const exclusions = computed(() => props.exclusionsByUser || {});

function ensureUserExclusions(userId) {
  const key = String(userId);
  const cur = { ...(exclusions.value[key] || {}) };
  return {
    excludedRowIds: [...(cur.excludedRowIds || [])],
    excludedClientKeys: [...(cur.excludedClientKeys || [])]
  };
}

function writeUserExclusions(userId, next) {
  const key = String(userId);
  const out = { ...exclusions.value, [key]: next };
  emit('update:exclusionsByUser', out);
}

function isRowExcluded(userId, rowId) {
  const ex = ensureUserExclusions(userId);
  return ex.excludedRowIds.map(Number).includes(Number(rowId));
}

function isClientExcluded(userId, item) {
  const ex = ensureUserExclusions(userId);
  const key = `${item.providerUserId}:${item.clientId}`;
  return ex.excludedClientKeys.includes(key) || ex.excludedClientKeys.includes(String(item.clientId));
}

function toggleRow(userId, rowId, checked) {
  const next = ensureUserExclusions(userId);
  const id = Number(rowId);
  next.excludedRowIds = next.excludedRowIds.map(Number).filter((x) => x !== id);
  if (!checked) next.excludedRowIds.push(id);
  writeUserExclusions(userId, next);
}

async function toggleClient(provider, item, checked) {
  const key = `${item.providerUserId}:${item.clientId}`;
  const next = ensureUserExclusions(provider.userId);
  next.excludedClientKeys = next.excludedClientKeys.filter((k) => k !== key && k !== String(item.clientId));
  if (!checked) next.excludedClientKeys.push(key);
  writeUserExclusions(provider.userId, next);

  // Persist mute when unchecking (spoken-to / disable notification)
  try {
    await api.put('/payroll/compliance/session-mute', {
      agencyId: props.agencyId,
      providerUserId: item.providerUserId,
      clientId: item.clientId,
      muted: !checked
    });
    item.muted = !checked;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update mute';
  }
}

const filteredProviders = computed(() => {
  return (providers.value || []).filter((p) => {
    const hasLate = showLateNotes.value && (p.lateNotesByPeriod || []).some((g) => (g.rows || []).length);
    const hasSession = showSessionLimits.value && (p.sessionLimits || []).length;
    return hasLate || hasSession;
  });
});

function providerHasSendable(p) {
  if (showLateNotes.value) {
    for (const g of p.lateNotesByPeriod || []) {
      for (const r of g.rows || []) {
        if (!isRowExcluded(p.userId, r.id)) return true;
      }
    }
  }
  if (showSessionLimits.value) {
    for (const item of p.sessionLimits || []) {
      if (!item.muted && !isClientExcluded(p.userId, item)) return true;
    }
  }
  return false;
}

const providersWithContent = computed(() =>
  filteredProviders.value.filter((p) => providerHasSendable(p))
);

async function reload() {
  if (!props.agencyId || !props.periodId) return;
  loading.value = true;
  error.value = '';
  try {
    await api.post(`/payroll/periods/${props.periodId}/compliance-unlock-check`);
    const resp = await api.get(`/payroll/periods/${props.periodId}/compliance-digest`);
    unlocked.value = !!resp.data?.unlocked;
    providers.value = resp.data?.providers || [];
    emit('unlocked', unlocked.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load compliance';
    providers.value = [];
  } finally {
    loading.value = false;
  }
}

function payloadFor(p) {
  const ex = ensureUserExclusions(p.userId);
  return {
    userId: p.userId,
    excludedRowIds: ex.excludedRowIds,
    excludedClientKeys: ex.excludedClientKeys,
    includeLateNotes: showLateNotes.value,
    includeSessionLimits: showSessionLimits.value
  };
}

async function previewOne(p) {
  previewOpen.value = true;
  previewLoading.value = true;
  previewError.value = '';
  preview.value = null;
  try {
    const resp = await api.post(`/payroll/periods/${props.periodId}/compliance-preview`, payloadFor(p));
    preview.value = resp.data;
  } catch (e) {
    previewError.value = e?.response?.data?.error?.message || e?.message || 'Preview failed';
  } finally {
    previewLoading.value = false;
  }
}

async function sendOne(p) {
  if (!providerHasSendable(p)) return;
  sendingUserId.value = p.userId;
  error.value = '';
  try {
    await api.post(`/payroll/periods/${props.periodId}/compliance-send`, payloadFor(p));
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Send failed';
  } finally {
    sendingUserId.value = null;
  }
}

async function sendAll() {
  sendingAll.value = true;
  error.value = '';
  try {
    await api.post(`/payroll/periods/${props.periodId}/compliance-send-all`, {
      exclusionsByUser: exclusions.value,
      includeLateNotes: showLateNotes.value,
      includeSessionLimits: showSessionLimits.value
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Send all failed';
  } finally {
    sendingAll.value = false;
  }
}

watch(
  () => [props.agencyId, props.periodId],
  () => {
    reload();
  },
  { immediate: true }
);

defineExpose({ reload });
</script>

<style scoped>
.pcp {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pcp-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
}
.pcp-filters {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pcp-filter {
  border: 1px solid #c8e6c9;
  background: #fff;
  color: #1e3a34;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.pcp-filter.active {
  background: #1e3a34;
  border-color: #1e3a34;
  color: #fff;
}
.pcp-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pcp-locked,
.pcp-error,
.pcp-muted {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
}
.pcp-error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.pcp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pcp-person {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 14px 16px;
}
.pcp-person-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-start;
  margin-bottom: 10px;
}
.pcp-person-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
  background: linear-gradient(90deg, rgba(59, 193, 197, 0.18), transparent);
  padding: 2px 8px;
  border-radius: 6px;
  display: inline-block;
}
.pcp-person-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}
.pcp-person-actions {
  display: flex;
  gap: 8px;
}
.pcp-section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #eef2f7;
}
.pcp-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 800;
  color: #1e3a34;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pcp-period {
  margin-bottom: 10px;
}
.pcp-period-label {
  font-weight: 700;
  font-size: 13px;
  color: #334155;
  margin-bottom: 4px;
}
.pcp-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 4px 0;
  font-size: 14px;
  color: #1e293b;
  cursor: pointer;
}
.pcp-row.muted {
  opacity: 0.55;
}
.pcp-pill {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 800;
  padding: 1px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
}
.pcp-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.pcp-modal {
  background: #fff;
  border-radius: 14px;
  max-width: 720px;
  width: 100%;
  max-height: 85vh;
  overflow: auto;
  padding: 16px 18px 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.pcp-modal-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.pcp-modal-head h3 {
  margin: 0;
  font-size: 1.1rem;
}
.pcp-preview-meta {
  font-size: 13px;
  color: #334155;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pcp-preview-body {
  white-space: pre-wrap;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}
.btn {
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-primary {
  background: #1e3a34;
  color: #fff;
}
.btn-secondary {
  background: #fff;
  border-color: #cbd5e1;
  color: #1e293b;
}
.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
}
</style>
