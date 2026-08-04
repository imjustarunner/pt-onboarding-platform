<template>
  <div class="hold-reason-field">
    <label class="field">
      <span>{{ label }}</span>
      <input
        :value="modelValue"
        class="form-control"
        type="text"
        list="task-timeline-hold-reasons"
        :placeholder="placeholder"
        maxlength="120"
        @input="emit('update:modelValue', $event.target.value)"
      />
    </label>
    <datalist id="task-timeline-hold-reasons">
      <option v-for="opt in options" :key="opt.code" :value="opt.label" />
    </datalist>
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
import { computed } from 'vue';
import { SCHEDULE_HOLD_REASONS } from '../../constants/scheduleHoldReasons.js';

const props = defineProps({
  modelValue: { type: String, default: 'Focus Time' },
  label: { type: String, default: 'Block reason' },
  placeholder: { type: String, default: 'Type or pick a reason…' }
});

const emit = defineEmits(['update:modelValue']);

const options = SCHEDULE_HOLD_REASONS;
const chipOptions = computed(() => SCHEDULE_HOLD_REASONS.slice(0, 10));

function isSelected(opt) {
  return String(props.modelValue || '').trim().toLowerCase() === opt.label.toLowerCase();
}

function select(opt) {
  emit('update:modelValue', opt.label);
}
</script>

<style scoped>
.hold-reason-field { display: flex; flex-direction: column; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field > span { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
.hold-reason-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hold-reason-chip {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  border-radius: 999px;
  padding: 4px 10px;
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
