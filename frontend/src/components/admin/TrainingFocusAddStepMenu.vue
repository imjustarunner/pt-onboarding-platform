<template>
  <div class="add-step-menu">
    <div class="add-step-row">
      <select v-model="selectedModuleId" class="filter-select">
        <option value="">Link module…</option>
        <option v-for="m in availableModules" :key="m.id" :value="m.id">{{ m.title }}</option>
      </select>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!selectedModuleId" @click="addStep('module', selectedModuleId)">
        Add module
      </button>
    </div>
    <div class="add-step-row">
      <select v-model="selectedChecklistId" class="filter-select">
        <option value="">Link checklist item…</option>
        <option v-for="item in availableChecklistItems" :key="item.id" :value="item.id">{{ item.item_label }}</option>
      </select>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!selectedChecklistId" @click="addStep('checklist_item', selectedChecklistId)">
        Add checklist
      </button>
    </div>
    <div class="add-step-row">
      <select v-model="selectedDocumentId" class="filter-select">
        <option value="">Link document…</option>
        <option v-for="doc in availableDocuments" :key="doc.id" :value="doc.id">{{ doc.name }}</option>
      </select>
      <select v-model="documentActionType" class="filter-select" style="max-width: 140px;">
        <option value="signature">Signature</option>
        <option value="review">Review</option>
      </select>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!selectedDocumentId" @click="addDocumentStep">
        Add document
      </button>
    </div>
    <div class="add-step-row add-step-actions">
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('create-module')">Create new module</button>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('focus-settings')">Focus settings…</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  availableModules: { type: Array, default: () => [] },
  availableChecklistItems: { type: Array, default: () => [] },
  availableDocuments: { type: Array, default: () => [] }
});

const emit = defineEmits(['add-step', 'create-module', 'focus-settings']);

const selectedModuleId = ref('');
const selectedChecklistId = ref('');
const selectedDocumentId = ref('');
const documentActionType = ref('signature');

const addStep = (stepType, referenceId) => {
  if (!referenceId) return;
  emit('add-step', { stepType, referenceId: parseInt(referenceId, 10) });
  if (stepType === 'module') selectedModuleId.value = '';
  if (stepType === 'checklist_item') selectedChecklistId.value = '';
};

const addDocumentStep = () => {
  if (!selectedDocumentId.value) return;
  emit('add-step', {
    stepType: 'document',
    referenceId: parseInt(selectedDocumentId.value, 10),
    documentActionType: documentActionType.value
  });
  selectedDocumentId.value = '';
};
</script>

<style scoped>
.add-step-menu {
  padding: 16px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.add-step-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.add-step-actions {
  margin-top: 4px;
}

.filter-select {
  min-width: 200px;
  flex: 1;
  max-width: 320px;
}
</style>
