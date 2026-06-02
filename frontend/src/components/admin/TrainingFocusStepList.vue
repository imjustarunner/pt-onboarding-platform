<template>
  <div class="focus-step-list">
    <div v-if="loading" class="loading-steps">Loading steps…</div>
    <div v-else-if="!steps.length" class="no-steps">
      <p>No steps in this training focus yet.</p>
    </div>
    <div v-else class="steps-list">
      <div
        v-for="(step, index) in steps"
        :key="step.id"
        class="step-item"
      >
        <div class="step-order">{{ index + 1 }}</div>
        <div class="step-type-badge">{{ stepTypeLabel(step.stepType) }}</div>
        <div class="step-info">
          <strong>{{ step.title }}</strong>
          <span v-if="step.documentActionType" class="step-meta">{{ step.documentActionType }}</span>
        </div>
        <div v-if="canEdit" class="step-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="index === 0"
            @click="$emit('move', step.id, 'up')"
          >
            ↑
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="index === steps.length - 1"
            @click="$emit('move', step.id, 'down')"
          >
            ↓
          </button>
          <button
            v-if="step.stepType === 'module'"
            type="button"
            class="btn btn-primary btn-sm"
            @click="$emit('edit-module', step.referenceId)"
          >
            Edit
          </button>
          <button
            type="button"
            class="btn btn-warning btn-sm"
            @click="$emit('remove', step.id)"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  steps: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false }
});

defineEmits(['move', 'remove', 'edit-module']);

const stepTypeLabel = (type) => {
  if (type === 'module') return 'Module';
  if (type === 'checklist_item') return 'Checklist';
  if (type === 'document') return 'Document';
  return type;
};
</script>

<style scoped>
.steps-list {
  padding: 0;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid #e9ecef;
}

.step-order {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary, #2d6a4f);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-type-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: #e9ecef;
  color: #495057;
  flex-shrink: 0;
}

.step-info {
  flex: 1;
  min-width: 0;
}

.step-meta {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.no-steps,
.loading-steps {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
