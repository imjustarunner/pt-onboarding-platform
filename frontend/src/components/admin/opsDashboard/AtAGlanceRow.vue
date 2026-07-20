<template>
  <section class="ops-glance" aria-label="At a Glance">
    <div class="ops-glance-header">
      <h2>At a Glance</h2>
      <span class="ops-glance-sub">Priority counts that need attention</span>
    </div>
    <div class="ops-glance-row">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="ops-metric"
        :class="card.tone"
        @click="$emit('navigate', card.to)"
      >
        <span class="ops-metric-label">{{ card.label }}</span>
        <strong class="ops-metric-value">{{ formatCount(card.value) }}</strong>
        <span class="ops-metric-hint">{{ card.hint }}</span>
        <span class="ops-metric-cta">{{ card.cta }}</span>
      </button>
    </div>
  </section>
</template>

<script setup>
defineProps({
  cards: { type: Array, default: () => [] }
});

defineEmits(['navigate']);

const formatCount = (v) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString();
};
</script>

<style scoped>
.ops-glance {
  margin-bottom: 20px;
}
.ops-glance-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.ops-glance-header h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--ops-ink, #0f172a);
}
.ops-glance-sub {
  font-size: 13px;
  color: var(--ops-muted, #64748b);
}
.ops-glance-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 1200px) {
  .ops-glance-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .ops-glance-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.ops-metric {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 18%, #e2e8f0);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--ops-primary, #1f6b4a) 6%, transparent);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 118px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
.ops-metric:hover {
  border-color: color-mix(in srgb, var(--ops-primary, #1f6b4a) 45%, #e2e8f0);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, transparent);
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
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ops-muted, #64748b);
}
.ops-metric-value {
  font-size: 1.7rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
}
.ops-metric.danger .ops-metric-value { color: #b91c1c; }
.ops-metric.warn .ops-metric-value { color: #c2410c; }
.ops-metric.accent .ops-metric-value { color: var(--ops-primary, #1f6b4a); }
.ops-metric.info .ops-metric-value { color: #1d4ed8; }
.ops-metric.purple .ops-metric-value { color: #6d28d9; }
.ops-metric.success .ops-metric-value { color: #047857; }
.ops-metric-hint {
  font-size: 12px;
  color: #94a3b8;
  flex: 1;
}
.ops-metric-cta {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ops-primary, #1f6b4a);
}
</style>
