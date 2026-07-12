<template>
  <section class="ov-card" data-tour="dash-overview-actions">
    <header class="ov-card-head">
      <h3 class="ov-card-title">Quick Actions</h3>
    </header>

    <ul class="ov-actions">
      <li v-for="action in actions" :key="action.id">
        <button type="button" class="ov-action" @click="$emit('action', action)">
          <span class="ov-action-icon" :style="{ background: action.iconBg, color: action.iconColor }" aria-hidden="true">
            {{ action.icon }}
          </span>
          <span class="ov-action-body">
            <span class="ov-action-title">{{ action.title }}</span>
            <span class="ov-action-desc">{{ action.description }}</span>
          </span>
          <span class="ov-action-chevron" aria-hidden="true">›</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
defineProps({
  actions: { type: Array, default: () => [] }
});
defineEmits(['action']);
</script>

<style scoped>
.ov-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.ov-card-head { margin-bottom: 8px; }
.ov-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.ov-actions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ov-action {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid #f3f4f6;
  padding: 11px 2px;
  cursor: pointer;
}
.ov-action:last-child { border-bottom: none; }
.ov-action:hover { background: #f9fafb; }
.ov-action-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}
.ov-action-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ov-action-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.ov-action-desc {
  font-size: 12px;
  color: #6b7280;
}
.ov-action-chevron {
  color: #9ca3af;
  font-size: 18px;
}

[data-theme="dark"] .ov-card {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-card-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-action { border-bottom-color: #2d3240; }
[data-theme="dark"] .ov-action:hover { background: #252930; }
[data-theme="dark"] .ov-action-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-action-desc { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-action-chevron { color: #64748b; }
</style>
