<template>
  <div class="supb" data-testid="supervision-body">
    <div class="supb-row">
      <label class="supb-label">Virtual</label>
      <label class="supb-check">
        <input
          type="checkbox"
          :checked="isVirtual"
          :disabled="disabled"
          @change="emit('update:isVirtual', !!$event.target.checked)"
        />
        <span>Virtual supervision</span>
      </label>
    </div>

    <p class="supb-hint muted">
      After booking, use the <strong>Note</strong> tab for short notes, transcript, and summary,
      and the <strong>Supervisee</strong> tab for individual / group hour progress.
    </p>
  </div>
</template>

<script setup>
defineProps({
  isVirtual: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:isVirtual']);
</script>

<style scoped>
.supb { display: flex; flex-direction: column; gap: 12px; }
.supb-row { display: flex; flex-direction: column; gap: 6px; }
.supb-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.supb-check { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: #0f172a; }
.supb-hint { margin: 0; font-size: 0.82rem; line-height: 1.4; }
.muted { color: #64748b; }
</style>
