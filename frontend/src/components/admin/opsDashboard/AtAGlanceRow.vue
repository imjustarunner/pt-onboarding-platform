<template>
  <section class="ops-glance" aria-label="At a Glance">
    <div class="ops-glance-header">
      <h2>At a Glance</h2>
      <span class="ops-glance-sub">Priority counts that need attention</span>
      <button
        v-if="reorderable"
        type="button"
        class="ops-glance-customize"
        @click="$emit('customize')"
      >
        Reorder
      </button>
    </div>
    <div class="ops-glance-row">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="ops-metric"
        :class="[card.tone, { 'ops-metric--multi': card.metrics?.length }]"
        @click="$emit('navigate', card.to)"
      >
        <span class="ops-metric-label">{{ card.label }}</span>
        <div class="ops-metric-body">
          <div v-if="card.metrics?.length" class="ops-metric-stats">
            <div v-for="m in card.metrics" :key="m.label" class="ops-metric-stat">
              <span class="ops-metric-stat-label">{{ m.label }}</span>
              <strong class="ops-metric-stat-value" :class="m.tone">{{ formatCount(m.value) }}</strong>
            </div>
          </div>
          <strong v-else class="ops-metric-value">{{ formatCount(card.value) }}</strong>
        </div>
        <span class="ops-metric-hint">{{ card.hint }}</span>
        <span class="ops-metric-cta">{{ card.cta }}</span>
      </button>
    </div>
  </section>
</template>

<script setup>
defineProps({
  cards: { type: Array, default: () => [] },
  reorderable: { type: Boolean, default: false }
});

defineEmits(['navigate', 'customize']);

const formatCount = (v) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString();
};
</script>

<style scoped>
.ops-glance {
  margin-bottom: 14px;
}
.ops-glance-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.ops-glance-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--ops-ink, #0f172a);
}
.ops-glance-sub {
  font-size: 12px;
  color: var(--ops-muted, #64748b);
}
.ops-glance-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 8px;
  align-items: stretch;
}
.ops-glance-customize {
  margin-left: auto;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 28%, #e2e8f0);
  background: #fff;
  color: var(--ops-primary, #1f6b4a);
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.ops-glance-customize:hover {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, #fff);
}
@media (max-width: 900px) {
  .ops-glance-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .ops-glance-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.ops-metric {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 18%, #e2e8f0);
  border-radius: 12px;
  padding: 8px 10px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  height: 100%;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
.ops-metric-body {
  min-height: 0;
  display: flex;
  align-items: flex-end;
}
.ops-metric--multi .ops-metric-body {
  align-items: flex-start;
}
.ops-metric:hover {
  border-color: color-mix(in srgb, var(--ops-primary, #1f6b4a) 45%, #e2e8f0);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--ops-primary, #1f6b4a) 12%, transparent);
  transform: translateY(-1px);
}
.ops-metric.danger {
  background: linear-gradient(160deg, #fef2f2, #fff);
  border-color: #fecaca;
}
.ops-metric.warn {
  background: linear-gradient(160deg, #fffbeb, #fff);
  border-color: #fde68a;
}
.ops-metric.accent {
  background: linear-gradient(160deg, color-mix(in srgb, var(--ops-primary, #1f6b4a) 12%, #fff), #fff);
  border-color: color-mix(in srgb, var(--ops-primary, #1f6b4a) 32%, #fff);
}
.ops-metric.info {
  background: linear-gradient(160deg, #eff6ff, #fff);
  border-color: #bfdbfe;
}
.ops-metric.purple {
  background: linear-gradient(160deg, #f5f3ff, #fff);
  border-color: #ddd6fe;
}
.ops-metric.success {
  background: linear-gradient(160deg, #ecfdf5, #fff);
  border-color: #a7f3d0;
}
.ops-metric-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ops-muted, #64748b);
  line-height: 1.2;
}
.ops-metric-value {
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
  line-height: 1.1;
}
.ops-metric.danger .ops-metric-value { color: #b91c1c; }
.ops-metric.warn .ops-metric-value { color: #c2410c; }
.ops-metric.accent .ops-metric-value { color: var(--ops-primary, #1f6b4a); }
.ops-metric.info .ops-metric-value { color: #1d4ed8; }
.ops-metric.purple .ops-metric-value { color: #6d28d9; }
.ops-metric.success .ops-metric-value { color: #047857; }
.ops-metric-stats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0;
}
.ops-metric-stat {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.ops-metric-stat-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #94a3b8;
}
.ops-metric-stat-value {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
  line-height: 1.1;
}
.ops-metric-stat-value.danger { color: #b91c1c; }
.ops-metric-stat-value.warn { color: #c2410c; }
.ops-metric-stat-value.accent { color: var(--ops-primary, #1f6b4a); }
.ops-metric-stat-value.info { color: #1d4ed8; }
.ops-metric-hint {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ops-metric-cta {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ops-primary, #1f6b4a);
}
</style>
