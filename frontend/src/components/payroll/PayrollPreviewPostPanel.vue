<template>
  <div class="ppp">
    <div class="ppp-head">
      <div>
        <div class="ppp-title">Preview Post</div>
        <div class="ppp-hint">
          Read-only provider view of what will go out on Post — totals, notes notices, and notifications.
          Close this panel to stay in the wizard.
        </div>
        <div v-if="periodLabel" class="ppp-period">Period: <strong>{{ periodLabel }}</strong></div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="reload">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="ppp-error">{{ error }}</div>
    <div v-else-if="loading && !summaries.length" class="ppp-muted">Loading run results…</div>
    <div v-else-if="!summaries.length" class="ppp-muted">
      No run results yet for this pay period. Run Payroll first, then come back to preview.
    </div>
    <template v-else>
      <div class="ppp-toolbar">
        <div class="field" style="flex: 1;">
          <label>Provider</label>
          <div class="ppp-provider-row">
            <select v-model="userId" :disabled="loading">
              <option :value="null" disabled>Select a provider…</option>
              <option v-for="s in providerOptions" :key="s.user_id" :value="s.user_id">
                {{ s.last_name }}, {{ s.first_name }}
              </option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="!canPrev" @click="prevUser">Prev</button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="!canNext" @click="nextUser">Next</button>
          </div>
        </div>
      </div>

      <div v-if="!userId" class="ppp-muted">Select a provider.</div>
      <div v-else-if="!summary" class="ppp-muted">No run results found for this provider.</div>
      <div v-else class="ppp-body">
        <div class="ppp-warn" v-if="carryoverNotes > 0">
          <strong>Prior notes included in this payroll:</strong> {{ fmtNum(carryoverNotes) }} notes
        </div>
        <div class="ppp-warn ppp-warn--red" v-if="priorStillUnpaid.totalUnits > 0">
          <div>
            <strong>Still unpaid from the prior pay period:</strong>
            {{ fmtNum(priorStillUnpaid.totalUnits) }} units
          </div>
          <div class="ppp-muted" v-if="priorStillUnpaid.periodStart">
            {{ priorStillUnpaid.periodStart }} → {{ priorStillUnpaid.periodEnd }}
          </div>
        </div>
        <div class="ppp-warn ppp-warn--amber" v-if="unpaidInPeriod.total > 0">
          <div><strong>Unpaid notes in this pay period</strong></div>
          <div>
            <strong>No Note:</strong> {{ fmtNum(unpaidInPeriod.noNote) }}
            <span class="ppp-muted">•</span>
            <strong>Draft:</strong> {{ fmtNum(unpaidInPeriod.draft) }}
          </div>
        </div>

        <div class="ppp-kpis">
          <div><strong>Total Pay:</strong> {{ fmtMoney(summary.total_amount) }}</div>
          <div><strong>Credits/Hours:</strong> {{ fmtNum(summary.total_hours) }}</div>
          <div>
            <strong>Tier Credits:</strong>
            {{ fmtNum(summary.tier_credits_final ?? summary.tier_credits_current) }}
          </div>
        </div>

        <div class="ppp-card" v-if="summary.breakdown?.__tier">
          <div class="ppp-card-title">Benefit Tier</div>
          <div>{{ summary.breakdown.__tier.label }}</div>
          <div class="ppp-muted">Status: {{ summary.breakdown.__tier.status }}</div>
        </div>

        <div class="ppp-card">
          <div class="ppp-card-title">Direct / Indirect</div>
          <div>
            <strong>Direct:</strong>
            {{ fmtNum(summary.direct_hours) }} hrs • {{ fmtMoney(payTotals.directAmount) }}
          </div>
          <div>
            <strong>Indirect:</strong>
            {{ fmtNum(summary.indirect_hours) }} hrs • {{ fmtMoney(payTotals.indirectAmount) }}
          </div>
        </div>

        <div class="ppp-card">
          <div class="ppp-card-title">Service Codes</div>
          <div v-if="!serviceLines.length" class="ppp-muted">No breakdown available.</div>
          <div v-else class="ppp-table-wrap">
            <table class="ppp-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th class="right">No Note</th>
                  <th class="right">Draft</th>
                  <th class="right">Finalized</th>
                  <th class="right">Credits</th>
                  <th class="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in serviceLines" :key="l.code">
                  <td>{{ l.code }}</td>
                  <td class="right muted">{{ fmtNum(l.noNoteUnits) }}</td>
                  <td class="right muted">{{ fmtNum(l.draftUnits) }}</td>
                  <td class="right">{{ fmtNum(l.finalizedUnits ?? l.units) }}</td>
                  <td class="right muted">{{ fmtNum(l.hours ?? l.creditsHours) }}</td>
                  <td class="right">{{ fmtMoney(l.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="ppp-card" v-if="adjustmentLines.length">
          <div class="ppp-card-title">Additional Pay / Overrides</div>
          <div v-for="(l, i) in adjustmentLines" :key="`adj-${i}`" class="ppp-adj-row">
            <div>
              <strong>{{ l.label }}</strong>
              <span class="ppp-muted">{{ l.taxable === false ? ' (non-taxable)' : ' (taxable)' }}</span>
            </div>
            <div class="right">{{ fmtMoney(l.amount) }}</div>
          </div>
        </div>

        <div class="ppp-card">
          <div class="ppp-card-title">Notifications (sent on Post)</div>
          <div v-if="notificationsLoading" class="ppp-muted">Loading notifications…</div>
          <div v-else-if="!notifications.length" class="ppp-muted">No post-time notifications for this provider.</div>
          <div v-else>
            <div v-for="(n, idx) in notifications" :key="`n-${idx}`" class="ppp-note">
              <strong>{{ n.title || n.type }}</strong>
              <div class="ppp-muted">{{ n.message }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  periodId: { type: [Number, String], required: true },
  periodLabel: { type: String, default: '' }
});

const loading = ref(false);
const error = ref('');
const summaries = ref([]);
const userId = ref(null);
const notifications = ref([]);
const notificationsLoading = ref(false);

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const providerOptions = computed(() => {
  const base = (summaries.value || []).slice();
  base.sort((a, b) =>
    String(a?.last_name || '').localeCompare(String(b?.last_name || ''), undefined, { sensitivity: 'base' })
    || String(a?.first_name || '').localeCompare(String(b?.first_name || ''), undefined, { sensitivity: 'base' })
  );
  return base;
});

const userIndex = computed(() =>
  providerOptions.value.findIndex((s) => Number(s.user_id) === Number(userId.value || 0))
);
const canPrev = computed(() => userIndex.value > 0);
const canNext = computed(() => userIndex.value >= 0 && userIndex.value < providerOptions.value.length - 1);

const summary = computed(() => {
  const uid = Number(userId.value || 0);
  if (!uid) return null;
  return (summaries.value || []).find((s) => Number(s.user_id) === uid) || null;
});

const carryoverNotes = computed(() => {
  const b = summary.value?.breakdown || null;
  return Number(b?.__carryover?.carryoverNotesTotal ?? b?.__carryover?.oldDoneNotesNotesTotal ?? 0);
});

const priorStillUnpaid = computed(() => {
  const p = summary.value?.breakdown?.__priorStillUnpaid || null;
  return {
    totalUnits: Number(p?.totalUnits || 0),
    periodStart: String(p?.periodStart || ''),
    periodEnd: String(p?.periodEnd || '')
  };
});

const unpaidInPeriod = computed(() => {
  const c = summary.value?.breakdown?.__unpaidNotesCounts || null;
  const noNote = Number(c?.noNoteNotes || 0);
  const draft = Number(c?.draftNotes || 0);
  return { noNote, draft, total: noNote + draft };
});

const serviceLines = computed(() => {
  const b = summary.value?.breakdown;
  if (!b || typeof b !== 'object') return [];
  return Object.entries(b)
    .filter(([code]) => !String(code).startsWith('_') && !String(code).startsWith('__'))
    .map(([code, v]) => ({ code, ...(v && typeof v === 'object' ? v : {}) }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
});

const adjustmentLines = computed(() => {
  const lines = summary.value?.breakdown?.__adjustments?.lines;
  return Array.isArray(lines) ? lines : [];
});

const payTotals = computed(() => {
  const out = { directAmount: 0, indirectAmount: 0 };
  const b = summary.value?.breakdown;
  if (!b || typeof b !== 'object') return out;
  for (const [code, v] of Object.entries(b)) {
    if (String(code).startsWith('_')) continue;
    const amt = Number(v?.amount || 0);
    const bucket = String(v?.bucket || v?.category || 'direct').toLowerCase();
    if (bucket === 'indirect') out.indirectAmount += amt;
    else out.directAmount += amt;
  }
  return out;
});

const prevUser = () => {
  if (!canPrev.value) return;
  userId.value = providerOptions.value[userIndex.value - 1]?.user_id || null;
};
const nextUser = () => {
  if (!canNext.value) return;
  userId.value = providerOptions.value[userIndex.value + 1]?.user_id || null;
};

const loadNotifications = async () => {
  const uid = Number(userId.value || 0);
  if (!props.periodId || !uid) {
    notifications.value = [];
    return;
  }
  notificationsLoading.value = true;
  try {
    const resp = await api.get(`/payroll/periods/${props.periodId}/post/preview`, { params: { userId: uid } });
    notifications.value = resp.data?.notifications || [];
  } catch {
    notifications.value = [];
  } finally {
    notificationsLoading.value = false;
  }
};

const reload = async () => {
  if (!props.periodId) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${props.periodId}`);
    const next = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    summaries.value = next;
    if (!userId.value && next.length) {
      const sorted = [...next].sort((a, b) =>
        String(a?.last_name || '').localeCompare(String(b?.last_name || ''))
      );
      userId.value = sorted[0]?.user_id || null;
    }
    await loadNotifications();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load preview post';
    summaries.value = [];
  } finally {
    loading.value = false;
  }
};

watch(() => props.periodId, reload);
watch(userId, loadNotifications);
onMounted(reload);
</script>

<style scoped>
.ppp { display: flex; flex-direction: column; gap: 12px; }
.ppp-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.ppp-title { font-size: 1.05rem; font-weight: 800; color: var(--text-primary, #1d2633); }
.ppp-hint { font-size: 13px; color: var(--text-secondary, #64748b); margin-top: 4px; max-width: 820px; }
.ppp-period { margin-top: 6px; font-size: 13px; }
.ppp-error {
  padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px;
}
.ppp-muted { color: var(--text-secondary, #64748b); font-size: 13px; }
.ppp-toolbar { display: flex; gap: 12px; }
.ppp-provider-row { display: flex; gap: 8px; align-items: center; }
.ppp-provider-row select {
  flex: 1; padding: 6px 8px; border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px; font-size: 13px; background: #fff;
}
.field label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--text-secondary, #64748b); margin-bottom: 4px;
}
.ppp-body { display: flex; flex-direction: column; gap: 10px; }
.ppp-kpis {
  display: flex; flex-wrap: wrap; gap: 14px; font-size: 14px;
  padding: 10px 12px; background: #f8fafc; border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.ppp-card {
  border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
  padding: 12px 14px; background: #fff;
}
.ppp-card-title { font-size: 13px; font-weight: 750; margin-bottom: 8px; }
.ppp-warn {
  padding: 10px 12px; border-radius: 8px; font-size: 13px;
  background: #fffbeb; border: 1px solid #fde68a;
}
.ppp-warn--red { background: #ffecec; border-color: #ffb5b5; }
.ppp-warn--amber { background: #fff4e6; border-color: #ffd8a8; }
.ppp-table-wrap { overflow-x: auto; max-height: 280px; overflow-y: auto; }
.ppp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ppp-table th, .ppp-table td {
  padding: 6px 8px; border-bottom: 1px solid var(--border, #e2e8f0); text-align: left;
}
.ppp-table th {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--text-secondary, #64748b); position: sticky; top: 0; background: #fff;
}
.ppp-table .right, .right { text-align: right; }
.ppp-adj-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 4px 0; font-size: 13px;
}
.ppp-note { margin-top: 8px; font-size: 13px; }
</style>
