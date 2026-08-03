<template>
  <section
    v-if="weekday"
    class="days-capacity-strip"
    data-tour="school-days-capacity"
    :aria-label="`${weekday} provider capacity`"
  >
    <div class="days-capacity-head">
      <div>
        <div class="days-capacity-title">{{ weekday }} — provider capacity</div>
        <div class="days-capacity-sub">Who is on-site today, how full they are, and open slots.</div>
      </div>
      <div class="days-capacity-legend" aria-label="Capacity legend">
        <span class="legend-item"><span class="dot green" aria-hidden="true" />2+ open</span>
        <span class="legend-item"><span class="dot yellow" aria-hidden="true" />1 open</span>
        <span class="legend-item"><span class="dot red" aria-hidden="true" />Full</span>
      </div>
    </div>

    <div v-if="loading" class="days-capacity-loading muted">Loading provider capacity…</div>
    <div v-else-if="!sortedProviders.length" class="days-capacity-empty muted">
      No providers scheduled for {{ weekday }} yet.
    </div>
    <div v-else class="days-capacity-scroll">
      <button
        v-for="p in sortedProviders"
        :key="p.provider_user_id"
        type="button"
        class="capacity-card"
        :class="`capacity-card--${capacityColor(p)}`"
        @click="$emit('focus-provider', p.provider_user_id)"
      >
        <div class="capacity-card-top">
          <span class="capacity-name">{{ p.first_name }} {{ p.last_name }}</span>
          <span class="capacity-pill" :class="capacityColor(p)">{{ openLabel(p) }}</span>
        </div>
        <div class="capacity-card-meta">
          <span class="capacity-slots">{{ assignmentSummary(p) }}</span>
          <span v-if="p.start_time || p.end_time" class="capacity-time">
            {{ formatClock(p.start_time) }} – {{ formatClock(p.end_time) }}
          </span>
        </div>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import {
  providerAssignmentSummary,
  providerCapacityColor,
  providerSlotsOpenLabel
} from '../../../utils/providerSlotCapacity';

const props = defineProps({
  weekday: { type: String, default: '' },
  providers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});

defineEmits(['focus-provider']);

const formatClock = (t) => {
  const raw = String(t || '').slice(0, 5);
  if (!raw || raw === '—') return '—';
  const [hh, mm] = raw.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return raw;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
};

const startTimeSortValue = (provider) => {
  const raw = String(provider?.start_time || '').trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  const hh = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.POSITIVE_INFINITY;
  return hh * 60 + mm;
};

const sortedProviders = computed(() => {
  const list = Array.isArray(props.providers) ? props.providers.slice() : [];
  return list.sort((a, b) => {
    const diff = startTimeSortValue(a) - startTimeSortValue(b);
    if (diff) return diff;
    const byLast = String(a?.last_name || '').localeCompare(String(b?.last_name || ''), undefined, { sensitivity: 'base' });
    if (byLast) return byLast;
    return String(a?.first_name || '').localeCompare(String(b?.first_name || ''), undefined, { sensitivity: 'base' });
  });
});

const capacityColor = (p) => providerCapacityColor(p);
const openLabel = (p) => providerSlotsOpenLabel(p) || '—';
const assignmentSummary = (p) => providerAssignmentSummary(p);
</script>

<style scoped>
.days-capacity-strip {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.days-capacity-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.days-capacity-title {
  font-weight: 900;
  color: var(--text-primary);
  font-size: 15px;
}
.days-capacity-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}
.days-capacity-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}
.dot.green { background: #22c55e; }
.dot.yellow { background: #f59e0b; }
.dot.red { background: #ef4444; }
.days-capacity-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.capacity-card {
  flex: 0 0 auto;
  min-width: min(240px, 78vw);
  text-align: left;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 10px 12px;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.capacity-card:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.capacity-card--green { border-left: 4px solid #22c55e; }
.capacity-card--yellow { border-left: 4px solid #f59e0b; }
.capacity-card--red { border-left: 4px solid #ef4444; }
.capacity-card--neutral { border-left: 4px solid #94a3b8; }
.capacity-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.capacity-name {
  font-weight: 900;
  color: var(--text-primary);
  line-height: 1.2;
}
.capacity-pill {
  font-size: 11px;
  font-weight: 900;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
  border: 1px solid var(--border);
  background: #fff;
}
.capacity-pill.green { border-color: rgba(34, 197, 94, 0.45); color: #166534; background: rgba(34, 197, 94, 0.1); }
.capacity-pill.yellow { border-color: rgba(245, 158, 11, 0.5); color: #92400e; background: rgba(245, 158, 11, 0.12); }
.capacity-pill.red { border-color: rgba(239, 68, 68, 0.45); color: #991b1b; background: rgba(239, 68, 68, 0.1); }
.capacity-pill.neutral { color: var(--text-secondary); }
.capacity-card-meta {
  margin-top: 8px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.capacity-slots {
  color: var(--text-primary);
}
.days-capacity-loading,
.days-capacity-empty {
  font-size: 13px;
  padding: 4px 0;
}
</style>
