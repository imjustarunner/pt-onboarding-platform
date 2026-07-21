<template>
  <div class="ppc">
    <div class="ppc-head">
      <div>
        <div class="ppc-title">Compare &amp; Add Late Notes</div>
        <div class="ppc-hint">
          Same as Process Changes on the Payroll page, using the reports already uploaded in step 1.
          Section 1 = late notes to pay. Section 2 = persistent no-notes (still incomplete in the billing report).
        </div>
        <div v-if="destinationPeriodLabel" class="ppc-period">
          Destination (current): <strong>{{ destinationPeriodLabel }}</strong>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="reloadAll">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="destPosted" class="ppc-warn">
      The destination pay period is posted/finalized. Choose a different current period before applying late notes.
    </div>
    <div v-if="error" class="ppc-error">{{ error }}</div>
    <div v-if="loading && !sections.length" class="ppc-muted">Loading comparisons from uploaded runs…</div>

    <div v-for="sec in sections" :key="sec.key" class="ppc-card">
      <div class="ppc-card-title">{{ sec.title }}</div>
      <div class="ppc-muted">
        Source: <strong>{{ sec.periodLabel || '—' }}</strong>
        <span v-if="sec.baselineLabel"> · Baseline {{ sec.baselineLabel }}</span>
        <span v-if="sec.compareLabel"> · Compare {{ sec.compareLabel }}</span>
      </div>

      <div v-if="sec.missing" class="ppc-warn" style="margin-top: 8px;">{{ sec.missing }}</div>

      <template v-else>
        <!-- Section 1 — Late Add & Notes to be Paid (same as Process Changes) -->
        <div class="ppc-section ppc-section--ok" style="margin-top: 12px;">
          <div class="ppc-section-label">
            Section 1 — Late Add &amp; Notes to be Paid
            <span class="ppc-muted" style="font-weight: 400;">
              ({{ selectedCountFor(sec) }} of {{ sec.actionable.length }} selected)
            </span>
          </div>
          <div class="ppc-muted" style="margin: 6px 0 10px;">
            {{ sec.twoRunMode
              ? 'Late add: new in Run 2. Notes to be paid: no note or draft unpaid in Run 1 → finalized or draft in Run 2.'
              : 'Late add: new in Run 3. Notes to be paid: no note or draft unpaid in Run 2 → finalized or draft in Run 3.' }}
          </div>

          <div v-if="!sec.actionable.length" class="ppc-muted">No payable late-note differences for this period.</div>
          <template v-else>
            <div class="ppc-actions">
              <input
                v-model="sec.search"
                type="text"
                class="ppc-search"
                placeholder="Search provider, code, client, date…"
              />
              <button type="button" class="btn btn-secondary btn-sm" :disabled="applying" @click="selectAll(sec, true)">Select all</button>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="applying" @click="selectAll(sec, false)">Select none</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="applying || destPosted || !destinationPeriodId || selectedCountFor(sec) === 0"
                @click="applySection(sec)"
              >
                {{ applying && applyingKey === sec.key ? 'Adding…' : 'Add selected to current period' }}
              </button>
              <span v-if="sec.appliedCount != null" class="ppc-ok-inline">Added {{ sec.appliedCount }} row(s).</span>
            </div>
            <div class="ppc-table-wrap">
              <table class="ppc-table">
                <thead>
                  <tr>
                    <th style="width: 36px;"></th>
                    <th>Provider</th>
                    <th>Service</th>
                    <th>Client</th>
                    <th>DOS</th>
                    <th>From → To</th>
                    <th>Change</th>
                    <th>Type</th>
                    <th class="right">Units</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in filteredActionable(sec)"
                    :key="`${sec.key}-${c.rowMatchKey}`"
                    :style="rowAction(sec, c) === 'skip' ? { opacity: 0.5 } : {}"
                  >
                    <td>
                      <input
                        type="checkbox"
                        :checked="rowAction(sec, c) !== 'skip'"
                        @change="toggleRow(sec, c, $event.target.checked)"
                      />
                    </td>
                    <td>{{ c.provider_name || `User #${c.user_id}` }}</td>
                    <td>{{ c.to_service_code || c.from_service_code || '—' }}</td>
                    <td class="muted">{{ c.patient_first_name || '—' }}</td>
                    <td class="muted">{{ ymd(c.service_date) || '—' }}</td>
                    <td class="muted">{{ c.from_status || '—' }} → {{ c.to_status || '—' }}</td>
                    <td>{{ changeTypeLabel(c.changeType) }}</td>
                    <td><span class="badge" :class="typeBadgeClass(c)">{{ payableTypeBadge(c) }}</span></td>
                    <td class="right">
                      <input
                        type="number"
                        :value="rowUnits(sec, c)"
                        min="0"
                        step="0.01"
                        style="width: 80px; text-align: right;"
                        @input="setRowUnits(sec, c, $event.target.value)"
                      />
                    </td>
                  </tr>
                  <tr v-if="!filteredActionable(sec).length">
                    <td colspan="9" class="muted">No rows match this search.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <!-- Section 2 — Persistent No-Notes (same meaning as Process Changes) -->
        <div class="ppc-section ppc-section--warn" style="margin-top: 14px;">
          <div class="ppc-section-label ppc-section-label--warn">
            Section 2 — Persistent No-Notes
            <span class="ppc-muted" style="font-weight: 400;">({{ sec.persistentNoNotes.length }})</span>
          </div>
          <div class="ppc-muted" style="margin: 6px 0 10px;">
            {{ sec.twoRunMode
              ? 'No note in Run 1, still no note in Run 2. These are still incomplete in the billing report.'
              : 'No note in Run 2, still no note in Run 3. These are still incomplete in the billing report.' }}
            Add these to the current period so providers know what they’re missing.
          </div>

          <div v-if="!sec.persistentNoNotes.length" class="ppc-muted">
            No persistent no-notes for this compare.
          </div>
          <template v-else>
            <div class="ppc-actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="applying || destPosted || !destinationPeriodId"
                @click="applyPersistentNoNotes(sec)"
              >
                {{ applying && applyingKey === `${sec.key}-nonote` ? 'Adding…' : 'Add no-note to current period' }}
              </button>
              <span v-if="sec.noNoteAppliedCount != null" class="ppc-ok-inline">
                Added {{ sec.noNoteAppliedCount }} no-note group(s).
              </span>
            </div>
            <div class="ppc-table-wrap">
              <table class="ppc-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Service</th>
                    <th>Client</th>
                    <th>DOS</th>
                    <th class="right">{{ sec.twoRunMode ? 'Run 1 No Note' : 'Run 2 No Note' }}</th>
                    <th class="right">{{ sec.twoRunMode ? 'Run 2 No Note' : 'Run 3 No Note' }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in sec.persistentNoNotes" :key="`nn-${sec.key}-${f.rowKey}`">
                    <td>{{ f.providerName || `User #${f.userId}` }}</td>
                    <td>{{ f.serviceCode }}</td>
                    <td class="muted">{{ f.clientHint || '—' }}</td>
                    <td class="muted">{{ ymd(f.serviceDate) || '—' }}</td>
                    <td class="right">{{ fmtNum(f.baselineNoNoteUnits) }}</td>
                    <td class="right">{{ fmtNum(f.compareNoNoteUnits) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </template>
    </div>

    <div v-if="!loading && !sections.length && !error" class="ppc-warn">
      No prior-period Run 2 / Run 3 imports found yet. Go back to Upload Reports and upload those files first.
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  destinationPeriodId: { type: [Number, String], default: null },
  destinationPeriodLabel: { type: String, default: '' },
  destinationPeriodStatus: { type: String, default: '' },
  priorPeriodId: { type: [Number, String], default: null },
  priorPeriodLabel: { type: String, default: '' },
  twoAgoPeriodId: { type: [Number, String], default: null },
  twoAgoPeriodLabel: { type: String, default: '' }
});

const emit = defineEmits(['applied']);

const loading = ref(false);
const applying = ref(false);
const applyingKey = ref('');
const error = ref('');
const sections = ref([]);
/** selection[secKey][rowMatchKey] = { action, units } */
const selection = ref({});

const destPosted = computed(() => {
  const s = String(props.destinationPeriodStatus || '').toLowerCase();
  return s === 'posted' || s === 'finalized';
});

const ymd = (v) => {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};
const fmtNum = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const changeTypeLabel = (type) => {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'status_change') return 'Status changed';
  if (t === 'code_change') return 'Code changed';
  if (t === 'unit_change') return 'Units changed';
  if (t === 'added') return 'Added in selected run';
  if (t === 'removed') return 'Removed in selected run';
  if (t === 'location_changed') return 'Place of service changed';
  if (t === 'service_code_changed') return 'Service code changed';
  if (t === 'overpaid_deleted') return 'Overpaid—session deleted';
  return type || 'Changed';
};

const canAddAsCarryover = (c) => {
  const toStatus = String(c?.to_status || '').toUpperCase();
  const fromStatus = String(c?.from_status || '').toUpperCase();
  const toUnits = Number(c?.to_units || 0);
  const userId = Number(c?.user_id || 0);
  if (!userId || !(toUnits > 1e-9)) return false;
  if (toStatus === 'DRAFT_PAID') return true;
  if (toStatus === 'FINALIZED') {
    if (fromStatus === 'DRAFT_PAID') return false;
    return true;
  }
  return false;
};

const canAddAsReduction = (c) => {
  const changeType = String(c?.changeType || '').trim().toLowerCase();
  const fromUnits = Number(c?.from_units || 0);
  const userId = Number(c?.user_id || 0);
  return changeType === 'overpaid_deleted' && userId > 0 && fromUnits > 1e-9;
};

const defaultAction = (c) => {
  const changeType = String(c?.changeType || '').trim().toLowerCase();
  if (changeType === 'overpaid_deleted') return 'skip';
  if (changeType === 'location_changed' || changeType === 'service_code_changed' || changeType === 'code_change') return 'skip';
  if (canAddAsReduction(c)) return 'skip';
  return canAddAsCarryover(c) ? 'add' : 'skip';
};

const payableTypeBadge = (c) => {
  const changeType = String(c?.changeType || '').toLowerCase();
  if (changeType === 'overpaid_deleted') return 'Reduction';
  if (changeType === 'location_changed') return 'Review location';
  if (changeType === 'service_code_changed' || changeType === 'code_change') return 'Review code';
  if (changeType === 'added') return 'Added';
  const to = String(c?.to_status || '').toUpperCase();
  if (to === 'DRAFT_PAID') return 'Draft';
  return 'Finalized';
};

const typeBadgeClass = (c) => {
  const t = payableTypeBadge(c);
  if (t === 'Added') return 'badge-info';
  if (t === 'Draft') return 'badge-warning';
  if (t === 'Reduction' || t.startsWith('Review')) return 'badge-secondary';
  return 'badge-ok';
};

const importLabel = (imp) => {
  if (!imp) return '';
  const slot = Number(imp.slot_number || 0) || 1;
  const name = String(imp.original_filename || '').trim();
  return name ? `Run ${slot} (${name})` : `Run ${slot}`;
};

const findSlot = (list, slot) => (list || []).find((i) => Number(i.slot_number) === Number(slot)) || null;

const loadImports = async (periodId) => {
  if (!periodId) return [];
  try {
    const resp = await api.get(`/payroll/periods/${periodId}/imports`);
    return resp.data?.imports || [];
  } catch {
    return [];
  }
};

/** Same raw-audit endpoint Process Changes / Raw Import uses. */
const loadRawAudit = async (periodId, baselineImportId, compareImportId) => {
  const resp = await api.get(`/payroll/periods/${periodId}/raw-audit`, {
    params: { importId: compareImportId, baselineImportId }
  });
  return {
    changes: resp.data?.changes || [],
    compareRows: resp.data?.rows || []
  };
};

/** Load baseline import rows (second call — raw-audit returns selected import as rows). */
const loadImportRows = async (periodId, importId) => {
  if (!periodId || !importId) return [];
  const resp = await api.get(`/payroll/periods/${periodId}/raw-audit`, {
    params: { importId, baselineImportId: importId }
  });
  return resp.data?.rows || [];
};

const isNoNoteRow = (r) => {
  const st = String(r?.normalized_status || '').trim().toUpperCase();
  if (st === 'NO_NOTE') return true;
  // Blank / missing note status in billing → NO_NOTE after import
  if (!st) {
    const raw = String(r?.note_status || '').trim().toUpperCase();
    return !raw || raw === 'NO_NOTE';
  }
  return false;
};

/** Align with backend normalizeName / firstTokenForClient used by rowEntityKey. */
const normalizeName = (name) => String(name || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const firstTokenForClient = (name) => {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s.includes(',')) {
    const firstPart = s.split(',')[1];
    return String(firstPart ?? '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  }
  return s.split(/\s+/)[0]?.toLowerCase() || '';
};

/** Session key matching backend rowEntityKey (provider + date + code + client). */
const sessionKey = (r) => {
  const provider = normalizeName(r?.provider_name || '');
  const client = firstTokenForClient(r?.patient_first_name);
  const date = String(r?.service_date || '').slice(0, 10);
  const code = String(r?.service_code || '').trim().toUpperCase();
  return `${provider}:${date}:${code}:${client}`;
};

/**
 * Persistent No-Notes — same meaning as Process Changes Section 2 / batch-catch-up superFlag:
 * no note in baseline run, still no note in compare run.
 * Shown at session detail (client/DOS) so the wizard is as clear as the billing report.
 */
const buildPersistentNoNotes = (baselineRows, compareRows) => {
  const baseNoNote = new Map();
  for (const r of baselineRows || []) {
    if (!isNoNoteRow(r)) continue;
    const key = sessionKey(r);
    const units = Number(r.unit_count || 0);
    if (!(units > 1e-9)) continue;
    if (!baseNoNote.has(key)) {
      baseNoNote.set(key, {
        rowKey: key,
        userId: Number(r.user_id || 0),
        serviceCode: String(r.service_code || '').trim().toUpperCase(),
        providerName: r.provider_name || null,
        clientHint: r.patient_first_name || null,
        serviceDate: r.service_date || null,
        baselineNoNoteUnits: 0,
        compareNoNoteUnits: 0
      });
    }
    const t = baseNoNote.get(key);
    t.baselineNoNoteUnits = Number((t.baselineNoNoteUnits + units).toFixed(2));
    if (!t.userId && Number(r.user_id || 0)) t.userId = Number(r.user_id);
  }

  const out = [];
  for (const r of compareRows || []) {
    if (!isNoNoteRow(r)) continue;
    const key = sessionKey(r);
    const base = baseNoNote.get(key);
    if (!base) continue;
    const units = Number(r.unit_count || 0);
    if (!(units > 1e-9)) continue;
    base.compareNoNoteUnits = Number((base.compareNoNoteUnits + units).toFixed(2));
    if (!base.userId && Number(r.user_id || 0)) base.userId = Number(r.user_id);
    if (!base.providerName) base.providerName = r.provider_name || null;
  }

  for (const t of baseNoNote.values()) {
    if (t.compareNoNoteUnits > 1e-9 && t.baselineNoNoteUnits > 1e-9) out.push(t);
  }
  out.sort((a, b) =>
    String(a.providerName || '').localeCompare(String(b.providerName || ''))
    || String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''))
    || String(a.serviceDate || '').localeCompare(String(b.serviceDate || ''))
  );
  return out;
};

const initSelectionForSection = (sec) => {
  const sel = { ...(selection.value[sec.key] || {}) };
  for (const c of sec.actionable || []) {
    const k = c.rowMatchKey;
    if (!k) continue;
    if (!sel[k]) {
      sel[k] = {
        action: defaultAction(c),
        units: Number((c?.to_units ?? c?.from_units) || 0)
      };
    }
  }
  selection.value = { ...selection.value, [sec.key]: sel };
};

const rowAction = (sec, c) => {
  const s = selection.value[sec.key]?.[c.rowMatchKey];
  return s ? s.action : defaultAction(c);
};
const rowUnits = (sec, c) => {
  const s = selection.value[sec.key]?.[c.rowMatchKey];
  const def = Number((c?.to_units ?? c?.from_units) || 0);
  return s ? s.units : def;
};
const toggleRow = (sec, c, on) => {
  const k = c.rowMatchKey;
  const base = selection.value[sec.key]?.[k] || {
    action: defaultAction(c),
    units: Number((c?.to_units ?? c?.from_units) || 0)
  };
  const action = on ? (canAddAsReduction(c) ? 'reduction' : 'add') : 'skip';
  selection.value = {
    ...selection.value,
    [sec.key]: { ...(selection.value[sec.key] || {}), [k]: { ...base, action } }
  };
};
const setRowUnits = (sec, c, val) => {
  const k = c.rowMatchKey;
  const base = selection.value[sec.key]?.[k] || {
    action: defaultAction(c),
    units: Number((c?.to_units ?? c?.from_units) || 0)
  };
  selection.value = {
    ...selection.value,
    [sec.key]: {
      ...(selection.value[sec.key] || {}),
      [k]: { ...base, units: Math.max(0, Number(val) || 0) }
    }
  };
};
const selectAll = (sec, on) => {
  const next = { ...(selection.value[sec.key] || {}) };
  for (const c of sec.actionable || []) {
    const k = c.rowMatchKey;
    if (!k) continue;
    const base = next[k] || {
      action: defaultAction(c),
      units: Number((c?.to_units ?? c?.from_units) || 0)
    };
    next[k] = {
      ...base,
      action: on ? (canAddAsReduction(c) ? 'reduction' : 'add') : 'skip'
    };
  }
  selection.value = { ...selection.value, [sec.key]: next };
};
const selectedCountFor = (sec) => {
  const sel = selection.value[sec.key] || {};
  return (sec.actionable || []).filter((c) => String(sel[c.rowMatchKey]?.action || 'skip') !== 'skip').length;
};

const filteredActionable = (sec) => {
  const q = String(sec.search || '').trim().toLowerCase();
  const rows = sec.actionable || [];
  if (!q) return rows;
  return rows.filter((c) => {
    const prov = String(c.provider_name || '').toLowerCase();
    const code = String(c.to_service_code || c.from_service_code || '').toLowerCase();
    const client = String(c.patient_first_name || '').toLowerCase();
    const date = String(ymd(c.service_date) || '').toLowerCase();
    const change = String(changeTypeLabel(c.changeType) || '').toLowerCase();
    const type = String(payableTypeBadge(c) || '').toLowerCase();
    const from = String(c.from_status || '').toLowerCase();
    const to = String(c.to_status || '').toLowerCase();
    return prov.includes(q) || code.includes(q) || client.includes(q) || date.includes(q)
      || change.includes(q) || type.includes(q) || from.includes(q) || to.includes(q);
  });
};

const carryoverMeta = (c, units) => {
  const changeType = String(c?.changeType || '').trim().toLowerCase();
  const safeUnits = Number(units || 0);
  const categories = {
    old_note: { units: 0, notes: 0 },
    late_addition: { units: 0, notes: 0 },
    code_changed: { units: 0, notes: 0, fromCodes: [] }
  };
  if (changeType === 'service_code_changed' || changeType === 'code_change') {
    categories.code_changed.units = safeUnits;
    categories.code_changed.notes = 1;
    categories.code_changed.fromCodes = [String(c?.from_service_code || '').trim()].filter(Boolean);
  } else {
    categories.late_addition.units = safeUnits;
    categories.late_addition.notes = 1;
  }
  return {
    categories,
    rawAuditRows: [{
      rowMatchKey: c?.rowMatchKey || null,
      changeType,
      fromServiceCode: c?.from_service_code || null,
      toServiceCode: c?.to_service_code || null,
      providerName: c?.provider_name || null,
      patientFirstName: c?.patient_first_name || null,
      serviceDate: c?.service_date || null,
      fromStatus: c?.from_status || null,
      toStatus: c?.to_status || null,
      fromLocation: c?.metadata_json?.fromLocation || null,
      toLocation: c?.metadata_json?.toLocation || null,
      clientPaidAmount: Number(c?.client_paid_amount || 0) || null
    }]
  };
};

/** Same as PayrollView applyRawAddToCurrentPeriod. */
const applySection = async (sec) => {
  const destId = props.destinationPeriodId;
  if (!destId || !sec?.sourcePeriodId) return;
  const sel = selection.value[sec.key] || {};
  const rowsToApply = [];
  for (const c of sec.actionable || []) {
    const action = String(sel[c.rowMatchKey]?.action || 'skip');
    if (action === 'skip') continue;
    const units = rowUnits(sec, c);
    if (!(units > 1e-9)) continue;
    const userId = Number(c?.user_id || 0);
    if (!userId) continue;
    const serviceCode = String(c?.to_service_code || c?.from_service_code || '').trim();
    if (!serviceCode) continue;
    if (action === 'reduction') {
      rowsToApply.push({
        actionType: 'reduction',
        userId,
        serviceCode,
        units: Number(units.toFixed(2)),
        rowMatchKey: c?.rowMatchKey || null,
        providerName: c?.provider_name || null,
        patientFirstName: c?.patient_first_name || null,
        serviceDate: c?.service_date || null,
        fromStatus: c?.from_status || null,
        location: c?.metadata_json?.fromLocation || c?.metadata_json?.toLocation || null,
        baselineRowId: c?.metadata_json?.baselineRowId || null,
        compareRowId: c?.metadata_json?.compareRowId || null
      });
    } else {
      rowsToApply.push({
        actionType: 'add',
        userId,
        serviceCode,
        rowMatchKey: c?.rowMatchKey || null,
        carryoverFinalizedUnits: Number(units.toFixed(2)),
        carryoverFinalizedRowCount: 1,
        carryoverMeta: carryoverMeta(c, units)
      });
    }
  }
  if (!rowsToApply.length) return;

  applying.value = true;
  applyingKey.value = sec.key;
  error.value = '';
  try {
    await api.post(`/payroll/periods/${destId}/raw-audit-actions/apply`, {
      sourcePayrollPeriodId: sec.sourcePeriodId,
      rows: rowsToApply
    });
    sec.appliedCount = rowsToApply.length;
    emit('applied', { destinationPeriodId: destId, count: rowsToApply.length, section: sec.key });
    await reloadSection(sec);
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || '';
    if (e?.response?.status === 409 && /H0031|H0032|H2014|H2032|90853/.test(String(msg))) {
      const ok = window.confirm(
        'Carryover is blocked by H0031/H0032/H2014/H2032/90853 processing. Apply anyway (skip processing gate)?'
      );
      if (ok) {
        await api.post(
          `/payroll/periods/${destId}/raw-audit-actions/apply`,
          { sourcePayrollPeriodId: sec.sourcePeriodId, rows: rowsToApply },
          { params: { skipProcessingGate: 'true' } }
        );
        sec.appliedCount = rowsToApply.length;
        emit('applied', { destinationPeriodId: destId, count: rowsToApply.length, section: sec.key });
        await reloadSection(sec);
      } else {
        error.value = msg;
      }
    } else {
      error.value = msg || 'Failed to add to current period';
    }
  } finally {
    applying.value = false;
    applyingKey.value = '';
  }
};

/**
 * Same as PayrollView applyStillNoNoteToPeriod → PUT prior-unpaid.
 * Aggregates session-level persistent no-notes by userId + serviceCode.
 */
const applyPersistentNoNotes = async (sec) => {
  const destId = props.destinationPeriodId;
  if (!destId || !sec?.sourcePeriodId) return;
  const byUserCode = new Map();
  for (const f of sec.persistentNoNotes || []) {
    const userId = Number(f.userId || 0);
    const serviceCode = String(f.serviceCode || '').trim();
    const units = Number(f.compareNoNoteUnits || 0);
    if (!userId || !serviceCode || !(units > 1e-9)) continue;
    const k = `${userId}:${serviceCode.toUpperCase()}`;
    if (!byUserCode.has(k)) byUserCode.set(k, { userId, serviceCode, stillUnpaidUnits: 0 });
    const t = byUserCode.get(k);
    t.stillUnpaidUnits = Number((t.stillUnpaidUnits + units).toFixed(2));
  }
  const rows = Array.from(byUserCode.values());
  if (!rows.length) {
    error.value = 'No matched providers to add for persistent no-notes (check provider matching on those import rows).';
    return;
  }

  applying.value = true;
  applyingKey.value = `${sec.key}-nonote`;
  error.value = '';
  try {
    await api.put(`/payroll/periods/${destId}/prior-unpaid`, {
      sourcePayrollPeriodId: sec.sourcePeriodId,
      rows
    });
    sec.noNoteAppliedCount = rows.length;
    emit('applied', { destinationPeriodId: destId, count: rows.length, section: `${sec.key}-nonote` });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to add still no-note';
  } finally {
    applying.value = false;
    applyingKey.value = '';
  }
};

const buildSection = async ({
  key,
  title,
  periodId,
  periodLabel,
  baselineSlot,
  compareSlot,
  twoRunMode
}) => {
  if (!periodId) {
    return {
      key,
      title,
      periodLabel,
      sourcePeriodId: null,
      twoRunMode,
      search: '',
      missing: 'No period selected.',
      actionable: [],
      persistentNoNotes: [],
      baselineLabel: '',
      compareLabel: '',
      appliedCount: null,
      noNoteAppliedCount: null
    };
  }
  const imports = await loadImports(periodId);
  const baseline = findSlot(imports, baselineSlot);
  const compare = findSlot(imports, compareSlot);
  if (!baseline || !compare) {
    const need = !baseline && !compare
      ? `Need Run ${baselineSlot} and Run ${compareSlot} uploaded first (Upload Reports step).`
      : !baseline
        ? `Need Run ${baselineSlot} in DB before comparing.`
        : `Need Run ${compareSlot} uploaded first (Upload Reports step).`;
    return {
      key,
      title,
      periodLabel,
      sourcePeriodId: periodId,
      twoRunMode,
      search: '',
      missing: need,
      actionable: [],
      persistentNoNotes: [],
      baselineLabel: importLabel(baseline),
      compareLabel: importLabel(compare),
      appliedCount: null,
      noNoteAppliedCount: null
    };
  }

  const [audit, baselineRows] = await Promise.all([
    loadRawAudit(periodId, baseline.id, compare.id),
    loadImportRows(periodId, baseline.id)
  ]);
  const changes = audit.changes || [];
  const compareRows = audit.compareRows || [];
  const actionable = changes.filter((c) => canAddAsCarryover(c) || canAddAsReduction(c));
  const persistentNoNotes = buildPersistentNoNotes(baselineRows, compareRows);

  const sec = {
    key,
    title,
    periodLabel,
    sourcePeriodId: periodId,
    twoRunMode,
    search: '',
    missing: null,
    actionable,
    persistentNoNotes,
    baselineLabel: importLabel(baseline),
    compareLabel: importLabel(compare),
    appliedCount: null,
    noNoteAppliedCount: null
  };
  initSelectionForSection(sec);
  return sec;
};

const reloadSection = async (sec) => {
  const rebuilt = await buildSection({
    key: sec.key,
    title: sec.title,
    periodId: sec.sourcePeriodId,
    periodLabel: sec.periodLabel,
    baselineSlot: sec.key === 'prior' ? 1 : 2,
    compareSlot: sec.key === 'prior' ? 2 : 3,
    twoRunMode: sec.twoRunMode
  });
  rebuilt.appliedCount = sec.appliedCount;
  rebuilt.noNoteAppliedCount = sec.noNoteAppliedCount;
  rebuilt.search = sec.search || '';
  sections.value = sections.value.map((s) => (s.key === sec.key ? rebuilt : s));
};

const reloadAll = async () => {
  loading.value = true;
  error.value = '';
  try {
    const next = [];
    if (props.priorPeriodId) {
      next.push(await buildSection({
        key: 'prior',
        title: 'Prior period — Run 2 vs Run 1',
        periodId: props.priorPeriodId,
        periodLabel: props.priorPeriodLabel,
        baselineSlot: 1,
        compareSlot: 2,
        twoRunMode: true
      }));
    }
    if (props.twoAgoPeriodId) {
      next.push(await buildSection({
        key: 'twoAgo',
        title: 'Two periods ago — Run 3 vs Run 2',
        periodId: props.twoAgoPeriodId,
        periodLabel: props.twoAgoPeriodLabel,
        baselineSlot: 2,
        compareSlot: 3,
        twoRunMode: false
      }));
    }
    sections.value = next;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load comparisons';
    sections.value = [];
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.priorPeriodId, props.twoAgoPeriodId, props.destinationPeriodId],
  () => { reloadAll(); }
);

onMounted(() => {
  reloadAll();
});
</script>

<style scoped>
.ppc { display: flex; flex-direction: column; gap: 14px; }
.ppc-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.ppc-title { font-weight: 700; font-size: 1.05rem; }
.ppc-hint { color: var(--muted, #667085); font-size: 0.9rem; margin-top: 4px; line-height: 1.4; }
.ppc-period { margin-top: 8px; font-size: 0.9rem; }
.ppc-card {
  border: 1px solid var(--border, #e4e7ec);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--surface, #fff);
}
.ppc-card-title { font-weight: 650; margin-bottom: 4px; }
.ppc-section {
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border, #e4e7ec);
}
.ppc-section--ok { border-left: 4px solid #1E3A34; }
.ppc-section--warn { border-left: 4px solid #e53e3e; background: #fffafa; }
.ppc-section-label { font-weight: 650; font-size: 0.95rem; }
.ppc-section-label--warn { color: #c53030; }
.ppc-muted { color: var(--muted, #667085); font-size: 0.88rem; }
.ppc-warn {
  background: #fff8e6;
  border: 1px solid #f0d78c;
  color: #7a5b00;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.ppc-error {
  background: #fef3f2;
  border: 1px solid #fecdca;
  color: #b42318;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.ppc-ok-inline {
  color: #13532b;
  font-size: 0.88rem;
  font-weight: 600;
}
.ppc-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
.ppc-search {
  min-width: 220px;
  max-width: 320px;
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border, #d0d5dd);
  border-radius: 6px;
  font-size: 0.9rem;
}
.ppc-table-wrap { overflow: auto; border: 1px solid var(--border, #e4e7ec); border-radius: 8px; }
.ppc-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.ppc-table th, .ppc-table td { padding: 8px 10px; border-bottom: 1px solid var(--border, #eef0f4); text-align: left; }
.ppc-table th.right, .ppc-table td.right { text-align: right; }
.ppc-table .muted { color: var(--muted, #667085); }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: #f2f4f7;
  color: #344054;
}
.badge-info { background: #eff8ff; color: #175cd3; }
.badge-warning { background: #fffaeb; color: #b54708; }
.badge-secondary { background: #f4f3ff; color: #5925dc; }
.badge-ok { background: #ecfdf3; color: #027a48; }
</style>
