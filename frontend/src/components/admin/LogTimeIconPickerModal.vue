<template>
  <div v-if="open" class="ltip-backdrop" @click.self="$emit('close')">
    <div class="ltip-modal">
      <div class="ltip-head">
        <h3>Choose icon</h3>
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('close')">Close</button>
      </div>
      <div class="ltip-grid">
        <button
          v-for="opt in options"
          :key="opt.key"
          type="button"
          class="ltip-item"
          :class="{ selected: modelValue === opt.key }"
          :title="opt.label"
          @click="pick(opt.key)"
        >
          <IndirectTimeIcon :icon-key="opt.key" :size="28" />
          <span class="ltip-label">{{ opt.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import IndirectTimeIcon from '../dashboard/IndirectTimeIcon.vue';
import { INDIRECT_TIME_ICON_OPTIONS } from '../../utils/indirectTimeIcons';

defineProps({
  open: { type: Boolean, default: false },
  modelValue: { type: String, default: 'circle' }
});

const emit = defineEmits(['update:modelValue', 'close']);

const options = INDIRECT_TIME_ICON_OPTIONS;

const pick = (key) => {
  emit('update:modelValue', key);
  emit('close');
};
</script>

<style scoped>
.ltip-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 1200;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.ltip-modal {
  background: #fff; border-radius: 12px; width: min(520px, 96vw); max-height: 85vh;
  padding: 16px; box-shadow: 0 12px 40px rgba(15,23,42,.18); overflow: auto;
}
.ltip-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.ltip-head h3 { margin: 0; font-size: 1.05rem; }
.ltip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.ltip-item {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 6px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; cursor: pointer;
}
.ltip-item:hover { border-color: #94a3b8; background: #f8fafc; }
.ltip-item.selected { border-color: var(--primary, #15803d); background: #f0fdf4; }
.ltip-label { font-size: 11px; color: #64748b; text-align: center; line-height: 1.2; }
</style>
