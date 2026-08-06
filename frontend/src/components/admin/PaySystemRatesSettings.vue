<template>
  <div class="ps-wrap">
    <div class="ps-header">
      <div>
        <h4 class="ps-title">Pay System Rates</h4>
        <p class="ps-sub">
          Category × level rates for the new pay system. <strong>MWR</strong> = Minimum Workload Rate —
          the lower rate applied when a provider falls below the minimum direct-service threshold (12 credits / 48 units / 12 hrs)
          for that pay period. It is waivable per-person.
        </p>
      </div>
      <div class="ps-header-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadData">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving || loading" @click="saveAll">
          {{ saving ? 'Saving…' : 'Save all' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="ps-error">{{ error }}</div>
    <div v-if="saveSuccess" class="save-success">Pay system rates saved.</div>
    <div v-if="transitionMsg" class="save-success">{{ transitionMsg }}</div>

    <!-- Transition banner -->
    <div class="ps-transition" :class="{ 'ps-transition--on': enabled }">
      <div>
        <strong>{{ enabled ? 'New pay system is ON' : 'New pay system is OFF' }}</strong>
        <p class="ps-transition-sub">
          <template v-if="enabled">
            Enrolled users are paid from these rates (credit / H-code / indirect / support + bonuses).
            Existing staff enrolled at transition had their 90-day probation waived.
          </template>
          <template v-else>
            Click Transition to enable for this agency. All staff with a compensation level will be
            enrolled and their 90-day probation waived (grandfathered). New hires after that get the real 90-day rule.
          </template>
        </p>
      </div>
      <button
        v-if="!enabled"
        type="button"
        class="btn btn-primary"
        :disabled="transitioning || loading"
        @click="runTransition"
      >
        {{ transitioning ? 'Transitioning…' : 'Transition to New Pay System' }}
      </button>
      <span v-else class="ps-on-pill">Active</span>
    </div>

    <div v-if="loading" class="ps-loading">Loading…</div>

    <div v-else class="ps-categories">
      <div v-for="cat in CATEGORIES" :key="cat.id" class="ps-category">
        <div class="ps-cat-header">
          <div class="ps-cat-badge">{{ cat.label }}</div>
          <span class="ps-cat-desc">{{ cat.description }}</span>
        </div>

        <div class="ps-table-wrap">
          <table class="ps-table">
            <thead>
              <tr>
                <th class="col-level">Level</th>
                <th class="col-rate">Credit $/cr</th>
                <th class="col-rate" title="Minimum Workload Rate — applied when below 12 credits/48 units/12 hrs direct">Credit (Min Workload)</th>
                <th class="col-rate">H-code $/hr</th>
                <th class="col-rate" title="Minimum Workload Rate for H-codes">H-code (Min Workload)</th>
                <th class="col-rate">Indirect $/hr</th>
                <th class="col-rate">Support $/hr</th>
                <th class="col-bonus" title="Tier Performance Bonus — earned by hitting session volume thresholds (T2/T3)">Tier Perf. Bonus $/cr</th>
                <th class="col-bonus">Spanish Bonus $/cr</th>
                <th class="col-bonus" title="Location bonus (e.g. Denver office) — assign eligibility per person in their payroll tab">Location Bonus $/cr</th>
                <th class="col-auto" title="Minutes of auto-indirect added per hour of H-code work (Cat 2/3 only)">Auto-ind min</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="lvl in 5" :key="lvl" class="ps-row">
                <td class="col-level"><span class="ps-level-pill">L{{ lvl }}</span></td>
                <td class="col-rate">
                  <div class="ps-rate-input">
                    <span class="ps-prefix">$</span>
                    <input v-model.number="draft[cat.id][lvl].creditRate" type="number" min="0" step="0.01" class="ps-input" placeholder="0.00" />
                  </div>
                </td>
                <td class="col-rate">
                  <div class="ps-rate-input">
                    <span class="ps-prefix">$</span>
                    <input v-model.number="draft[cat.id][lvl].creditRateProbation" type="number" min="0" step="0.01" class="ps-input" placeholder="0.00" />
                  </div>
                </td>
                <td class="col-rate">
                  <div class="ps-rate-input">
                    <span class="ps-prefix">$</span>
                    <input v-model.number="draft[cat.id][lvl].hcodeRate" type="number" min="0" step="0.01" class="ps-input" placeholder="0.00" />
                  </div>
                </td>
                <td class="col-rate">
                  <div class="ps-rate-input">
                    <span class="ps-prefix">$</span>
                    <input v-model.number="draft[cat.id][lvl].hcodeRateProbation" type="number" min="0" step="0.01" class="ps-input" placeholder="0.00" />
                  </div>
                </td>
                <td class="col-rate">
                  <div class="ps-rate-input">
                    <span class="ps-prefix">$</span>
                    <input v-model.number="draft[cat.id][lvl].indirectRate" type="number" min="0" step="0.01" class="ps-input" placeholder="0.00" />
                  </div>
                </td>
                <td class="col-rate">
                  <div class="ps-rate-input">
                    <span class="ps-prefix">$</span>
                    <input v-model.number="draft[cat.id][lvl].supportActivityRate" type="number" min="0" step="0.01" class="ps-input" placeholder="0.00" />
                  </div>
                </td>
                <td class="col-bonus">
                  <div class="ps-bonus-row">
                    <label>T2 <input v-model.number="draft[cat.id][lvl].tierBonus[2]" type="number" min="0" step="0.01" class="ps-input ps-input--tiny" /></label>
                    <label>T3 <input v-model.number="draft[cat.id][lvl].tierBonus[3]" type="number" min="0" step="0.01" class="ps-input ps-input--tiny" /></label>
                  </div>
                </td>
                <td class="col-bonus">
                  <div class="ps-bonus-row">
                    <label>T2 <input v-model.number="draft[cat.id][lvl].spanishBonus[2]" type="number" min="0" step="0.01" class="ps-input ps-input--tiny" /></label>
                    <label>T3 <input v-model.number="draft[cat.id][lvl].spanishBonus[3]" type="number" min="0" step="0.01" class="ps-input ps-input--tiny" /></label>
                  </div>
                </td>
                <td class="col-bonus">
                  <div class="ps-bonus-row">
                    <label>T1 <input v-model.number="draft[cat.id][lvl].locationBonus[1]" type="number" min="0" step="0.01" class="ps-input ps-input--tiny" /></label>
                    <label>T2 <input v-model.number="draft[cat.id][lvl].locationBonus[2]" type="number" min="0" step="0.01" class="ps-input ps-input--tiny" /></label>
                    <label>T3 <input v-model.number="draft[cat.id][lvl].locationBonus[3]" type="number" min="0" step="0.01" class="ps-input ps-input--tiny" /></label>
                  </div>
                </td>
                <td class="col-auto">
                  <input v-model.number="draft[cat.id][lvl].autoIndirectMinutesPerHour" type="number" min="0" max="60" step="1" class="ps-input ps-input--tiny" title="Minutes of auto-indirect per hour of H-code (cat 2/3)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: null }
});

const CATEGORIES = [
  { id: 1, label: 'Unlicensed', description: 'Unlicensed — Bachelors, Interns, QBHA, Peer & Unlicensed Masters' },
  { id: 2, label: 'Pre-licensed', description: 'Pre-licensed Masters Level' },
  { id: 3, label: 'Licensed', description: 'Licensed Professionals' }
];

const loading = ref(false);
const saving = ref(false);
const transitioning = ref(false);
const error = ref('');
const saveSuccess = ref(false);
const transitionMsg = ref('');
const enabled = ref(false);

const emptyLevel = () => ({
  creditRate: null,
  creditRateProbation: null,
  hcodeRate: null,
  hcodeRateProbation: null,
  indirectRate: null,
  supportActivityRate: null,
  autoIndirectMinutesPerHour: 10,
  tierBonus: { 1: 0, 2: 2, 3: 4 },
  spanishBonus: { 1: 0, 2: 2, 3: 4 },
  locationBonus: { 1: 0, 2: 0, 3: 0 }
});

const makeDraft = () => {
  const d = {};
  for (const cat of [1, 2, 3]) {
    d[cat] = {};
    for (let lvl = 1; lvl <= 5; lvl++) d[cat][lvl] = emptyLevel();
  }
  return d;
};
const draft = ref(makeDraft());

const applyRates = (rates) => {
  const next = makeDraft();
  for (const row of rates || []) {
    const cat = Number(row.category);
    const lvl = Number(row.level);
    if (!next[cat]?.[lvl]) continue;
    next[cat][lvl] = {
      creditRate: row.creditRate != null ? Number(row.creditRate) : null,
      creditRateProbation: row.creditRateProbation != null ? Number(row.creditRateProbation) : null,
      hcodeRate: row.hcodeRate != null ? Number(row.hcodeRate) : null,
      hcodeRateProbation: row.hcodeRateProbation != null ? Number(row.hcodeRateProbation) : null,
      indirectRate: row.indirectRate != null ? Number(row.indirectRate) : null,
      supportActivityRate: row.supportActivityRate != null ? Number(row.supportActivityRate) : null,
      autoIndirectMinutesPerHour: Number(row.autoIndirectMinutesPerHour ?? 10) || 10,
      tierBonus: {
        1: Number(row.tierBonus?.[1] ?? 0) || 0,
        2: Number(row.tierBonus?.[2] ?? 2) || 0,
        3: Number(row.tierBonus?.[3] ?? 4) || 0
      },
      spanishBonus: {
        1: Number(row.spanishBonus?.[1] ?? 0) || 0,
        2: Number(row.spanishBonus?.[2] ?? 2) || 0,
        3: Number(row.spanishBonus?.[3] ?? 4) || 0
      },
      locationBonus: {
        1: Number(row.locationBonus?.[1] ?? 0) || 0,
        2: Number(row.locationBonus?.[2] ?? 0) || 0,
        3: Number(row.locationBonus?.[3] ?? 0) || 0
      }
    };
  }
  draft.value = next;
};

let reqSeq = 0;
let safetyTimer = null;

const loadData = async () => {
  if (!props.agencyId) { loading.value = false; return; }
  const seq = ++reqSeq;
  loading.value = true;
  error.value = '';
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => {
    if (seq === reqSeq && loading.value) {
      loading.value = false;
      error.value = 'Loading timed out — click Refresh to retry.';
    }
  }, 15000);

  try {
    const res = await api.get('/payroll/pay-system/rates', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    if (seq !== reqSeq) return;
    applyRates(res?.data?.rates || []);
    enabled.value = !!res?.data?.enabled;
  } catch (e) {
    if (seq === reqSeq) {
      error.value = e?.response?.data?.error?.message || e.message || 'Failed to load pay system rates';
      applyRates([]);
    }
  } finally {
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    if (seq === reqSeq) loading.value = false;
  }
};

const saveAll = async () => {
  if (!props.agencyId) return;
  saving.value = true;
  error.value = '';
  saveSuccess.value = false;
  try {
    const rates = [];
    for (const cat of [1, 2, 3]) {
      for (let lvl = 1; lvl <= 5; lvl++) {
        const d = draft.value[cat][lvl];
        rates.push({
          category: cat,
          level: lvl,
          creditRate: d.creditRate ?? null,
          creditRateProbation: d.creditRateProbation ?? null,
          hcodeRate: d.hcodeRate ?? null,
          hcodeRateProbation: d.hcodeRateProbation ?? null,
          indirectRate: d.indirectRate ?? null,
          supportActivityRate: d.supportActivityRate ?? null,
          autoIndirectMinutesPerHour: d.autoIndirectMinutesPerHour ?? 10,
          tierBonus: { ...d.tierBonus },
          spanishBonus: { ...d.spanishBonus },
          locationBonus: { ...d.locationBonus }
        });
      }
    }
    const res = await api.put('/payroll/pay-system/rates', {
      agencyId: props.agencyId,
      rates
    }, { skipGlobalLoading: true });
    applyRates(res?.data?.rates || rates);
    enabled.value = !!res?.data?.enabled;
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save pay system rates';
  } finally {
    saving.value = false;
  }
};

const runTransition = async () => {
  if (!props.agencyId) return;
  if (!window.confirm(
    'Transition this agency to the new pay system?\n\n' +
    '• Agency flag will be turned ON\n' +
    '• All staff with a compensation level will be enrolled\n' +
    '• Their 90-day probation will be waived (grandfathered)\n' +
    '• New hires after this will use the real 90-day rule\n\n' +
    'Make sure rates above are configured first.'
  )) return;

  transitioning.value = true;
  error.value = '';
  transitionMsg.value = '';
  try {
    // Save rates first so transition isn't onto empty rates
    await saveAll();
    const res = await api.post('/payroll/pay-system/transition', {
      agencyId: props.agencyId
    }, { skipGlobalLoading: true });
    enabled.value = true;
    transitionMsg.value = res?.data?.message || 'Transition complete.';
    setTimeout(() => { transitionMsg.value = ''; }, 6000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Transition failed';
  } finally {
    transitioning.value = false;
  }
};

watch(() => props.agencyId, () => loadData(), { immediate: true });
onBeforeUnmount(() => { if (safetyTimer) clearTimeout(safetyTimer); });
</script>

<style scoped>
.ps-wrap { margin-top: 24px; }
.ps-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.ps-title { margin: 0 0 4px; font-size: 1rem; font-weight: 600; }
.ps-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  max-width: 640px;
}
.ps-header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.ps-loading { color: var(--text-secondary, #6b7280); padding: 16px 0; }
.ps-error {
  background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
  border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px;
}
.save-success {
  background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;
  border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px;
}
.ps-transition {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  margin-bottom: 18px;
}
.ps-transition--on {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.ps-transition-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
  max-width: 640px;
}
.ps-on-pill {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  background: #166534;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.ps-categories { display: flex; flex-direction: column; gap: 20px; }
.ps-category {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.ps-cat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}
.ps-cat-badge {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: #2e5d50;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.ps-cat-desc { font-size: 13px; color: #6b7280; }
.ps-table-wrap { overflow-x: auto; }
.ps-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ps-table th {
  text-align: left;
  padding: 8px 6px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}
.ps-table td {
  padding: 6px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}
.ps-level-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e5e7eb;
  font-weight: 700;
  font-size: 11px;
}
.ps-rate-input {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ps-prefix { color: #9ca3af; font-size: 12px; }
.ps-input {
  width: 72px;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
}
.ps-input--tiny { width: 52px; }
.ps-bonus-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: #6b7280;
}
.ps-bonus-row label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.col-level { width: 48px; }
.col-rate { min-width: 80px; }
.col-bonus { min-width: 90px; }
.col-auto { width: 64px; }
</style>
