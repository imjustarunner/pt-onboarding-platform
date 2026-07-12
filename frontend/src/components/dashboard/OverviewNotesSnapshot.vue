<template>
  <section class="ov-card" data-tour="dash-overview-notes">
    <header class="ov-card-head">
      <h3 class="ov-card-title">Notes Snapshot</h3>
      <span class="ov-pill">Last Pay Period</span>
    </header>

    <div v-if="!directIndirect" class="ov-empty">
      <template v-if="notesIncomplete > 0">
        {{ notesIncomplete }} incomplete note{{ notesIncomplete === 1 ? '' : 's' }} in the last pay period.
      </template>
      <template v-else>
        Direct/indirect ratio is not available for this organization.
      </template>
    </div>
    <template v-else>
      <div class="ov-donut-wrap">
        <div class="ov-donut" :style="{ '--pct': donutPct }">
          <div class="ov-donut-hole">
            <span class="ov-donut-val">{{ ratioPctLabel }}</span>
            <span class="ov-donut-sub">D/I</span>
          </div>
        </div>
        <div class="ov-donut-legend">
          <div class="ov-legend-row"><span class="ov-dot ov-dot--green" /> Indirect to Direct Hour Ratio</div>
        </div>
      </div>

      <div class="ov-hours">
        <div class="ov-hour">
          <div class="ov-hour-val">{{ lastKindLabel }}</div>
          <div class="ov-hour-label">Last period</div>
        </div>
        <div class="ov-hour">
          <div class="ov-hour-val">{{ avgKindLabel }}</div>
          <div class="ov-hour-label">90-day avg</div>
        </div>
      </div>

      <div class="ov-status" :class="statusClass">
        {{ statusMessage }}
      </div>
    </template>

    <button type="button" class="ov-link" @click="$emit('navigate', 'checklist')">View Notes Overview</button>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  directIndirect: { type: Object, default: null },
  notesIncomplete: { type: Number, default: 0 }
});

defineEmits(['navigate']);

const fmtPct = (r) => {
  if (r == null || !Number.isFinite(Number(r))) return '—';
  return `${Math.round(Number(r) * 1000) / 10}%`;
};

const ratioPctLabel = computed(() => fmtPct(props.directIndirect?.last?.ratio));

const donutPct = computed(() => {
  const r = Number(props.directIndirect?.last?.ratio);
  if (!Number.isFinite(r)) return '0';
  return String(Math.min(100, Math.round(r * 100)));
});

const lastKindLabel = computed(() => fmtPct(props.directIndirect?.last?.ratio));
const avgKindLabel = computed(() => fmtPct(props.directIndirect?.avg90?.ratio));

const statusClass = computed(() => {
  const last = props.directIndirect?.last?.kind || '';
  const avg = props.directIndirect?.avg90?.kind || '';
  if (last === 'red' || avg === 'red') return 'ov-status--warn';
  if (last === 'green' && avg === 'green') return 'ov-status--ok';
  return 'ov-status--mid';
});

const statusMessage = computed(() => {
  const last = props.directIndirect?.last?.kind || '';
  if (last === 'green') return "Great job! You're within the goal range.";
  if (last === 'red') return 'Ratio needs attention — review incomplete notes.';
  return 'Keep tracking notes to stay within goal.';
});
</script>

<style scoped>
.ov-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.ov-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 8px;
}
.ov-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.ov-pill {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 6px;
}
.ov-empty {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 12px;
}
.ov-donut-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
.ov-donut {
  --pct: 12;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: conic-gradient(#22c55e calc(var(--pct) * 1%), #e5e7eb 0);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ov-donut-hole {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ov-donut-val { font-size: 14px; font-weight: 800; color: #111827; line-height: 1; }
.ov-donut-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
.ov-legend-row { font-size: 12px; color: #374151; display: flex; align-items: center; gap: 6px; }
.ov-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.ov-dot--green { background: #22c55e; }
.ov-hours {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.ov-hour {
  background: #f9fafb;
  border-radius: 8px;
  padding: 8px 10px;
}
.ov-hour-val { font-size: 14px; font-weight: 700; color: #111827; }
.ov-hour-label { font-size: 11px; color: #6b7280; }
.ov-status {
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.ov-status--ok { background: #dcfce7; color: #166534; }
.ov-status--mid { background: #fef9c3; color: #854d0e; }
.ov-status--warn { background: #fee2e2; color: #991b1b; }
.ov-link {
  background: none;
  border: none;
  color: #7c3aed;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.ov-link:hover { text-decoration: underline; }

[data-theme="dark"] .ov-card {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-card-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-pill {
  background: #2a2f38;
  color: var(--text-secondary, #94a3b8);
}
[data-theme="dark"] .ov-empty { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-donut-hole { background: #1e2126; }
[data-theme="dark"] .ov-donut { background: conic-gradient(#22c55e calc(var(--pct) * 1%), #374151 0); }
[data-theme="dark"] .ov-donut-val { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-donut-sub { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-legend-row { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-hour {
  background: #2a2f38;
}
[data-theme="dark"] .ov-hour-val { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-hour-label { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-status--ok { background: #14291e; color: #86efac; }
[data-theme="dark"] .ov-status--mid { background: #2d2000; color: #fde68a; }
[data-theme="dark"] .ov-status--warn { background: #3b1c1c; color: #fca5a5; }
</style>
