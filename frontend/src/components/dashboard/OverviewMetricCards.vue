<template>
  <div class="ov-metrics" data-tour="dash-overview-metrics">
    <button
      v-if="showSchedule"
      type="button"
      class="ov-metric ov-metric--purple"
      @click="$emit('navigate', 'my_schedule')"
    >
      <div class="ov-metric-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </div>
      <div class="ov-metric-body">
        <div class="ov-metric-label">Today's Schedule</div>
        <div class="ov-metric-value">{{ scheduleCount }} Appointment{{ scheduleCount === 1 ? '' : 's' }}</div>
        <div class="ov-metric-hint">{{ nextHint }}</div>
      </div>
      <span class="ov-metric-chevron" aria-hidden="true">›</span>
    </button>

    <button
      v-if="showPayroll"
      type="button"
      class="ov-metric ov-metric--green"
      @click="$emit('navigate', 'payroll')"
    >
      <div class="ov-metric-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </div>
      <div class="ov-metric-body">
        <div class="ov-metric-label">Last Pay Period</div>
        <div class="ov-metric-value">{{ payCompareLabel }}</div>
        <div class="ov-metric-hint">
          <span v-if="tierLabel" class="ov-metric-tier">{{ tierLabel }}</span>
          <span v-else>{{ periodRange }}</span>
        </div>
      </div>
      <span class="ov-metric-chevron" aria-hidden="true">›</span>
    </button>

    <button
      v-if="showNotes"
      type="button"
      class="ov-metric ov-metric--blue"
      @click="$emit('navigate', 'checklist')"
    >
      <div class="ov-metric-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
      </div>
      <div class="ov-metric-body">
        <div class="ov-metric-label">Notes</div>
        <div class="ov-metric-value">
          {{ notesIncomplete }} incomplete
        </div>
        <div class="ov-metric-hint">{{ notesPeriodLabel || 'Last Pay Period' }}</div>
      </div>
    </button>

    <button
      v-if="showSupervision"
      type="button"
      class="ov-metric ov-metric--purple"
      @click="$emit('navigate', supervisionTab)"
    >
      <div class="ov-metric-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </div>
      <div class="ov-metric-body">
        <div class="ov-metric-label">Supervision</div>
        <div class="ov-metric-value">{{ supervisionValue }}</div>
        <div class="ov-metric-hint">{{ supervisionHint }}</div>
      </div>
      <span class="ov-metric-chevron" aria-hidden="true">›</span>
    </button>

    <button
      v-if="showClaims"
      type="button"
      class="ov-metric ov-metric--green"
      @click="$emit('navigate', 'submit')"
    >
      <div class="ov-metric-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
      </div>
      <div class="ov-metric-body">
        <div class="ov-metric-label">Claims</div>
        <div class="ov-metric-value">Open Submit</div>
        <div class="ov-metric-hint">Mileage, PTO, time &amp; more</div>
      </div>
      <span class="ov-metric-chevron" aria-hidden="true">›</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  showSchedule: { type: Boolean, default: true },
  showPayroll: { type: Boolean, default: false },
  showNotes: { type: Boolean, default: false },
  showSupervision: { type: Boolean, default: false },
  showClaims: { type: Boolean, default: false },
  isSupervisor: { type: Boolean, default: false },
  scheduleCount: { type: Number, default: 0 },
  nextScheduleItem: { type: Object, default: null },
  periodStart: { type: String, default: '' },
  periodEnd: { type: String, default: '' },
  tierLabel: { type: String, default: '' },
  paycheckCompare: { type: Object, default: null },
  notesIncomplete: { type: Number, default: 0 },
  notesCompletedPct: { type: Number, default: null },
  notesPeriodLabel: { type: String, default: '' },
  supervisionHours: { type: Object, default: null },
  notesToSignCount: { type: Number, default: 0 }
});

defineEmits(['navigate']);

const supervisionTab = computed(() => (props.isSupervisor ? 'supervision' : 'my_supervision'));

const nextHint = computed(() => {
  const n = props.nextScheduleItem;
  if (!n) return 'No appointments today';
  if (n.status === 'in_progress') return `Now: ${n.title}`;
  return `Next: ${n.timeLabel} ${n.title}`;
});

const periodRange = computed(() => {
  if (props.periodStart && props.periodEnd) return `${props.periodStart} – ${props.periodEnd}`;
  return 'No posted payroll yet';
});

const payCompareLabel = computed(() => {
  const r = Number(props.paycheckCompare?.ratio);
  if (!Number.isFinite(r)) return periodRange.value;
  if (r > 1) return 'Above average';
  if (r >= 0.9) return `${Math.round(r * 10)}/10 of avg`;
  if (r >= 0.7) return 'Below average';
  return 'Well below average';
});

const supervisionValue = computed(() => {
  if (props.isSupervisor && props.notesToSignCount > 0) {
    return `${props.notesToSignCount} to sign`;
  }
  const s = props.supervisionHours;
  if (s?.enabled && s?.isPrelicensed) {
    return `${Number(s.totalHours || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`;
  }
  if (props.isSupervisor) return 'Your team';
  return 'Sessions';
});

const supervisionHint = computed(() => {
  const s = props.supervisionHours;
  if (s?.enabled && s?.isPrelicensed) {
    const ind = Number(s.individualHours || 0);
    const grp = Number(s.groupHours || 0);
    const indReq = Number(s.requiredIndividualHours || 0);
    const grpReq = Number(s.requiredGroupHours || 0);
    const left = Math.max(0, indReq - ind) + Math.max(0, grpReq - grp);
    if (left <= 0) return 'Requirement met';
    return `${left.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs left · Ind ${ind}/${indReq} · Grp ${grp}/${grpReq}`;
  }
  if (props.isSupervisor && props.notesToSignCount > 0) return 'Notes awaiting signature';
  return props.isSupervisor ? 'Open supervision' : 'Open my supervision';
});
</script>

<style scoped>
.ov-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.ov-metric {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 12px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 0.15s, box-shadow 0.15s;
  min-width: 0;
}
.ov-metric:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.ov-metric-icon {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-metric--purple .ov-metric-icon { background: #f3e8ff; color: #7e22ce; }
.ov-metric--green .ov-metric-icon { background: #dcfce7; color: #15803d; }
.ov-metric--blue .ov-metric-icon { background: #dbeafe; color: #1d4ed8; }
.ov-metric-body { flex: 1; min-width: 0; }
.ov-metric-label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.ov-metric-value {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  margin-top: 2px;
  line-height: 1.25;
}
.ov-metric-hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-metric-tier { color: #15803d; font-weight: 600; }
.ov-metric-chevron {
  color: #9ca3af;
  font-size: 18px;
  line-height: 1;
  margin-top: 2px;
}
.ov-metric-bar {
  height: 4px;
  background: #e5e7eb;
  border-radius: 999px;
  margin-top: 8px;
  overflow: hidden;
}
.ov-metric-bar > span {
  display: block;
  height: 100%;
  background: #2563eb;
  border-radius: 999px;
}

[data-theme="dark"] .ov-metric {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-metric:hover { border-color: #475569; }
[data-theme="dark"] .ov-metric--purple .ov-metric-icon { background: #2e1a47; color: #c4b5fd; }
[data-theme="dark"] .ov-metric--green .ov-metric-icon { background: #14291e; color: #86efac; }
[data-theme="dark"] .ov-metric--blue .ov-metric-icon { background: #172554; color: #93c5fd; }
[data-theme="dark"] .ov-metric-label { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-metric-value { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-metric-hint { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-metric-chevron { color: #64748b; }
[data-theme="dark"] .ov-metric-bar { background: #374151; }
</style>
