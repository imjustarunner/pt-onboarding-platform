<template>
  <div class="hold-reason-field">
    <span class="hold-reason-label">{{ label }}</span>
    <div class="hold-reason-select" :class="{ open: menuOpen }">
      <button
        type="button"
        class="hold-reason-trigger"
        :aria-expanded="menuOpen"
        aria-haspopup="listbox"
        @click.stop="menuOpen = !menuOpen"
      >
        <span>{{ modelValue || placeholder }}</span>
        <span class="hold-reason-chev" aria-hidden="true">▾</span>
      </button>
      <ul v-if="menuOpen" class="hold-reason-menu" role="listbox">
        <li
          v-for="opt in options"
          :key="opt.code"
          role="option"
          :aria-selected="isSelected(opt)"
        >
          <button type="button" class="hold-reason-option" :class="{ on: isSelected(opt) }" @click="select(opt)">
            {{ opt.label }}
          </button>
        </li>
      </ul>
    </div>
    <div class="hold-reason-chips">
      <button
        v-for="opt in chipOptions"
        :key="opt.code"
        type="button"
        class="hold-reason-chip"
        :class="{ on: isSelected(opt) }"
        @click="select(opt)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { SCHEDULE_HOLD_REASONS } from '../../constants/scheduleHoldReasons.js';

const props = defineProps({
  modelValue: { type: String, default: 'Focus Time' },
  label: { type: String, default: 'Block reason' },
  placeholder: { type: String, default: 'Type or pick a reason…' }
});

const emit = defineEmits(['update:modelValue']);

const menuOpen = ref(false);
const options = SCHEDULE_HOLD_REASONS;
const chipOptions = computed(() => SCHEDULE_HOLD_REASONS.slice(0, 8));

function isSelected(opt) {
  return String(props.modelValue || '').trim().toLowerCase() === opt.label.toLowerCase();
}

function select(opt) {
  emit('update:modelValue', opt.label);
  menuOpen.value = false;
}

function onDocClick(e) {
  const el = e.target;
  if (!(el instanceof Node)) return;
  const root = el.closest?.('.hold-reason-field');
  if (!root) menuOpen.value = false;
}

onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<style scoped>
.hold-reason-field { display: flex; flex-direction: column; gap: 8px; }
.hold-reason-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.hold-reason-select { position: relative; }
.hold-reason-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  background: #fff;
  color: #14532d;
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.hold-reason-trigger:hover { background: #f0fdf4; }
.hold-reason-chev { color: #16a34a; font-size: 11px; }
.hold-reason-menu {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 6px;
  list-style: none;
  background: #fff;
  border: 1px solid #dcfce7;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
  max-height: 220px;
  overflow: auto;
}
.hold-reason-option {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.hold-reason-option:hover,
.hold-reason-option.on {
  background: #ecfdf5;
  color: #14532d;
}
.hold-reason-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hold-reason-chip {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.hold-reason-chip.on {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}
</style>
