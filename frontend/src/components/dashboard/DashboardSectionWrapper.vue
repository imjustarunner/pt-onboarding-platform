<template>
  <div
    class="dash-reorder-wrap"
    :class="{ 'dash-reorder-wrap--editing': editing }"
    :style="{ order }"
    :data-section-id="id"
  >
    <div v-if="editing" class="dash-reorder-bar">
      <span class="dash-reorder-label">{{ label }}</span>
      <div class="dash-reorder-actions">
        <button
          type="button"
          class="dash-reorder-btn"
          :disabled="disableUp"
          :aria-label="`Move ${label} up`"
          title="Move up"
          @click="$emit('move-up')"
        >▲</button>
        <button
          type="button"
          class="dash-reorder-btn"
          :disabled="disableDown"
          :aria-label="`Move ${label} down`"
          title="Move down"
          @click="$emit('move-down')"
        >▼</button>
      </div>
    </div>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  order: { type: Number, required: true },
  editing: { type: Boolean, default: false },
  disableUp: { type: Boolean, default: false },
  disableDown: { type: Boolean, default: false },
});

defineEmits(['move-up', 'move-down']);
</script>

<style scoped>
.dash-reorder-wrap {
  display: block;
  position: relative;
}
.dash-reorder-wrap--editing {
  outline: 2px dashed #c8102e;
  outline-offset: 4px;
  border-radius: 14px;
}
.dash-reorder-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 6px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #9a3412;
}
.dash-reorder-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dash-reorder-actions {
  display: inline-flex;
  gap: 4px;
}
.dash-reorder-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #fb923c;
  background: #ffedd5;
  color: #9a3412;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dash-reorder-btn:hover:not(:disabled) {
  background: #fed7aa;
}
.dash-reorder-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
