<template>
  <section class="ops-docs panel" aria-label="Documentation Alerts">
    <div class="panel-header">
      <h2>Documentation Alerts</h2>
      <button type="button" class="link-btn" @click="$emit('navigate', viewAllTo)">View All</button>
    </div>
    <div v-if="!alerts.length" class="empty">No documentation alerts right now</div>
    <ul v-else class="alert-list">
      <li v-for="row in alerts" :key="row.key" class="alert-row" :class="row.tone">
        <div class="alert-body">
          <strong>{{ row.count }} {{ row.label }}</strong>
          <span>{{ row.hint }}</span>
        </div>
        <button type="button" class="link-btn" @click="$emit('navigate', row.to)">
          {{ row.cta || 'View List' }}
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
defineProps({
  alerts: { type: Array, default: () => [] },
  viewAllTo: { type: String, default: '' }
});

defineEmits(['navigate']);
</script>

<style scoped>
.panel {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.panel-header h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}
.link-btn {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.link-btn:hover { text-decoration: underline; }
.empty {
  font-size: 13px;
  color: #94a3b8;
  padding: 12px 0;
}
.alert-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}
.alert-row.danger {
  background: #fef2f2;
  border-color: #fecaca;
}
.alert-row.warn {
  background: #fffbeb;
  border-color: #fde68a;
}
.alert-row.info {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.alert-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.alert-body strong {
  font-size: 14px;
  color: #0f172a;
}
.alert-body span {
  font-size: 12px;
  color: #64748b;
}
</style>
