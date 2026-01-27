<template>
  <div class="wrap">
    <div class="header">
      <div>
        <h2 style="margin: 0;">Payroll Schedule</h2>
        <div class="hint">Configure how pay periods are generated/detected for this agency.</div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" type="button" @click="syncFutureDrafts" :disabled="saving || syncing || !agencyId">
          {{ syncing ? 'Syncing…' : 'Sync future drafts' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="cleanupFuture" :disabled="saving || syncing || cleaning || !agencyId">
          {{ cleaning ? 'Cleaning…' : 'Reset empty future “ran”' }}
        </button>
      </div>
    </div>

    <div v-if="!agencyId" class="empty">Select an agency first.</div>

    <div v-else class="card">
      <div v-if="error" class="warn">{{ error }}</div>
      <div v-if="loading" class="muted">Loading…</div>

      <div v-else>
        <div class="grid">
          <div class="field">
            <label>Schedule type</label>
            <select v-model="draft.scheduleType">
              <option value="biweekly">Biweekly (anchor end date)</option>
              <option value="semi_monthly">Semi-monthly (two end days)</option>
            </select>
          </div>

          <div class="field">
            <label>Keep future drafts</label>
            <input v-model.number="draft.futureDraftCount" type="number" min="1" max="60" />
            <div class="hint">We’ll ensure at least this many future pay periods exist as drafts.</div>
          </div>
        </div>

        <div v-if="draft.scheduleType === 'biweekly'" class="field" style="margin-top: 12px;">
          <label>Biweekly anchor period end</label>
          <input v-model="draft.biweeklyAnchorPeriodEnd" type="date" />
          <div class="hint">Pick a known correct pay period end date. Future periods advance every 14 days.</div>
        </div>

        <div v-else class="grid" style="margin-top: 12px;">
          <div class="field">
            <label>Semi-monthly end day #1</label>
            <input v-model.number="draft.semiMonthlyDay1" type="number" min="1" max="31" />
          </div>
          <div class="field">
            <label>Semi-monthly end day #2</label>
            <input v-model.number="draft.semiMonthlyDay2" type="number" min="1" max="31" />
            <div class="hint">If a day doesn’t exist in a month, we clamp to the last day.</div>
          </div>
        </div>

        <div class="actions" style="margin-top: 14px;">
          <button class="btn btn-primary" type="button" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save schedule' }}
          </button>
        </div>

        <div class="card" style="margin-top: 14px;">
          <div class="hint" style="font-weight: 700;">What this fixes</div>
          <ul class="hint" style="margin-top: 6px;">
            <li>Stops auto-detect/import from matching “interim” (off-schedule) periods.</li>
            <li>Keeps at least N future draft pay periods so reimbursements/adjustments can be saved into the future.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const loading = ref(false);
const saving = ref(false);
const syncing = ref(false);
const cleaning = ref(false);
const error = ref('');

const draft = ref({
  scheduleType: 'biweekly',
  biweeklyAnchorPeriodEnd: '',
  semiMonthlyDay1: 15,
  semiMonthlyDay2: 30,
  futureDraftCount: 6
});

const load = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/payroll/schedule-settings', { params: { agencyId: agencyId.value } });
    const row = resp.data || null;
    if (!row) return;
    draft.value = {
      scheduleType: String(row.schedule_type || 'biweekly'),
      biweeklyAnchorPeriodEnd: row.biweekly_anchor_period_end ? String(row.biweekly_anchor_period_end).slice(0, 10) : '',
      semiMonthlyDay1: Number(row.semi_monthly_day1 || 15),
      semiMonthlyDay2: Number(row.semi_monthly_day2 || 30),
      futureDraftCount: Number(row.future_draft_count || 6)
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll schedule settings';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  if (!agencyId.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.put('/payroll/schedule-settings', {
      agencyId: agencyId.value,
      scheduleType: draft.value.scheduleType,
      biweeklyAnchorPeriodEnd: draft.value.biweeklyAnchorPeriodEnd || null,
      semiMonthlyDay1: Number(draft.value.semiMonthlyDay1 || 15),
      semiMonthlyDay2: Number(draft.value.semiMonthlyDay2 || 30),
      futureDraftCount: Number(draft.value.futureDraftCount || 6)
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save payroll schedule';
  } finally {
    saving.value = false;
  }
};

const syncFutureDrafts = async () => {
  if (!agencyId.value) return;
  try {
    syncing.value = true;
    error.value = '';
    // Uses schedule-based generation when schedule settings exist.
    await api.post('/payroll/periods/ensure-future', { agencyId: agencyId.value, minFutureDrafts: Number(draft.value.futureDraftCount || 6) });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to sync future drafts';
  } finally {
    syncing.value = false;
  }
};

const cleanupFuture = async () => {
  if (!agencyId.value) return;
  try {
    cleaning.value = true;
    error.value = '';
    await api.post('/payroll/periods/cleanup-future', { agencyId: agencyId.value });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to cleanup future periods';
  } finally {
    cleaning.value = false;
  }
};

watch(agencyId, async () => {
  await load();
}, { immediate: true });
</script>

<style scoped>
.wrap {
  padding: 16px;
}
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.hint {
  color: var(--text-secondary);
  font-size: 13px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: white;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.field input, .field select, .field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.warn {
  background: rgba(220, 53, 69, 0.08);
  border: 1px solid rgba(220, 53, 69, 0.25);
  padding: 10px 12px;
  border-radius: 10px;
  color: #b02a37;
  margin-bottom: 10px;
}
.empty, .muted {
  color: var(--text-secondary);
  padding: 10px 0;
}
</style>

