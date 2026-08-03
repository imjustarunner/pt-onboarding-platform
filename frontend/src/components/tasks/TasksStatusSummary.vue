<template>
  <div class="tasks-status-summary" role="list">
    <button
      v-for="card in cards"
      :key="card.key"
      type="button"
      class="status-card"
      :class="[card.tone, { active: modelValue === card.key }]"
      role="listitem"
      @click="$emit('update:modelValue', modelValue === card.key ? 'all' : card.key)"
    >
      <span class="status-card__label">{{ card.label }}</span>
      <strong class="status-card__value">{{ card.value }}</strong>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: 'all' },
  counts: { type: Object, default: () => ({}) }
});

defineEmits(['update:modelValue']);

const cards = computed(() => [
  { key: 'all', label: 'All', value: Number(props.counts.open ?? props.counts.all ?? 0), tone: 'tone-all' },
  { key: 'pending', label: 'Pending', value: Number(props.counts.pending || 0), tone: 'tone-pending' },
  { key: 'in_progress', label: 'In Progress', value: Number(props.counts.in_progress || 0), tone: 'tone-progress' },
  { key: 'completed', label: 'Completed', value: Number(props.counts.completed || 0), tone: 'tone-done' },
  { key: 'overdue', label: 'Overdue', value: Number(props.counts.overdue || 0), tone: 'tone-overdue' }
]);
</script>

<style scoped>
.tasks-status-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.status-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  font: inherit;
  color: inherit;
  min-height: 0;
}
.status-card.active {
  border-color: var(--brand-primary, #1f6b4a);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-primary, #1f6b4a) 35%, transparent);
}
.status-card__label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}
.status-card__value {
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}
.tone-pending .status-card__value { color: #c2410c; }
.tone-progress .status-card__value { color: #1d4ed8; }
.tone-done .status-card__value { color: #15803d; }
.tone-overdue .status-card__value { color: #b91c1c; }
@media (max-width: 800px) {
  .tasks-status-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
