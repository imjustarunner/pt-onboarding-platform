<template>
  <div class="cl-wrap">
    <div class="cl-header">
      <div>
        <h4 class="cl-title">Compensation Levels</h4>
        <p class="cl-sub">Define rates for each category and level. Assign providers a category + level from their Payroll tab to apply the rates automatically.</p>
      </div>
      <div class="cl-header-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="fetch">Refresh</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving || loading" @click="saveAll">
          {{ saving ? 'Saving…' : 'Save all' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-bottom: 12px;">{{ error }}</div>
    <div v-if="saveSuccess" class="save-success">Compensation levels saved.</div>

    <div v-if="loading" class="cl-loading">Loading…</div>

    <div v-else class="cl-categories">
      <div v-for="cat in CATEGORIES" :key="cat.id" class="cl-category">
        <div class="cl-cat-header">
          <div class="cl-cat-badge">Category {{ cat.id }}</div>
          <div class="cl-cat-info">
            <strong>{{ cat.label }}</strong>
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
                <th class="col-rate">FFS Rate ($/unit)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="lvl in 5" :key="lvl" class="cl-row">
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
                <td class="col-rate">
                  <div class="cl-rate-input" :class="{ 'cl-rate-input--disabled': !draft[cat.id][lvl].hasFfs }">
                    <span class="cl-prefix">$</span>
                    <input
                      v-model.number="draft[cat.id][lvl].ffsRate"
                      type="number"
                      min="0"
                      step="0.01"
                      class="cl-input cl-input--rate"
                      placeholder="0.00"
                      :disabled="!draft[cat.id][lvl].hasFfs"
                    />
                  </div>
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
import { ref, watch } from 'vue';
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

const applyLevels = (levels) => {
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
};

const fetch = async () => {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/payroll/compensation-levels', { params: { agencyId: props.agencyId } });
    applyLevels(res.data?.levels || []);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load compensation levels';
  } finally {
    loading.value = false;
  }
};

const saveAll = async () => {
  if (!props.agencyId) return;
  saving.value = true;
  error.value = '';
  saveSuccess.value = false;
  try {
    const levels = [];
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
      }
    }
    const res = await api.put('/payroll/compensation-levels', { agencyId: props.agencyId, levels });
    applyLevels(res.data?.levels || []);
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save compensation levels';
  } finally {
    saving.value = false;
  }
};

watch(() => props.agencyId, () => fetch(), { immediate: true });
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
  gap: 1px;
}
.cl-cat-info strong {
  font-size: 14px;
}
.cl-cat-desc {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
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
.cl-row:last-child {
  border-bottom: none;
}
.cl-row td {
  padding: 8px 10px;
  vertical-align: middle;
}
.col-level { width: 90px; }
.col-label { min-width: 160px; }
.col-rate { width: 140px; }
.col-ffs-toggle { width: 60px; text-align: center; }
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
.cl-rate-input--disabled {
  background: #f9fafb;
  opacity: 0.5;
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
</style>
