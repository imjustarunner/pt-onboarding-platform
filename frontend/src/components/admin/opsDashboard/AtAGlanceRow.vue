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

      <!-- Hub quick-access card: one card, 4 mini nav tiles inside -->
      <div v-if="hubLinks?.length > 1" class="ops-metric ops-metric--hubs" aria-label="Quick hub navigation">
        <span class="ops-metric-label">QUICK ACCESS</span>
        <div class="hub-mini-grid">
          <RouterLink
            v-for="h in hubLinks"
            :key="h.to"
            :to="h.to"
            class="hub-mini-tile"
            :class="`hub-mini-tile--${h.icon}`"
          >
            <span class="hub-mini-icon">
              <!-- My Dashboard -->
              <svg v-if="h.icon === 'my'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
              <!-- Ops Dashboard -->
              <svg v-else-if="h.icon === 'ops'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 17.5h7M17.5 14v7" stroke-linecap="round"/></svg>
              <!-- Workforce -->
              <svg v-else-if="h.icon === 'workforce'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8" stroke-linecap="round"/></svg>
              <!-- Admin -->
              <svg v-else-if="h.icon === 'admin'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke-linecap="round"/></svg>
              <!-- People -->
              <svg v-else-if="h.icon === 'people'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>
              <!-- School -->
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21V12h6v9" stroke-linecap="round"/></svg>
            </span>
            <span class="hub-mini-label">{{ h.label }}</span>
            <span class="hub-mini-sub">{{ h.sub }}</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { RouterLink } from 'vue-router';

defineProps({
  cards: { type: Array, default: () => [] },
  hubLinks: { type: Array, default: null },
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

/* ── Hub quick-access card ─────────────────────────── */
.ops-metric--hubs {
  cursor: default;
  padding: 6px 6px 6px;
  gap: 3px;
}
.ops-metric--hubs:hover {
  transform: none;
  border-color: color-mix(in srgb, var(--ops-primary, #1f6b4a) 18%, #e2e8f0);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
}
.hub-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  flex: 1;
}
.hub-mini-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 3px 2px;
  border-radius: 7px;
  text-decoration: none;
  color: inherit;
  transition: background 0.13s, transform 0.1s;
  text-align: center;
  min-width: 0;
}
.hub-mini-tile:hover {
  transform: scale(1.03);
}
.hub-mini-tile--my         { background: #f1f5f9; }
.hub-mini-tile--my:hover   { background: #e2e8f0; }
.hub-mini-tile--ops        { background: #eff6ff; }
.hub-mini-tile--ops:hover  { background: #dbeafe; }
.hub-mini-tile--workforce        { background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, #fff); }
.hub-mini-tile--workforce:hover  { background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 16%, #fff); }
.hub-mini-tile--school        { background: #fdf4ff; }
.hub-mini-tile--school:hover  { background: #f3e8ff; }
.hub-mini-tile--admin         { background: #fff7ed; }
.hub-mini-tile--admin:hover   { background: #ffedd5; }
.hub-mini-tile--people        { background: #fff1f2; }
.hub-mini-tile--people:hover  { background: #ffe4e6; }
.hub-mini-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.hub-mini-icon :deep(svg),
.hub-mini-icon svg {
  width: 12px;
  height: 12px;
}
.hub-mini-tile--my        .hub-mini-icon { color: #475569; }
.hub-mini-tile--ops       .hub-mini-icon { color: #2563eb; }
.hub-mini-tile--workforce .hub-mini-icon { color: var(--ops-primary, #1f6b4a); }
.hub-mini-tile--school    .hub-mini-icon { color: #7c3aed; }
.hub-mini-tile--admin     .hub-mini-icon { color: #c2410c; }
.hub-mini-tile--people    .hub-mini-icon { color: #be123c; }
.hub-mini-label {
  font-size: 8.5px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.hub-mini-sub {
  font-size: 7.5px;
  color: #94a3b8;
  line-height: 1;
}
</style>
