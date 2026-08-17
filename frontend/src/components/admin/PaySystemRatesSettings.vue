<template>
  <div class="ps-wrap">
    <div class="ps-header">
      <div>
        <h4 class="ps-title">Pay System Rates</h4>
        <p class="ps-sub">
          Category × level rates for the new pay system. FFS pays at the fee-for-service rate × credits
          (0.75 / 1.0 / 1.5 for extended 90834 as 2 units). H-codes use the H rate; Cat 2/3 packages include
          embedded auto-indirect (default 10 min) split from the H package — not added on top.
          <strong>MWR / Probationary</strong> rates apply during the 90-day window or when below minimum workload (waivable).
        </p>
      </div>
      <div class="ps-header-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadAll">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving || loading" @click="saveAll">
          {{ saving ? 'Saving…' : 'Save all rates' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="ps-error">{{ error }}</div>
    <div v-if="saveSuccess" class="save-success">Pay system rates saved.</div>
    <div v-if="transitionMsg" class="save-success">{{ transitionMsg }}</div>
    <div v-if="goMsg" class="save-success">{{ goMsg }}</div>

    <!-- Agency flag -->
    <div class="ps-transition" :class="{ 'ps-transition--on': enabled }">
      <div>
        <strong>{{ enabled ? 'Agency pay-system flag is ON' : 'Agency pay-system flag is OFF' }}</strong>
        <p class="ps-transition-sub">
          <template v-if="enabled">
            Configure rates and stage pay-level updates below. Rates do not override compensation tables until you click
            <strong>Go</strong> and enter an effective start date.
          </template>
          <template v-else>
            Turn the agency flag on to edit rates, then stage everyone’s pay levels and click Go with a start date.
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
        {{ transitioning ? 'Enabling…' : 'Enable agency flag' }}
      </button>
      <span v-else class="ps-on-pill">Flag ON</span>
    </div>

    <!-- Go / deferred activation -->
    <div class="ps-go-panel">
      <div class="ps-go-head">
        <div>
          <strong>Activate rates (Go)</strong>
          <p class="ps-transition-sub">
            Stage category/level changes in the roster below. Until you Go, payroll keeps using current compensation tables.
            Go applies staged levels, enrolls staff in the new pay system, and sets the start date.
          </p>
        </div>
        <div class="ps-go-actions">
          <label class="ps-go-date">
            <span>Effective start</span>
            <input v-model="goEffectiveStart" type="date" :disabled="going" />
          </label>
          <label class="ps-go-check">
            <input v-model="goWaiveProbation" type="checkbox" :disabled="going" />
            Waive 90-day probation for enrolled staff
          </label>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="going || loading || !goEffectiveStart"
            @click="runGo"
          >
            {{ going ? 'Applying…' : `Go (${pendingCount} staged)` }}
          </button>
        </div>
      </div>
      <div v-if="pendingCount" class="ps-pending-banner">
        {{ pendingCount }} staged pay-level change{{ pendingCount === 1 ? '' : 's' }} waiting for Go.
        <button type="button" class="btn btn-ghost btn-sm" :disabled="staging" @click="clearAllPending">Clear staged</button>
      </div>
    </div>

    <div v-if="loading" class="ps-loading">Loading…</div>

    <template v-else>
      <!-- Rate matrix -->
      <div class="ps-categories">
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
                  <th class="col-rate" title="Fee-for-service rate per 1 credit (all FFS codes)">FFS $/credit</th>
                  <th class="col-rate" title="Minimum workload / 90-day probationary FFS rate">FFS Min / Probation</th>
                  <th class="col-rate" title="H-code package rate (per hour or per 4 units depending on code)">H-code $/hr</th>
                  <th class="col-rate" title="Minimum workload / probationary H-code rate">H Min / Probation</th>
                  <th class="col-rate">Indirect $/hr</th>
                  <th class="col-rate">Support activity $/hr</th>
                  <th class="col-bonus" title="Tier performance bonus per productive credit/hour-eq (typically L3–L5)">Tier bonus $/cr</th>
                  <th class="col-bonus" title="Spanish-speaking bonus at T2/T3 when eligible">Spanish T2/T3</th>
                  <th class="col-bonus" title="Location (e.g. Denver) bonus when eligible — set T2/T3 amounts">Location / Denver</th>
                  <th class="col-auto" title="Minutes of embedded auto-indirect per H-code hour (Cat 2/3; split from H package)">Auto-ind min</th>
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

      <!-- Roster: stage pay levels -->
      <div class="ps-roster">
        <div class="ps-roster-head">
          <div>
            <h4 class="ps-title">Staff pay levels</h4>
            <p class="ps-sub">
              Edit category/level, then Stage. Changes stay pending until Go. Live effective date shows when rates already apply.
            </p>
          </div>
          <div class="ps-header-actions">
            <input v-model="rosterFilter" type="search" class="ps-filter" placeholder="Filter by name…" />
            <button type="button" class="btn btn-secondary btn-sm" :disabled="staging || !dirtyRows.length" @click="stageDirty">
              {{ staging ? 'Staging…' : `Stage ${dirtyRows.length || ''} change${dirtyRows.length === 1 ? '' : 's'}` }}
            </button>
          </div>
        </div>

        <div class="ps-table-wrap">
          <table class="ps-table ps-roster-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Live</th>
                <th>Pay system</th>
                <th>Effective</th>
                <th>Staged →</th>
                <th>Category</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRoster" :key="row.userId" :class="{ 'ps-row--dirty': row.dirty, 'ps-row--pending': row.hasPending }">
                <td>
                  <div class="ps-name">{{ row.name }}</div>
                  <div class="ps-email muted">{{ row.email }}</div>
                </td>
                <td>
                  <span v-if="row.liveCategory">Cat {{ row.liveCategory }}{{ row.liveBypass ? ' · Bypass' : ` · L${row.liveLevel}` }}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td>
                  <span :class="row.livePaySystemEnabled ? 'ps-pill-on' : 'ps-pill-off'">
                    {{ row.livePaySystemEnabled ? 'Enrolled' : 'Off' }}
                  </span>
                </td>
                <td class="muted">{{ row.liveEffectiveStart || '—' }}</td>
                <td>
                  <span v-if="row.hasPending" class="ps-pending-pill">
                    Cat {{ row.pendingCategory }}{{ row.pendingBypass ? ' · Bypass' : ` · L${row.pendingLevel}` }}
                  </span>
                  <span v-else class="muted">—</span>
                </td>
                <td>
                  <select v-model.number="row.draftCategory" class="ps-select" @change="markDirty(row)">
                    <option :value="1">1 Unlicensed</option>
                    <option :value="2">2 Pre-licensed</option>
                    <option :value="3">3 Licensed</option>
                  </select>
                </td>
                <td>
                  <select v-model="row.draftLevelKey" class="ps-select" @change="markDirty(row)">
                    <option value="bypass">Bypass</option>
                    <option value="1">Level 1</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                    <option value="4">Level 4</option>
                    <option value="5">Level 5</option>
                  </select>
                </td>
              </tr>
              <tr v-if="!filteredRoster.length">
                <td colspan="7" class="muted">No staff with a compensation-level assignment yet. Assign category/level on each person’s Account tab first.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: null }
});

const CATEGORIES = [
  { id: 1, label: 'Unlicensed', description: 'Unlicensed — Bachelors, Interns, QBHA, Peer & Unlicensed Masters' },
  { id: 2, label: 'Pre-licensed', description: 'Pre-licensed Masters Level — H package includes 10 min auto-indirect' },
  { id: 3, label: 'Licensed', description: 'Licensed Professionals — H package includes 10 min auto-indirect' }
];

const loading = ref(false);
const saving = ref(false);
const staging = ref(false);
const transitioning = ref(false);
const going = ref(false);
const error = ref('');
const saveSuccess = ref(false);
const transitionMsg = ref('');
const goMsg = ref('');
const enabled = ref(false);
const goEffectiveStart = ref('');
const goWaiveProbation = ref(true);
const rosterFilter = ref('');
const roster = ref([]);

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

const personName = (r) => {
  const n = `${r.first_name || ''} ${r.last_name || ''}`.trim();
  return n || r.company_email || r.email || `User #${r.user_id}`;
};

const buildRoster = (assignments, pending) => {
  const pendingByUser = new Map((pending || []).map((p) => [Number(p.user_id), p]));
  const rows = (assignments || []).map((a) => {
    const p = pendingByUser.get(Number(a.user_id));
    const liveBypass = Number(a.bypass) === 1;
    const draftCategory = p ? Number(p.category) : Number(a.category);
    const draftLevelKey = p
      ? (Number(p.bypass) === 1 || p.level == null ? 'bypass' : String(p.level))
      : (liveBypass || a.level == null ? 'bypass' : String(a.level));
    return {
      userId: Number(a.user_id),
      name: personName(a),
      email: a.company_email || a.email || '',
      liveCategory: a.category != null ? Number(a.category) : null,
      liveLevel: a.level != null ? Number(a.level) : null,
      liveBypass,
      livePaySystemEnabled: Number(a.pay_system_enabled) === 1,
      liveEffectiveStart: a.pay_system_effective_start ? String(a.pay_system_effective_start).slice(0, 10) : '',
      hasPending: !!p,
      pendingCategory: p ? Number(p.category) : null,
      pendingLevel: p?.level != null ? Number(p.level) : null,
      pendingBypass: p ? Number(p.bypass) === 1 : false,
      draftCategory,
      draftLevelKey,
      dirty: false
    };
  });
  roster.value = rows;
};

const pendingCount = computed(() => roster.value.filter((r) => r.hasPending).length);
const dirtyRows = computed(() => roster.value.filter((r) => r.dirty));
const filteredRoster = computed(() => {
  const q = String(rosterFilter.value || '').trim().toLowerCase();
  if (!q) return roster.value;
  return roster.value.filter((r) =>
    r.name.toLowerCase().includes(q) || String(r.email || '').toLowerCase().includes(q)
  );
});

const markDirty = (row) => {
  row.dirty = true;
};

let reqSeq = 0;
let safetyTimer = null;

const loadAll = async () => {
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
    const [ratesRes, assignRes] = await Promise.all([
      api.get('/payroll/pay-system/rates', {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }),
      api.get('/payroll/pay-system/assignments', {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }).catch(() => ({ data: { assignments: [], pending: [], enabled: false } }))
    ]);
    if (seq !== reqSeq) return;
    applyRates(ratesRes?.data?.rates || []);
    enabled.value = !!(ratesRes?.data?.enabled ?? assignRes?.data?.enabled);
    buildRoster(assignRes?.data?.assignments || [], assignRes?.data?.pending || []);
  } catch (e) {
    if (seq === reqSeq) {
      error.value = e?.response?.data?.error?.message || e.message || 'Failed to load pay system rates';
      applyRates([]);
      roster.value = [];
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

const stageDirty = async () => {
  if (!props.agencyId || !dirtyRows.value.length) return;
  staging.value = true;
  error.value = '';
  try {
    const changes = dirtyRows.value.map((r) => {
      const bypass = r.draftLevelKey === 'bypass';
      return {
        userId: r.userId,
        category: Number(r.draftCategory),
        level: bypass ? null : parseInt(r.draftLevelKey, 10),
        bypass,
        paySystemEnabled: true
      };
    });
    const res = await api.put('/payroll/pay-system/pending', {
      agencyId: props.agencyId,
      changes
    }, { skipGlobalLoading: true });
    const assignRes = await api.get('/payroll/pay-system/assignments', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    buildRoster(assignRes?.data?.assignments || [], res?.data?.pending || assignRes?.data?.pending || []);
    goMsg.value = `Staged ${changes.length} pay-level change(s). Click Go with a start date when ready.`;
    setTimeout(() => { goMsg.value = ''; }, 5000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to stage pay-level changes';
  } finally {
    staging.value = false;
  }
};

const clearAllPending = async () => {
  if (!props.agencyId) return;
  if (!window.confirm('Clear all staged pay-level changes?')) return;
  staging.value = true;
  try {
    await api.delete('/payroll/pay-system/pending', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    await loadAll();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to clear staged changes';
  } finally {
    staging.value = false;
  }
};

const runTransition = async () => {
  if (!props.agencyId) return;
  if (!window.confirm(
    'Enable the agency pay-system flag?\n\n' +
    'This does not enroll staff yet. Stage pay levels, then click Go with an effective start date.'
  )) return;

  transitioning.value = true;
  error.value = '';
  transitionMsg.value = '';
  try {
    await saveAll();
    const res = await api.post('/payroll/pay-system/transition', {
      agencyId: props.agencyId
    }, { skipGlobalLoading: true });
    enabled.value = true;
    transitionMsg.value = res?.data?.message || 'Agency flag enabled.';
    setTimeout(() => { transitionMsg.value = ''; }, 6000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to enable agency flag';
  } finally {
    transitioning.value = false;
  }
};

const runGo = async () => {
  if (!props.agencyId || !goEffectiveStart.value) return;
  const start = String(goEffectiveStart.value).slice(0, 10);
  if (!window.confirm(
    `Activate the new pay system starting ${start}?\n\n` +
    `• ${pendingCount.value} staged level change(s) will be applied\n` +
    '• Staff with a compensation level will be enrolled\n' +
    '• New rates override compensation tables for pay periods ending on/after this date\n' +
    (goWaiveProbation.value ? '• 90-day probation will be waived for enrolled staff\n' : '')
  )) return;

  going.value = true;
  error.value = '';
  goMsg.value = '';
  try {
    await saveAll();
    const res = await api.post('/payroll/pay-system/go', {
      agencyId: props.agencyId,
      effectiveStart: start,
      waiveProbation: !!goWaiveProbation.value,
      enrollExistingWithoutPending: true
    }, { skipGlobalLoading: true });
    enabled.value = true;
    buildRoster(res?.data?.assignments || [], res?.data?.pending || []);
    goMsg.value = res?.data?.message || 'Pay system activated.';
    setTimeout(() => { goMsg.value = ''; }, 8000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Go failed';
  } finally {
    going.value = false;
  }
};

watch(() => props.agencyId, () => loadAll(), { immediate: true });
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
  max-width: 720px;
}
.ps-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; flex-wrap: wrap; }
.ps-loading { color: var(--text-secondary, #6b7280); padding: 16px 0; }
.ps-error {
  background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
  border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px;
}
.save-success {
  background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;
  border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px;
}
.ps-transition, .ps-go-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  margin-bottom: 18px;
}
.ps-transition {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}
.ps-transition--on {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.ps-go-panel {
  border-color: #bfdbfe;
  background: #eff6ff;
}
.ps-go-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.ps-go-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}
.ps-go-date {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.ps-go-date input {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}
.ps-go-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4b5563;
}
.ps-pending-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #1e40af;
  font-weight: 600;
}
.ps-transition-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
  max-width: 640px;
}
.ps-on-pill, .ps-pill-on, .ps-pending-pill {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: #166534;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.ps-pill-off {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #4b5563;
  font-size: 11px;
  font-weight: 700;
}
.ps-pending-pill { background: #1d4ed8; }
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
.ps-roster {
  margin-top: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  background: #fff;
}
.ps-roster-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.ps-filter {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  min-width: 180px;
}
.ps-select {
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
  max-width: 140px;
}
.ps-name { font-weight: 600; color: #111827; }
.ps-email { font-size: 11px; }
.muted { color: #9ca3af; }
.ps-row--dirty { background: #fffbeb; }
.ps-row--pending { background: #eff6ff; }
</style>
