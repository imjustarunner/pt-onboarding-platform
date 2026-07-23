<template>
  <div class="sec-actions">
    <div v-if="done" class="sec-actions__done" aria-live="polite">
      <span class="sec-actions__big-check">✓</span>
      Marked accurate
    </div>
    <div class="sec-actions__btns">
      <button type="button" class="btn btn-secondary" :disabled="saving" @click="$emit('save')">
        Save progress
      </button>
      <button type="button" class="btn btn-confirm" :disabled="saving || done" @click="$emit('confirm')">
        {{ confirmLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  done: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  confirmLabel: { type: String, default: 'Looks accurate' },
});
defineEmits(['save', 'confirm']);
</script>

<style scoped>
.sec-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.sec-actions__done {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: #166534;
}
.sec-actions__big-check {
  display: inline-flex;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #16a34a;
  color: #fff;
  font-size: 1.5rem;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.35);
}
.sec-actions__btns {
  display: flex;
  gap: 8px;
}
.btn {
  font-family: system-ui, sans-serif;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}
.btn-secondary {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155;
}
.btn-confirm {
  background: #16a34a;
  color: #fff;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
