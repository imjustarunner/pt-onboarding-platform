<template>
  <div class="twv">
    <header class="twv__head">
      <div>
        <p class="twv__eyebrow">Week in View</p>
        <h3 class="twv__title">Daily patterns over time</h3>
        <p class="twv__note">
          Patterns become clearer over time. Missing days simply mean no check-in was recorded.
        </p>
      </div>
      <div class="twv__toggles">
        <button
          v-for="m in metrics"
          :key="m.id"
          type="button"
          class="twv__toggle"
          :class="{ on: selected.includes(m.id) }"
          @click="toggle(m.id)"
        >
          {{ m.label }}
        </button>
      </div>
    </header>

    <div class="twv__grid" role="table" aria-label="Week in View daily check-ins">
      <div class="twv__row twv__row--head" role="row">
        <span role="columnheader">Metric</span>
        <span v-for="d in days" :key="d.key" role="columnheader">{{ d.label }}</span>
      </div>
      <div
        v-for="m in visibleMetrics"
        :key="m.id"
        class="twv__row"
        role="row"
      >
        <span role="rowheader">{{ m.label }}</span>
        <span
          v-for="d in days"
          :key="`${m.id}-${d.key}`"
          class="twv__cell"
          role="cell"
          :style="cellStyle(valueFor(d.key, m.id))"
        >
          {{ valueFor(d.key, m.id) ?? '—' }}
        </span>
      </div>
    </div>

    <ul class="twv__alt" v-if="showTextAlternative">
      <li v-for="d in days" :key="`alt-${d.key}`">
        <strong>{{ d.full }}</strong>
        <template v-if="hasAny(d.key)">
          <span v-for="m in visibleMetrics" :key="`alt-${d.key}-${m.id}`">
            {{ m.label }} {{ valueFor(d.key, m.id) ?? 'no check-in recorded' }}
          </span>
        </template>
        <span v-else>No check-in recorded</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  checkIns: { type: Array, default: () => [] },
  selectedMetrics: { type: Array, default: () => null },
  dateRange: { type: Array, default: () => null },
  interactive: { type: Boolean, default: true },
  showTextAlternative: { type: Boolean, default: true }
});

const metrics = [
  { id: 'overallMoodScore', label: 'Mood' },
  { id: 'stressManageabilityScore', label: 'Stress' },
  { id: 'energyScore', label: 'Energy' },
  { id: 'sleepQualityScore', label: 'Sleep' },
  { id: 'schoolPressureScore', label: 'School' },
  { id: 'socialConnectionScore', label: 'Social' },
  { id: 'activityEnjoymentScore', label: 'Activities' }
];

const selected = ref(
  props.selectedMetrics?.length
    ? [...props.selectedMetrics]
    : ['energyScore', 'stressManageabilityScore', 'sleepQualityScore', 'overallMoodScore']
);

watch(
  () => props.selectedMetrics,
  (v) => {
    if (v?.length) selected.value = [...v];
  }
);

const visibleMetrics = computed(() => metrics.filter((m) => selected.value.includes(m.id)));

const days = computed(() => {
  if (props.dateRange?.length) {
    return props.dateRange.map((iso) => {
      const dt = new Date(`${iso}T12:00:00`);
      return {
        key: iso,
        label: dt.toLocaleDateString(undefined, { weekday: 'short' }),
        full: dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
      };
    });
  }
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      key: iso,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      full: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    });
  }
  return out;
});

const byDate = computed(() => {
  const m = {};
  for (const c of props.checkIns || []) {
    m[c.checkInDate || c.date] = c;
  }
  return m;
});

function valueFor(dateKey, metricId) {
  const row = byDate.value[dateKey];
  if (!row) return null;
  const v = row[metricId];
  return v == null ? null : Number(v);
}

function hasAny(dateKey) {
  return !!byDate.value[dateKey];
}

function toggle(id) {
  if (!props.interactive) return;
  if (selected.value.includes(id)) {
    if (selected.value.length === 1) return;
    selected.value = selected.value.filter((x) => x !== id);
  } else {
    selected.value = [...selected.value, id];
  }
}

function cellStyle(v) {
  if (v == null) return { background: '#f8fafc', color: '#94a3b8' };
  const t = Number(v) / 10;
  return {
    background: `rgba(14, 165, 233, ${0.08 + t * 0.28})`,
    color: '#0f172a'
  };
}
</script>

<style scoped>
.twv {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1rem;
}

.twv__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
}

.twv__title {
  margin: 0.2rem 0;
  font-size: 1.1rem;
}

.twv__note {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.twv__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.75rem 0;
}

.twv__toggle {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.twv__toggle.on {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.twv__grid {
  display: grid;
  gap: 0.35rem;
  overflow-x: auto;
}

.twv__row {
  display: grid;
  grid-template-columns: 5.5rem repeat(7, minmax(2.4rem, 1fr));
  gap: 0.3rem;
  align-items: center;
  font-size: 0.78rem;
}

.twv__row--head {
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.68rem;
}

.twv__cell {
  text-align: center;
  border-radius: 8px;
  padding: 0.4rem 0.2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.twv__alt {
  margin: 0.85rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  color: #475569;
  line-height: 1.5;
}

.twv__alt span {
  display: inline-block;
  margin-right: 0.65rem;
}
</style>
