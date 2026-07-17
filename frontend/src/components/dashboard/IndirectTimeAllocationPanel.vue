<template>
  <section class="iap itl-card" aria-labelledby="iap-heading">
    <div class="iap-head">
      <h3 id="iap-heading" class="itl-section-title">Allocate Your Time</h3>
      <div class="itl-total-chip">Total Time: {{ formatHm(totalMinutes) }}</div>
    </div>

    <!-- Direct / indirect goal reminder -->
    <aside class="iap-ratio" :data-kind="ratioKind" aria-label="Direct to indirect time goals">
      <div class="iap-ratio-title">Direct ↔ indirect goals</div>
      <p class="iap-ratio-body">
        Aim for <strong>≤{{ GREEN_PCT }}%</strong> indirect relative to direct
        (≤{{ GREEN_MIN }} min indirect per hour of direct).
        Flagged at <strong>≥{{ RED_PCT }}%</strong>
        (≥{{ RED_MIN }} min per hour).
      </p>
      <p v-if="totalMinutes > 0" class="iap-ratio-calc">
        For this block ({{ formatHm(totalMinutes) }} indirect), plan about
        <strong>{{ formatHm(directForGreen) }}</strong> of direct time to stay in goal,
        or at least <strong>{{ formatHm(directForAvoidRed) }}</strong> to stay under the red band.
      </p>
      <p v-if="recentRatioLabel" class="iap-ratio-recent">
        Your recent ratio: <strong :data-kind="ratioKind">{{ recentRatioLabel }}</strong>
        <span v-if="recentPeriodLabel"> ({{ recentPeriodLabel }})</span>
      </p>
    </aside>

    <!-- This-or-that entry mode -->
    <div class="iap-modes" role="radiogroup" aria-label="How to enter allocation time">
      <button
        type="button"
        role="radio"
        class="iap-mode"
        :class="{ selected: allocationMode === 'start_end' }"
        :aria-checked="allocationMode === 'start_end'"
        @click="setMode('start_end')"
      >
        <span class="iap-mode-label">Start &amp; end</span>
        <span class="iap-mode-hint">Times for each activity</span>
      </button>
      <button
        type="button"
        role="radio"
        class="iap-mode"
        :class="{ selected: allocationMode === 'duration' }"
        :aria-checked="allocationMode === 'duration'"
        @click="setMode('duration')"
      >
        <span class="iap-mode-label">Time spent</span>
        <span class="iap-mode-hint">Duration (HH:MM)</span>
      </button>
      <button
        type="button"
        role="radio"
        class="iap-mode"
        :class="{ selected: allocationMode === 'percent' }"
        :aria-checked="allocationMode === 'percent'"
        @click="setMode('percent')"
      >
        <span class="iap-mode-label">Percentage</span>
        <span class="iap-mode-hint">Auto-calculates time</span>
      </button>
    </div>

    <p class="iap-order-hint">
      Drag to order activities first → last.
      First start is clock-in ({{ sessionStartHm || '—' }}).
      Last end is
      <template v-if="sessionEndIsLive">
        live now ({{ sessionEndHm || '—' }}) and advances each minute until you clock out.
      </template>
      <template v-else>
        clock-out ({{ sessionEndHm || '—' }}).
      </template>
      Duplicate a row if you did the same activity more than once.
    </p>

    <p class="iap-notes-hint" role="note">
      Suggested: add a short note for each activity (what you did). Notes help payroll review and are optional — you’ll be asked to confirm if any are left blank.
    </p>

    <div class="iap-table-wrap">
      <div class="iap-table-head" :class="`iap-cols--${allocationMode}`">
        <span class="iap-th iap-th-drag" aria-hidden="true" />
        <span class="iap-th">#</span>
        <span class="iap-th">Service type</span>
        <template v-if="allocationMode === 'start_end'">
          <span class="iap-th">Start</span>
          <span class="iap-th">End</span>
          <span class="iap-th">Duration</span>
        </template>
        <template v-else-if="allocationMode === 'duration'">
          <span class="iap-th">Time (HH:MM)</span>
        </template>
        <template v-else>
          <span class="iap-th">%</span>
          <span class="iap-th">Time</span>
        </template>
        <span class="iap-th iap-th-actions"><span class="sr-only">Actions</span></span>
      </div>

      <!-- vue-draggable-next in this app renders the default slot (v-for), not #item -->
      <draggable
        v-model="rows"
        handle=".iap-drag"
        :animation="180"
        tag="div"
        class="iap-rows"
        @end="onReorder"
      >
        <div
          v-for="(row, index) in rows"
          :key="row.id"
          class="iap-row"
          :class="[
            `iap-cols--${allocationMode}`,
            { 'iap-row--error': rowHasError(row, index) }
          ]"
        >
          <button type="button" class="iap-drag" aria-label="Drag to reorder" title="Drag to reorder">
            <span class="iap-drag-icon" aria-hidden="true">☰</span>
          </button>
          <span class="iap-ord">{{ index + 1 }}</span>
          <span class="iap-label">{{ row.label }}</span>

          <template v-if="allocationMode === 'start_end'">
            <input
              v-model="row.startTime"
              type="time"
              class="iap-input"
              :disabled="index === 0"
              :aria-label="`Start time for ${row.label}`"
              @change="onStartEndChange(index)"
            />
            <input
              v-model="row.endTime"
              type="time"
              class="iap-input"
              :disabled="index === rows.length - 1"
              :aria-label="index === rows.length - 1 && sessionEndIsLive
                ? `End time for ${row.label} (current time, updates until clock out)`
                : `End time for ${row.label}`"
              @change="onStartEndChange(index)"
            />
            <span class="iap-derived">{{ formatHm(rowMinutes(row)) }}</span>
          </template>

          <template v-else-if="allocationMode === 'duration'">
            <input
              v-model="row.hhmm"
              type="text"
              class="iap-input iap-hhmm"
              inputmode="numeric"
              placeholder="00:00"
              :aria-label="`Time for ${row.label}`"
              @blur="onDurationBlur(row, index)"
              @input="onDurationInput"
            />
          </template>

          <template v-else>
            <div class="iap-pct-wrap">
              <input
                v-model.number="row.percent"
                type="number"
                class="iap-input iap-pct"
                min="0"
                max="100"
                step="1"
                :aria-label="`Percent for ${row.label}`"
                @change="onPercentChange"
              />
              <span aria-hidden="true">%</span>
            </div>
            <span class="iap-derived">{{ formatHm(rowMinutes(row)) }}</span>
          </template>

          <div class="iap-actions">
            <button
              type="button"
              class="iap-text-btn"
              :aria-label="`Duplicate ${row.label}`"
              @click="duplicateRow(index)"
            >
              Duplicate
            </button>
            <button
              type="button"
              class="iap-text-btn iap-text-btn--danger"
              :aria-label="`Remove ${row.label}`"
              @click="removeRow(index)"
            >
              Remove
            </button>
          </div>

          <label class="iap-note-field">
            <span class="iap-note-label">
              Activity note
              <em v-if="!(row.note || '').trim()" class="iap-note-optional">(suggested)</em>
            </span>
            <textarea
              v-model="row.note"
              class="iap-note-input"
              rows="2"
              maxlength="1000"
              :placeholder="`What did you do for ${row.label}?`"
              :aria-label="`Note for ${row.label}`"
            />
          </label>
        </div>
      </draggable>
      <p v-if="sessionEndIsLive && rows.length && allocationMode === 'start_end'" class="iap-live-note">
        Last row end time is locked to <strong>now ({{ sessionEndHm }})</strong> and updates each minute until you clock out.
      </p>
      <p v-if="!rows.length" class="iap-empty-rows">
        Select service types above to add allocation rows here.
      </p>
    </div>

    <div class="iap-footer">
      <button
        v-if="addableTypes.length"
        type="button"
        class="itl-link-btn"
        @click="showAddPicker = !showAddPicker"
      >
        + Add Another Service Type
      </button>
      <div class="iap-totals">
        <span v-if="allocationMode === 'percent'">
          Allocated:
          <strong :class="{ 'iap-bad': allocatedPercent !== 100 }">{{ allocatedPercent }}%</strong>
          ·
        </span>
        Allocated time:
        <strong :class="{ 'iap-bad': !totalsMatch && totalMinutes > 0 }">
          {{ formatHm(allocatedMinutes) }}
        </strong>
        <span v-if="totalMinutes > 0" class="iap-remain">
          · Remaining:
          <strong :class="{ 'iap-bad': remainingMinutes < 0, 'iap-ok': remainingMinutes === 0 }">
            {{ formatHm(Math.abs(remainingMinutes)) }}{{ remainingMinutes < 0 ? ' over' : '' }}
          </strong>
        </span>
      </div>
    </div>

    <div v-if="showAddPicker && addableTypes.length" class="iap-add-picker">
      <button
        v-for="t in addableTypes"
        :key="t.id"
        type="button"
        class="iap-chip"
        @click="addType(t); showAddPicker = false"
      >
        {{ t.label }}
      </button>
    </div>

    <ul v-if="validationMessages.length" class="iap-alerts" role="alert">
      <li v-for="(msg, i) in validationMessages" :key="i">{{ msg }}</li>
    </ul>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { VueDraggableNext as draggable } from 'vue-draggable-next';
import IndirectTimeIcon from './IndirectTimeIcon.vue';
import {
  DIRECT_INDIRECT_GREEN_MAX_MINUTES,
  DIRECT_INDIRECT_RED_MIN_MINUTES,
  DIRECT_INDIRECT_GREEN_MAX_PCT,
  DIRECT_INDIRECT_RED_MIN_PCT,
  directMinutesForGreen,
  directMinutesForAvoidRed,
  directIndirectRatioKindFromRatio
} from '../../utils/directIndirectRatioBands.js';

const props = defineProps({
  totalMinutes: { type: Number, default: 0 },
  /** Session / claim start as HH:MM in display timezone */
  sessionStartHm: { type: String, default: '' },
  /** Session / claim end as HH:MM in display timezone */
  sessionEndHm: { type: String, default: '' },
  /** When true, session end is "now" and ticks while still clocked in */
  sessionEndIsLive: { type: Boolean, default: false },
  serviceTypes: { type: Array, default: () => [] },
  /** Selected type ids from the type grid (adds missing rows, removes types fully unchecked) */
  selectedTypeIds: { type: Array, default: () => [] },
  /** Optional recent ratio from dashboard-summary (indirect/direct) */
  recentRatio: { type: Number, default: null },
  recentPeriodLabel: { type: String, default: '' }
});

const emit = defineEmits(['update:selectedTypeIds', 'validity']);

const GREEN_MIN = DIRECT_INDIRECT_GREEN_MAX_MINUTES;
const RED_MIN = DIRECT_INDIRECT_RED_MIN_MINUTES;
const GREEN_PCT = DIRECT_INDIRECT_GREEN_MAX_PCT;
const RED_PCT = DIRECT_INDIRECT_RED_MIN_PCT;

const allocationMode = ref('duration');
const rows = ref([]);
const showAddPicker = ref(false);
let rowSeq = 1;

const directForGreen = computed(() => directMinutesForGreen(props.totalMinutes));
const directForAvoidRed = computed(() => directMinutesForAvoidRed(props.totalMinutes));
const ratioKind = computed(() => directIndirectRatioKindFromRatio(props.recentRatio));
const recentRatioLabel = computed(() => {
  if (props.recentRatio == null || !Number.isFinite(props.recentRatio)) return '';
  return `${Math.round(props.recentRatio * 1000) / 10}%`;
});

function formatHm(mins) {
  const m = Math.max(0, Math.floor(Number(mins) || 0));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseHhmm(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Minutes since midnight; supports overnight by optional +24h when end ≤ start. */
function hmToMinutes(hm) {
  const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesToHm(total) {
  let t = ((Number(total) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = String(Math.floor(t / 60)).padStart(2, '0');
  const mm = String(t % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function durationBetween(startHm, endHm) {
  const a = hmToMinutes(startHm);
  const b = hmToMinutes(endHm);
  if (a == null || b == null) return 0;
  // Same minute → zero duration (do not treat as overnight).
  if (b === a) return 0;
  let end = b;
  // Only roll overnight when end is strictly before start.
  if (end < a) end += 24 * 60;
  return end - a;
}

function makeRow(t, extras = {}) {
  return {
    id: `ar-${rowSeq++}`,
    typeId: t.id,
    typeKey: t.typeKey,
    label: t.label,
    startTime: extras.startTime || props.sessionStartHm || '09:00',
    endTime: extras.endTime || props.sessionEndHm || '17:00',
    hhmm: extras.hhmm || '00:00',
    percent: extras.percent ?? 0,
    note: extras.note != null ? String(extras.note) : ''
  };
}

function rowMinutes(row) {
  if (allocationMode.value === 'start_end') {
    return durationBetween(row.startTime, row.endTime);
  }
  if (allocationMode.value === 'percent') {
    const total = Math.max(0, props.totalMinutes);
    const pct = Math.max(0, Number(row.percent) || 0);
    return Math.floor((total * pct) / 100);
  }
  return parseHhmm(row.hhmm) || 0;
}

const allocatedMinutes = computed(() => {
  if (allocationMode.value === 'percent') {
    // Use remainder-aware distribution so sum matches total when % = 100
    return percentDerivedMinutes().reduce((s, m) => s + m, 0);
  }
  return rows.value.reduce((sum, r) => sum + rowMinutes(r), 0);
});

const allocatedPercent = computed(() =>
  rows.value.reduce((sum, r) => sum + (Math.max(0, Number(r.percent) || 0)), 0)
);

const remainingMinutes = computed(() => props.totalMinutes - allocatedMinutes.value);
const totalsMatch = computed(() => {
  if (!(props.totalMinutes >= 1) || !rows.value.length) return false;
  if (allocationMode.value === 'percent') return allocatedPercent.value === 100;
  return allocatedMinutes.value === props.totalMinutes;
});

const addableTypes = computed(() => props.serviceTypes || []);

function percentDerivedMinutes() {
  const total = Math.max(0, props.totalMinutes);
  const list = rows.value;
  if (!list.length || !(total >= 1)) return list.map(() => 0);
  const raw = list.map((r) => (total * Math.max(0, Number(r.percent) || 0)) / 100);
  const floors = raw.map((n) => Math.floor(n));
  const pctSum = list.reduce((s, r) => s + Math.max(0, Number(r.percent) || 0), 0);
  // Only force exact total when percentages sum to 100.
  if (pctSum !== 100) return floors;
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((n, i) => ({ i, frac: n - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (rem <= 0) break;
    out[i] += 1;
    rem -= 1;
  }
  return out;
}

function syncPercentsFromMinutes() {
  const total = props.totalMinutes;
  if (!(total >= 1) || !rows.value.length) return;
  let assigned = 0;
  rows.value.forEach((r, i) => {
    const mins = parseHhmm(r.hhmm) || 0;
    if (i === rows.value.length - 1) {
      r.percent = Math.max(0, 100 - assigned);
    } else {
      const pct = Math.round((mins / total) * 100);
      r.percent = pct;
      assigned += pct;
    }
  });
}

function applyDurationTimeline() {
  const start = hmToMinutes(props.sessionStartHm);
  if (start == null || !rows.value.length) return;
  let cursor = start;
  for (const r of rows.value) {
    const mins = parseHhmm(r.hhmm) || 0;
    r.startTime = minutesToHm(cursor);
    cursor += mins;
    r.endTime = minutesToHm(cursor);
  }
  // Force last end to session end when totals match
  if (props.sessionEndHm && allocatedMinutes.value === props.totalMinutes) {
    rows.value[rows.value.length - 1].endTime = props.sessionEndHm;
  }
}

/** Evenly place activity boundaries between session start and end. */
function splitTimelineEvenly() {
  const n = rows.value.length;
  const startHm = props.sessionStartHm;
  const endHm = props.sessionEndHm;
  if (!n || !startHm || !endHm) return;
  const startM = hmToMinutes(startHm);
  let endM = hmToMinutes(endHm);
  if (startM == null || endM == null) return;
  if (endM < startM) endM += 24 * 60;
  if (endM === startM) {
    for (const r of rows.value) {
      r.startTime = startHm;
      r.endTime = endHm;
      r.hhmm = '00:00';
    }
    return;
  }
  const span = endM - startM;
  const base = Math.floor(span / n);
  let rem = span - base * n;
  let cursor = startM;
  for (let i = 0; i < n; i++) {
    const mins = Math.max(0, base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem -= 1;
    rows.value[i].startTime = minutesToHm(cursor);
    cursor += mins;
    rows.value[i].endTime = minutesToHm(cursor);
    rows.value[i].hhmm = formatHm(mins);
  }
  rows.value[0].startTime = startHm;
  rows.value[n - 1].endTime = endHm;
  rows.value[n - 1].hhmm = formatHm(
    durationBetween(rows.value[n - 1].startTime, rows.value[n - 1].endTime)
  );
}

/**
 * Pin first start + last end to session bounds.
 * While still clocked in, last end tracks live "now" and grows each minute.
 * forceSplit evenly redistributes when rows are first added.
 */
function applyAnchors({ forceSplit = false } = {}) {
  if (!rows.value.length) return;
  const startHm = props.sessionStartHm;
  const endHm = props.sessionEndHm;
  if (!startHm || !endHm) return;

  if (forceSplit) {
    splitTimelineEvenly();
    syncPercentsFromMinutes();
    return;
  }

  if (rows.value.length === 1) {
    rows.value[0].startTime = startHm;
    rows.value[0].endTime = endHm;
    rows.value[0].hhmm = formatHm(durationBetween(startHm, endHm));
    syncPercentsFromMinutes();
    return;
  }

  // Preserve user-edited middle boundaries; always pin session ends.
  rows.value[0].startTime = startHm;
  for (let i = 0; i < rows.value.length - 1; i++) {
    if (rows.value[i].endTime) {
      rows.value[i + 1].startTime = rows.value[i].endTime;
    }
  }
  // Last activity always ends at session end (live "now" or clock-out).
  const last = rows.value[rows.value.length - 1];
  last.endTime = endHm;

  // If last would be zero-length, reclaim 1 minute from the previous activity when possible.
  if (durationBetween(last.startTime, last.endTime) < 1 && rows.value.length >= 2) {
    const prev = rows.value[rows.value.length - 2];
    const endM = hmToMinutes(endHm);
    const startM = hmToMinutes(startHm);
    const prevStart = hmToMinutes(prev.startTime);
    if (endM != null && startM != null && prevStart != null) {
      let endAbs = endM < startM ? endM + 24 * 60 : endM;
      if (endAbs - prevStart >= 2) {
        prev.endTime = minutesToHm(endAbs - 1);
        last.startTime = prev.endTime;
      }
    }
  }

  for (const r of rows.value) {
    r.hhmm = formatHm(durationBetween(r.startTime, r.endTime));
  }
  syncPercentsFromMinutes();
}

function setMode(mode) {
  if (allocationMode.value === mode) return;
  // Sync derived fields before switching
  if (allocationMode.value === 'start_end') {
    for (const r of rows.value) r.hhmm = formatHm(durationBetween(r.startTime, r.endTime));
    syncPercentsFromMinutes();
  } else if (allocationMode.value === 'duration') {
    applyDurationTimeline();
    syncPercentsFromMinutes();
  } else {
    const mins = percentDerivedMinutes();
    rows.value.forEach((r, i) => {
      r.hhmm = formatHm(mins[i] || 0);
    });
    applyDurationTimeline();
  }
  allocationMode.value = mode;
  if (mode === 'start_end') applyAnchors();
  if (mode === 'percent') syncPercentsFromMinutes();
  emitValidity();
}

function onReorder() {
  if (allocationMode.value === 'start_end') applyAnchors();
  else if (allocationMode.value === 'duration') applyDurationTimeline();
  emitValidity();
}

function onStartEndChange(index) {
  const row = rows.value[index];
  if (!row) return;
  // Chain forward
  if (index < rows.value.length - 1 && row.endTime) {
    rows.value[index + 1].startTime = row.endTime;
  }
  applyAnchors();
  emitValidity();
}

function onDurationBlur(row) {
  const mins = parseHhmm(row.hhmm);
  row.hhmm = mins == null ? '00:00' : formatHm(mins);
  applyDurationTimeline();
  syncPercentsFromMinutes();
  emitValidity();
}

function onDurationInput() {
  emitValidity();
}

function onPercentChange() {
  const mins = percentDerivedMinutes();
  rows.value.forEach((r, i) => {
    r.hhmm = formatHm(mins[i] || 0);
  });
  applyDurationTimeline();
  emitValidity();
}

function duplicateRow(index) {
  const src = rows.value[index];
  if (!src) return;
  const copy = {
    ...src,
    id: `ar-${rowSeq++}`,
    hhmm: '00:00',
    percent: 0,
    note: ''
  };
  rows.value.splice(index + 1, 0, copy);
  if (allocationMode.value === 'start_end') applyAnchors();
  syncSelectedFromRows();
  emitValidity();
}

function removeRow(index) {
  rows.value.splice(index, 1);
  if (allocationMode.value === 'start_end') applyAnchors();
  syncSelectedFromRows();
  emitValidity();
}

function addType(t) {
  rows.value.push(makeRow(t, { hhmm: '00:00', percent: 0 }));
  if (allocationMode.value === 'start_end') applyAnchors();
  syncSelectedFromRows();
  emitValidity();
}

function syncSelectedFromRows() {
  const ids = [...new Set(rows.value.map((r) => r.typeId))];
  emit('update:selectedTypeIds', ids);
}

function syncRowsFromSelected() {
  const wanted = new Set((props.selectedTypeIds || []).map(Number));
  const beforeCount = rows.value.length;
  // Remove types no longer selected (all copies)
  rows.value = rows.value.filter((r) => wanted.has(Number(r.typeId)));
  // Add missing types (once)
  const present = new Set(rows.value.map((r) => Number(r.typeId)));
  let added = 0;
  for (const id of wanted) {
    if (present.has(id)) continue;
    const t = (props.serviceTypes || []).find((x) => Number(x.id) === id);
    if (t) {
      rows.value.push(makeRow(t, { hhmm: '00:00', percent: 0 }));
      added += 1;
    }
  }
  if (allocationMode.value === 'start_end') {
    applyAnchors({ forceSplit: added > 0 || beforeCount === 0 });
  } else if (allocationMode.value === 'duration' && props.totalMinutes > 0) {
    const sum = rows.value.reduce((s, r) => s + (parseHhmm(r.hhmm) || 0), 0);
    if (sum === 0 && rows.value.length) evenlyDistribute();
  }
  emitValidity();
}

function evenlyDistribute() {
  const total = props.totalMinutes;
  const list = rows.value;
  if (!(total >= 1) || !list.length) return;
  const base = Math.floor(total / list.length);
  let rem = total - base * list.length;
  for (const row of list) {
    const m = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    row.hhmm = formatHm(m);
  }
  applyDurationTimeline();
  syncPercentsFromMinutes();
  emitValidity();
}

function rowHasError(row, index) {
  const mins = allocationMode.value === 'percent'
    ? (percentDerivedMinutes()[index] || 0)
    : rowMinutes(row);
  if (mins < 0) return true;
  if (allocationMode.value === 'start_end') {
    if (mins < 1 && rows.value.length) return true;
    const sessStart = hmToMinutes(props.sessionStartHm);
    const sessEnd = hmToMinutes(props.sessionEndHm);
    const a = hmToMinutes(row.startTime);
    const b = hmToMinutes(row.endTime);
    if (a == null || b == null) return true;
    if (sessStart != null && a < sessStart) return true;
    if (sessEnd != null) {
      let end = b;
      const start = a;
      if (end <= start) end += 24 * 60;
      let sEnd = sessEnd;
      if (sEnd <= sessStart) sEnd += 24 * 60;
      if (end > sEnd) return true;
    }
  }
  if (allocationMode.value === 'duration' && remainingMinutes.value < 0) return true;
  return false;
}

const validationMessages = computed(() => {
  const msgs = [];
  const total = props.totalMinutes;
  if (!(total >= 1)) {
    msgs.push('Clock out or enter a session total before allocating time.');
    return msgs;
  }
  if (!rows.value.length) {
    msgs.push('Select at least one service type to allocate.');
    return msgs;
  }
  if (allocationMode.value === 'percent') {
    if (allocatedPercent.value > 100) {
      msgs.push(`Percentages total ${allocatedPercent.value}% — cannot exceed 100%.`);
    } else if (allocatedPercent.value < 100) {
      msgs.push(`Percentages total ${allocatedPercent.value}% — must equal 100%.`);
    }
  } else if (allocatedMinutes.value > total) {
    msgs.push(
      `Allocated time (${formatHm(allocatedMinutes.value)}) exceeds total session time (${formatHm(total)}).`
    );
  } else if (allocatedMinutes.value < total) {
    msgs.push(
      `Allocated time must equal total time (${formatHm(total)}). Remaining: ${formatHm(total - allocatedMinutes.value)}.`
    );
  }
  if (allocationMode.value === 'start_end') {
    for (let i = 0; i < rows.value.length; i++) {
      const r = rows.value[i];
      const mins = rowMinutes(r);
      if (mins < 1) {
        msgs.push(`“${r.label}” (#${i + 1}) needs a positive duration — check start/end times.`);
      }
    }
    const sessStart = hmToMinutes(props.sessionStartHm);
    const sessEnd = hmToMinutes(props.sessionEndHm);
    if (sessStart != null && rows.value[0] && hmToMinutes(rows.value[0].startTime) !== sessStart) {
      msgs.push('First activity must start at your clock-in time.');
    }
    if (sessEnd != null && rows.value.length) {
      const last = rows.value[rows.value.length - 1];
      if (hmToMinutes(last.endTime) !== sessEnd) {
        msgs.push('Last activity must end at your clock-out time.');
      }
    }
  }
  const minsList = allocationMode.value === 'percent'
    ? percentDerivedMinutes()
    : rows.value.map((r) => rowMinutes(r));
  if (minsList.some((m) => m < 1)) {
    msgs.push('Each activity needs at least 1 minute.');
  }
  return [...new Set(msgs)];
});

const isValid = computed(() => {
  if (!(props.totalMinutes >= 1)) return false;
  if (!rows.value.length) return false;
  if (!totalsMatch.value) return false;
  const mins = allocationMode.value === 'percent'
    ? percentDerivedMinutes()
    : rows.value.map((r) => rowMinutes(r));
  if (mins.some((m) => m < 1)) return false;
  if (allocationMode.value === 'start_end') {
    const sessStart = hmToMinutes(props.sessionStartHm);
    const sessEnd = hmToMinutes(props.sessionEndHm);
    if (sessStart != null && hmToMinutes(rows.value[0]?.startTime) !== sessStart) return false;
    if (sessEnd != null && hmToMinutes(rows.value[rows.value.length - 1]?.endTime) !== sessEnd) return false;
  }
  // Over-allocation always invalid
  if (allocatedMinutes.value > props.totalMinutes) return false;
  if (allocationMode.value === 'percent' && allocatedPercent.value !== 100) return false;
  return true;
});

function emitValidity() {
  emit('validity', isValid.value);
}

watch(
  () => [...(props.selectedTypeIds || [])].map(Number).sort((a, b) => a - b).join(','),
  () => syncRowsFromSelected(),
  { immediate: true }
);

watch(
  () => [props.sessionStartHm, props.sessionEndHm, props.totalMinutes],
  () => {
    if (allocationMode.value === 'start_end') {
      // Live end updates pin/grow the last activity without reshuffling middles.
      applyAnchors({ forceSplit: false });
    } else if (allocationMode.value === 'percent') onPercentChange();
    else applyDurationTimeline();
    emitValidity();
  }
);

watch(isValid, (v) => emit('validity', v), { immediate: true });

/** Public API for parent submit / even distribute */
function getAllocationsForSubmit() {
  const mins = allocationMode.value === 'percent'
    ? percentDerivedMinutes()
    : rows.value.map((r) => rowMinutes(r));
  return rows.value.map((r, i) => {
    const note = String(r.note || '').trim();
    return {
      serviceTypeId: r.typeId,
      serviceTypeKey: r.typeKey,
      serviceTypeLabel: r.label,
      minutes: mins[i] || 0,
      startTime: r.startTime || null,
      endTime: r.endTime || null,
      percent: Number(r.percent) || null,
      sortOrder: i + 1,
      ...(note ? { note: note.slice(0, 1000) } : {})
    };
  });
}

/** Labels of rows with no activity note (for soft confirm before submit). */
function getEmptyNoteLabels() {
  return rows.value
    .filter((r) => !String(r.note || '').trim())
    .map((r) => r.label || 'Activity');
}

function clearRows() {
  rows.value = [];
  emitValidity();
}

function tryEvenDistribute() {
  if (rows.value.length && allocatedMinutes.value === 0 && props.totalMinutes > 0) {
    evenlyDistribute();
  }
}

defineExpose({
  getAllocationsForSubmit,
  getEmptyNoteLabels,
  clearRows,
  tryEvenDistribute,
  evenlyDistribute,
  allocationMode,
  isValid,
  allocatedMinutes
});
</script>

<style scoped>
.iap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.iap-ratio {
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #14532d;
}
.iap-ratio[data-kind='yellow'] {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}
.iap-ratio[data-kind='red'] {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.iap-ratio-title {
  font-weight: 800;
  font-size: 0.85rem;
  margin-bottom: 4px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.iap-ratio-body,
.iap-ratio-calc,
.iap-ratio-recent {
  margin: 0 0 6px;
  font-size: 0.86rem;
  line-height: 1.45;
}
.iap-ratio-recent { margin-bottom: 0; }
.iap-ratio-recent strong[data-kind='green'] { color: #166534; }
.iap-ratio-recent strong[data-kind='yellow'] { color: #b45309; }
.iap-ratio-recent strong[data-kind='red'] { color: #b91c1c; }

.iap-modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
@media (max-width: 640px) {
  .iap-modes { grid-template-columns: 1fr; }
}
.iap-mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  cursor: pointer;
}
.iap-mode.selected {
  border-color: #166534;
  background: #f0fdf4;
}
.iap-mode-label {
  font-weight: 700;
  font-size: 0.9rem;
  color: #111827;
}
.iap-mode-hint {
  font-size: 0.75rem;
  color: #6b7280;
}
.iap-order-hint {
  margin: 0 0 8px;
  font-size: 0.82rem;
  color: #6b7280;
  line-height: 1.4;
}
.iap-notes-hint {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: #374151;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.iap-table-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.iap-rows {
  min-height: 8px;
}
.iap-empty-rows {
  margin: 0;
  padding: 16px 12px;
  font-size: 0.85rem;
  color: #6b7280;
  text-align: center;
}
.iap-table-head,
.iap-row {
  display: grid;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
}
.iap-row {
  align-items: start;
  border-top: 1px solid #f3f4f6;
}
.iap-note-field {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
}
.iap-note-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #4b5563;
}
.iap-note-optional {
  font-weight: 500;
  color: #9ca3af;
  font-style: normal;
}
.iap-note-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 0.85rem;
  resize: vertical;
  min-height: 52px;
  background: #fff;
}
.iap-note-input:focus {
  outline: 2px solid #86efac;
  border-color: #166534;
}
.iap-cols--start_end {
  grid-template-columns: 28px 28px minmax(110px, 1.5fr) 96px 96px 64px minmax(120px, auto);
}
.iap-cols--duration {
  grid-template-columns: 28px 28px minmax(120px, 1.6fr) 110px minmax(120px, auto);
}
.iap-cols--percent {
  grid-template-columns: 28px 28px minmax(100px, 1.4fr) 90px 64px minmax(120px, auto);
}
@media (max-width: 800px) {
  .iap-cols--start_end,
  .iap-cols--duration,
  .iap-cols--percent {
    grid-template-columns: 24px 24px 1fr;
  }
  .iap-cols--start_end .iap-input,
  .iap-cols--start_end .iap-derived,
  .iap-cols--duration .iap-input,
  .iap-cols--percent .iap-pct-wrap,
  .iap-cols--percent .iap-derived {
    grid-column: 1 / -1;
  }
}
.iap-table-head {
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
}
.iap-row {
  border-bottom: 1px solid #f3f4f6;
}
.iap-row:last-child { border-bottom: none; }
.iap-row--error {
  background: #fef2f2;
}
.iap-drag {
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #4b5563;
  cursor: grab;
  padding: 4px 6px;
  border-radius: 6px;
  line-height: 1;
}
.iap-drag-icon {
  font-size: 0.85rem;
  display: block;
}
.iap-drag:hover { background: #f3f4f6; color: #111827; }
.iap-drag:active { cursor: grabbing; }
.iap-ord {
  font-weight: 700;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}
.iap-label {
  font-weight: 600;
  color: #111827;
  font-size: 0.9rem;
  min-width: 0;
}
.iap-input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  width: 100%;
  max-width: 120px;
  background: #fff;
}
.iap-input:disabled {
  background: #f3f4f6;
  color: #374151;
  cursor: not-allowed;
}
.iap-row--error .iap-input {
  border-color: #f87171;
}
.iap-hhmm { max-width: 100px; }
.iap-pct-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: #6b7280;
}
.iap-pct { max-width: 72px; }
.iap-derived {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #374151;
  font-size: 0.9rem;
}
.iap-actions {
  display: inline-flex;
  gap: 6px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.iap-text-btn {
  border: none;
  background: transparent;
  color: #166534;
  padding: 4px 2px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.iap-text-btn:hover { text-decoration: underline; }
.iap-text-btn--danger { color: #b91c1c; }
.iap-live-note {
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid #dcfce7;
  background: #f0fdf4;
  color: #14532d;
  font-size: 0.82rem;
  line-height: 1.4;
}
.iap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.iap-totals {
  font-size: 0.9rem;
  color: #374151;
  margin-left: auto;
}
.iap-bad { color: #dc2626; }
.iap-ok { color: #166534; }
.iap-remain { color: #6b7280; }
.iap-add-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.iap-chip {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.iap-chip:hover {
  border-color: #166534;
  color: #166534;
}
.iap-alerts {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.iap-alerts li {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 0.85rem;
  font-weight: 600;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
