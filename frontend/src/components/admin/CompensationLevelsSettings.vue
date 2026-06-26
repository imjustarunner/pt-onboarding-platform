<template>
  <div class="cl-wrap">
    <div class="cl-header">
      <div>
        <h4 class="cl-title">Compensation Levels</h4>
        <p class="cl-sub">Define rates for each category and level. Assign providers a category + level from their Payroll tab to apply the rates automatically.</p>
      </div>
      <div class="cl-header-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadData">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving || loading" @click="saveAll">
          {{ saving ? 'Saving…' : 'Save all' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="cl-error">{{ error }}</div>
    <div v-if="saveSuccess" class="save-success">Compensation levels saved.</div>

    <div v-if="loading" class="cl-loading">Loading…</div>

    <div v-else class="cl-categories">
      <div v-for="cat in CATEGORIES" :key="cat.id" class="cl-category">
        <div class="cl-cat-header">
          <div class="cl-cat-badge">Category {{ cat.id }}</div>
          <div class="cl-cat-info">
            <input
              v-model="categoryLabels[cat.id]"
              type="text"
              class="cl-cat-name-input"
              :placeholder="cat.description"
              :title="`Custom name for Category ${cat.id}`"
            />
            <span class="cl-cat-desc">{{ cat.description }}</span>
          </div>
        </div>

        <div class="cl-table-wrap">
          <table class="cl-table">
            <thead>
              <tr>
                <th class="col-level">Level</th>
                <th class="col-label">Label <span class="col-optional">(optional)</span></th>
                <th class="col-rate">Direct ($/hr)</th>
                <th class="col-rate">Indirect ($/hr)</th>
                <th class="col-ffs-toggle">FFS</th>
                <th class="col-ratecard">Rate card</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="lvl in 5" :key="lvl">
                <tr class="cl-row">
                  <td class="col-level">
                    <span class="cl-level-pill">Level {{ lvl }}</span>
                  </td>
                  <td class="col-label">
                    <input
                      v-model="draft[cat.id][lvl].label"
                      type="text"
                      class="cl-input"
                      placeholder="e.g. Staff Counselor I"
                    />
                  </td>
                  <td class="col-rate">
                    <div class="cl-rate-input">
                      <span class="cl-prefix">$</span>
                      <input
                        v-model.number="draft[cat.id][lvl].directRate"
                        type="number"
                        min="0"
                        step="0.01"
                        class="cl-input cl-input--rate"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td class="col-rate">
                    <div class="cl-rate-input">
                      <span class="cl-prefix">$</span>
                      <input
                        v-model.number="draft[cat.id][lvl].indirectRate"
                        type="number"
                        min="0"
                        step="0.01"
                        class="cl-input cl-input--rate"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td class="col-ffs-toggle">
                    <label class="cl-toggle">
                      <input type="checkbox" v-model="draft[cat.id][lvl].hasFfs" />
                      <span class="cl-toggle-slider"></span>
                    </label>
                  </td>
                  <td class="col-ratecard">
                    <button
                      v-if="draft[cat.id][lvl].hasFfs"
                      type="button"
                      class="cl-ratecard-btn"
                      :class="{ 'is-open': isExpanded(cat.id, lvl) }"
                      @click="toggleExpand(cat.id, lvl)"
                    >
                      {{ isExpanded(cat.id, lvl) ? 'Hide' : 'Edit rate card' }}
                      <span v-if="configuredCount(cat.id, lvl)" class="cl-ratecard-count">{{ configuredCount(cat.id, lvl) }}</span>
                    </button>
                    <span v-else class="cl-ratecard-na">—</span>
                  </td>
                </tr>

                <tr v-if="isExpanded(cat.id, lvl)" class="cl-expand-row">
                  <td colspan="6">
                    <div class="cl-ffs-panel">
                      <div class="cl-ffs-panel-head">
                        <strong>FFS rate card — {{ categoryLabels[cat.id] || cat.label }} · Level {{ lvl }}</strong>
                        <span class="cl-ffs-panel-hint">
                          Set per-code rates below. Codes left blank fall back to the rate card
                          (Direct {{ fmtFallback(draft[cat.id][lvl].directRate) }} / Indirect {{ fmtFallback(draft[cat.id][lvl].indirectRate) }}).
                          These become the defaults applied to a new provider at this level.
                        </span>
                      </div>

                      <div v-if="!serviceCodes.length" class="cl-ffs-empty">
                        No service codes configured for this tenant yet. Add them under the “Service Codes” tab first.
                      </div>

                      <div v-else class="cl-ffs-codes">
                        <input
                          v-model="codeFilter"
                          type="text"
                          class="cl-input cl-ffs-filter"
                          placeholder="Filter service codes…"
                        />
                        <div class="cl-ffs-grid">
                          <div
                            v-for="sc in filteredServiceCodes"
                            :key="sc.code"
                            class="cl-ffs-code-row"
                          >
                            <div class="cl-ffs-code-label">
                              <span class="cl-ffs-code">{{ sc.code }}</span>
                              <span class="cl-ffs-code-cat" :class="`cat-${sc.category}`">{{ sc.category }}</span>
                            </div>
                            <div class="cl-rate-input cl-ffs-rate">
                              <span class="cl-prefix">$</span>
                              <input
                                v-model.number="levelRateEdits[`${cat.id}:${lvl}`][sc.code]"
                                type="number"
                                min="0"
                                step="0.01"
                                class="cl-input cl-input--rate"
                                :placeholder="fallbackPlaceholder(cat.id, lvl, sc)"
                              />
                              <span class="cl-ffs-unit">{{ unitLabel(sc.payRateUnit) }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: null }
});

const CATEGORIES = [
  { id: 1, label: 'Category 1', description: 'Bachelors, Interns, QBHA & Peer Professionals' },
  { id: 2, label: 'Category 2', description: 'Pre-licensed & Unlicensed Masters Level' },
  { id: 3, label: 'Category 3', description: 'Licensed Professionals' }
];

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const saveSuccess = ref(false);

const categoryLabels = ref({ 1: '', 2: '', 3: '' });
const serviceCodes = ref([]); // [{ code, category, payRateUnit }]
const expandedKey = ref(null); // "cat:level" currently open
const codeFilter = ref('');

const makeDraft = () => {
  const d = {};
  for (const cat of [1, 2, 3]) {
    d[cat] = {};
    for (let lvl = 1; lvl <= 5; lvl++) {
      d[cat][lvl] = { label: '', directRate: null, indirectRate: null, ffsRate: null, hasFfs: false };
    }
  }
  return d;
};
const draft = ref(makeDraft());

const makeEmptyEdits = () => {
  const e = {};
  for (const cat of [1, 2, 3]) {
    for (let lvl = 1; lvl <= 5; lvl++) e[`${cat}:${lvl}`] = {};
  }
  return e;
};

// levelRateEdits["cat:level"] = { [code]: rateAmount } — always has all 15 keys
const levelRateEdits = ref(makeEmptyEdits());

const normalizeCodes = (rows) =>
  (rows || [])
    .map((r) => ({
      code: String(r.service_code || '').trim().toUpperCase(),
      category: r.category || 'direct',
      payRateUnit: r.pay_rate_unit || 'per_unit'
    }))
    .filter((r) => r.code);

const applyLevels = (levels, labels, rates) => {
  const next = makeDraft();
  for (const row of levels || []) {
    const cat = Number(row.category);
    const lvl = Number(row.level);
    if (next[cat]?.[lvl]) {
      next[cat][lvl] = {
        label: row.label || '',
        directRate: row.direct_rate != null ? Number(row.direct_rate) : null,
        indirectRate: row.indirect_rate != null ? Number(row.indirect_rate) : null,
        ffsRate: row.ffs_rate != null ? Number(row.ffs_rate) : null,
        hasFfs: !!row.has_ffs
      };
    }
  }
  draft.value = next;
  if (labels) categoryLabels.value = { 1: labels[1] || '', 2: labels[2] || '', 3: labels[3] || '' };

  const edits = makeEmptyEdits();
  for (const [key, arr] of Object.entries(rates || {})) {
    if (!edits[key]) edits[key] = {};
    for (const r of arr || []) {
      if (r.serviceCode != null) edits[key][String(r.serviceCode).toUpperCase()] = Number(r.rateAmount);
    }
  }
  levelRateEdits.value = edits;
};

// ── Defensive loader ─────────────────────────────────────────────────────────
// No AbortController (which previously left the global loader/refcount stuck).
// Instead: a request-generation guard ignores stale responses, skipGlobalLoading
// keeps this off the global overlay, and a hard timeout guarantees loading clears.
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
    const [levelsRes, codesRes] = await Promise.allSettled([
      api.get('/payroll/compensation-levels', { params: { agencyId: props.agencyId }, skipGlobalLoading: true }),
      api.get('/payroll/service-code-rules', { params: { agencyId: props.agencyId }, skipGlobalLoading: true })
    ]);
    if (seq !== reqSeq) return; // stale — a newer request superseded this one

    if (levelsRes.status === 'fulfilled') {
      const d = levelsRes.value?.data || {};
      applyLevels(d.levels || [], d.categoryLabels || {}, d.levelRates || {});
    } else {
      error.value = levelsRes.reason?.response?.data?.error?.message || 'Failed to load compensation levels';
      applyLevels([], {}, {});
    }

    if (codesRes.status === 'fulfilled') {
      serviceCodes.value = normalizeCodes(codesRes.value?.data || []);
    } else {
      serviceCodes.value = [];
    }
  } catch (e) {
    if (seq === reqSeq) error.value = e?.response?.data?.error?.message || e.message || 'Failed to load';
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
    const levels = [];
    const levelRates = {};
    for (const cat of [1, 2, 3]) {
      for (let lvl = 1; lvl <= 5; lvl++) {
        const d = draft.value[cat][lvl];
        levels.push({
          category: cat,
          level: lvl,
          label: d.label || null,
          directRate: d.directRate ?? null,
          indirectRate: d.indirectRate ?? null,
          ffsRate: d.ffsRate ?? null,
          hasFfs: !!d.hasFfs
        });

        const key = `${cat}:${lvl}`;
        const edits = levelRateEdits.value[key] || {};
        const arr = [];
        for (const sc of serviceCodes.value) {
          const v = edits[sc.code];
          if (v != null && v !== '' && !Number.isNaN(Number(v))) {
            arr.push({ serviceCode: sc.code, rateAmount: Number(v), rateUnit: sc.payRateUnit || 'per_unit' });
          }
        }
        levelRates[key] = arr;
      }
    }

    const res = await api.put('/payroll/compensation-levels', {
      agencyId: props.agencyId,
      levels,
      categoryLabels: { ...categoryLabels.value },
      levelRates
    }, { skipGlobalLoading: true });

    const d = res?.data || {};
    applyLevels(d.levels || [], d.categoryLabels || {}, d.levelRates || {});
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save compensation levels';
  } finally {
    saving.value = false;
  }
};

// ── UI helpers ───────────────────────────────────────────────────────────────
const isExpanded = (cat, lvl) => expandedKey.value === `${cat}:${lvl}`;

const toggleExpand = (cat, lvl) => {
  const key = `${cat}:${lvl}`;
  expandedKey.value = expandedKey.value === key ? null : key;
  codeFilter.value = '';
  if (!levelRateEdits.value[key]) levelRateEdits.value[key] = {};
};

const configuredCount = (cat, lvl) => {
  const edits = levelRateEdits.value[`${cat}:${lvl}`] || {};
  return Object.values(edits).filter((v) => v != null && v !== '' && !Number.isNaN(Number(v))).length;
};

const filteredServiceCodes = computed(() => {
  const q = codeFilter.value.trim().toUpperCase();
  if (!q) return serviceCodes.value;
  return serviceCodes.value.filter((sc) => sc.code.includes(q) || sc.category.toUpperCase().includes(q));
});

const fmtFallback = (v) => (v != null && v !== '' ? `$${Number(v).toFixed(2)}` : '$0.00');

const unitLabel = (u) => (u === 'per_hour' ? '/hr' : u === 'flat' ? 'flat' : '/unit');

const fallbackPlaceholder = (cat, lvl, sc) => {
  const d = draft.value[cat][lvl];
  const base = sc.category === 'indirect' ? d.indirectRate : d.directRate;
  return base != null && base !== '' ? Number(base).toFixed(2) : '0.00';
};

watch(() => props.agencyId, () => loadData(), { immediate: true });

onBeforeUnmount(() => { if (safetyTimer) clearTimeout(safetyTimer); });
</script>

<style scoped>
.cl-wrap {
  margin-top: 24px;
}
.cl-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.cl-title {
  margin: 0 0 4px;
  font-size: 1rem;
  font-weight: 600;
}
.cl-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  max-width: 600px;
}
.cl-header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.cl-loading {
  color: var(--text-secondary, #6b7280);
  padding: 16px 0;
}
.cl-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 12px;
}
.save-success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 12px;
}
.cl-categories {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.cl-category {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.cl-cat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}
.cl-cat-badge {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: #2e5d50;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.cl-cat-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cl-cat-name-input {
  font-size: 14px;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 6px;
  background: transparent;
  color: #1e293b;
  width: 300px;
  transition: border-color 0.15s, background 0.15s;
}
.cl-cat-name-input:hover {
  border-color: #cbd5e1;
  background: #fff;
}
.cl-cat-name-input:focus {
  outline: none;
  border-color: #2e5d50;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(46,93,80,0.1);
}
.cl-cat-name-input::placeholder {
  color: #94a3b8;
  font-weight: 400;
  font-style: italic;
}
.cl-cat-desc {
  font-size: 12px;
  color: #6b7280;
}
.cl-table-wrap {
  overflow-x: auto;
}
.cl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.cl-table th {
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}
.col-optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 11px;
}
.cl-row {
  border-bottom: 1px solid #f3f4f6;
}
.cl-row td {
  padding: 8px 10px;
  vertical-align: middle;
}
.col-level { width: 90px; }
.col-label { min-width: 160px; }
.col-rate { width: 140px; }
.col-ffs-toggle { width: 60px; text-align: center; }
.col-ratecard { width: 150px; }
.cl-level-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}
.cl-input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 13px;
  box-sizing: border-box;
}
.cl-input:focus {
  outline: none;
  border-color: #2e5d50;
  box-shadow: 0 0 0 2px rgba(46, 93, 80, 0.12);
}
.cl-input--rate {
  padding-left: 4px;
}
.cl-rate-input {
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  overflow: hidden;
  background: #fff;
}
.cl-prefix {
  padding: 0 6px;
  font-size: 13px;
  color: #6b7280;
  background: #f3f4f6;
  border-right: 1px solid #d1d5db;
  line-height: 30px;
  user-select: none;
}
.cl-rate-input .cl-input {
  border: none;
  border-radius: 0;
  box-shadow: none;
}
.cl-rate-input .cl-input:focus {
  box-shadow: none;
  border: none;
  outline: 2px solid #2e5d50;
  outline-offset: -2px;
}
.cl-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.cl-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.cl-toggle-slider {
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: #d1d5db;
  position: relative;
  transition: background 0.2s;
}
.cl-toggle-slider::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  top: 3px;
  left: 3px;
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.cl-toggle input:checked + .cl-toggle-slider {
  background: #2e5d50;
}
.cl-toggle input:checked + .cl-toggle-slider::after {
  transform: translateX(14px);
}

/* ── Rate card button + FFS panel ── */
.cl-ratecard-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #2e5d50;
  border-radius: 6px;
  background: #fff;
  color: #2e5d50;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.cl-ratecard-btn:hover { background: #f0fdf4; }
.cl-ratecard-btn.is-open { background: #2e5d50; color: #fff; }
.cl-ratecard-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #d1fae5;
  color: #065f46;
  font-size: 11px;
  font-weight: 700;
}
.cl-ratecard-btn.is-open .cl-ratecard-count { background: rgba(255,255,255,0.25); color: #fff; }
.cl-ratecard-na { color: #cbd5e1; }
.cl-expand-row td {
  padding: 0;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}
.cl-ffs-panel {
  padding: 14px 16px;
}
.cl-ffs-panel-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.cl-ffs-panel-head strong {
  font-size: 13px;
  color: #1e293b;
}
.cl-ffs-panel-hint {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
.cl-ffs-empty {
  font-size: 13px;
  color: #6b7280;
  font-style: italic;
  padding: 8px 0;
}
.cl-ffs-filter {
  max-width: 280px;
  margin-bottom: 10px;
}
.cl-ffs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.cl-ffs-code-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
}
.cl-ffs-code-label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 70px;
  flex-shrink: 0;
}
.cl-ffs-code {
  font-weight: 600;
  font-size: 13px;
  color: #334155;
}
.cl-ffs-code-cat {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #94a3b8;
}
.cl-ffs-code-cat.cat-direct { color: #2e5d50; }
.cl-ffs-code-cat.cat-indirect { color: #b45309; }
.cl-ffs-rate {
  flex: 1;
  min-width: 0;
}
.cl-ffs-unit {
  padding: 0 6px;
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}
</style>
