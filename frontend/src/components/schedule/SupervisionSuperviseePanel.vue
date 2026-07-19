<template>
  <div class="ssp" data-testid="supervision-supervisee-panel">
    <div class="ssp-head">
      <h3 class="ssp-title">Supervisee</h3>
      <p class="ssp-sub muted">{{ participantName || 'Supervision progress toward required hours' }}</p>
    </div>

    <div v-if="loading" class="muted">Loading supervision hours…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!enabled" class="muted">
      Supervision hour tracking is not enabled for this supervisee on this tenant.
    </div>
    <div v-else class="ssp-cards">
      <div class="ssp-card">
        <div class="ssp-k">Individual</div>
        <div class="ssp-v">{{ fmt(individualHours) }} / {{ fmt(requiredIndividual) }}</div>
        <div class="ssp-bar" aria-hidden="true">
          <span class="ssp-bar-fill" :style="{ width: pct(individualHours, requiredIndividual) }" />
        </div>
        <div class="ssp-meta muted">{{ remaining(individualHours, requiredIndividual) }} hrs remaining</div>
      </div>
      <div class="ssp-card">
        <div class="ssp-k">Group</div>
        <div class="ssp-v">{{ fmt(groupHours) }} / {{ fmt(requiredGroup) }}</div>
        <div class="ssp-bar" aria-hidden="true">
          <span class="ssp-bar-fill ssp-bar-fill--group" :style="{ width: pct(groupHours, requiredGroup) }" />
        </div>
        <div class="ssp-meta muted">{{ remaining(groupHours, requiredGroup) }} hrs remaining</div>
      </div>
      <div class="ssp-card ssp-card--wide">
        <div class="ssp-k">Total</div>
        <div class="ssp-v">{{ fmt(totalHours) }} hrs logged</div>
        <div class="ssp-meta muted">Session type: {{ sessionTypeLabel }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  participantName: { type: String, default: '' },
  sessionType: { type: String, default: 'individual' },
  individualHours: { type: Number, default: 0 },
  groupHours: { type: Number, default: 0 },
  requiredIndividual: { type: Number, default: 50 },
  requiredGroup: { type: Number, default: 50 },
  enabled: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const totalHours = computed(() => Number(props.individualHours || 0) + Number(props.groupHours || 0));
const sessionTypeLabel = computed(() => {
  const t = String(props.sessionType || 'individual').toLowerCase();
  if (t === 'group') return 'Group';
  if (t === 'triadic') return 'Triadic';
  return 'Individual';
});

function fmt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function pct(have, need) {
  const n = Number(need || 0);
  if (!(n > 0)) return '0%';
  return `${Math.min(100, Math.round((Number(have || 0) / n) * 100))}%`;
}
function remaining(have, need) {
  return fmt(Math.max(0, Number(need || 0) - Number(have || 0)));
}
</script>

<style scoped>
.ssp { display: flex; flex-direction: column; gap: 12px; }
.ssp-title { margin: 0; font-size: 1rem; font-weight: 800; color: #0f172a; }
.ssp-sub { margin: 2px 0 0; font-size: 0.82rem; }
.ssp-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.ssp-card {
  padding: 12px 14px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.ssp-card--wide { grid-column: 1 / -1; }
.ssp-k {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.ssp-v {
  margin-top: 4px;
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.ssp-bar {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.ssp-bar-fill {
  display: block;
  height: 100%;
  background: #2563eb;
  border-radius: 999px;
}
.ssp-bar-fill--group { background: #7c3aed; }
.ssp-meta { margin-top: 6px; font-size: 0.8rem; font-weight: 600; }
.error { color: #b91c1c; font-size: 0.85rem; }
.muted { color: #64748b; }
@media (max-width: 640px) {
  .ssp-cards { grid-template-columns: 1fr; }
  .ssp-card--wide { grid-column: auto; }
}
</style>
