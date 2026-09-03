<template>
  <div class="jpde">
    <div class="jpde-head">
      <div>
        <h4>{{ heading }}</h4>
        <p class="muted">
          These are the only documents started with pre-hire for this posting. Print-only items open a dedicated print page.
          Reference items (IdentoGO, etc.) open an external URL. Acknowledgements show the job description plus a signature.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="addDoc">Add document</button>
    </div>

    <div v-if="!model.documents.length" class="jpde-empty muted">No pre-hire documents on this job yet.</div>

    <div v-for="(doc, idx) in model.documents" :key="doc.id || idx" class="jpde-card">
      <div class="jpde-card-head">
        <strong>Document {{ idx + 1 }}</strong>
        <button type="button" class="jpde-remove" @click="removeDoc(idx)">Remove</button>
      </div>
      <div class="jpde-grid">
        <label>Title
          <input v-model="doc.title" class="input" type="text" placeholder="e.g. IdentoGO fingerprinting" />
        </label>
        <label>Kind
          <select v-model="doc.kind" class="input">
            <option value="acknowledgement">Acknowledgement (job description + signature)</option>
            <option value="print_only">Print-only (separate print page)</option>
            <option value="reference">Reference / external link</option>
            <option value="upload">Upload / library template</option>
          </select>
        </label>
        <label v-if="doc.kind === 'reference'">Link URL
          <input v-model="doc.url" class="input" type="url" placeholder="https://uenroll.identogo.com/…" />
        </label>
        <label v-if="doc.kind === 'upload'">Library template ID
          <input v-model="doc.templateId" class="input" type="number" min="1" placeholder="Optional document_templates.id" />
        </label>
        <label>Scheduled on (optional)
          <input v-model="doc.scheduledOn" class="input" type="date" />
        </label>
      </div>
      <label class="jpde-full">Portal instructions
        <textarea v-model="doc.instructions" class="textarea" rows="2" placeholder="What the candidate should do" />
      </label>
      <label v-if="doc.kind === 'print_only'" class="jpde-full">Print-page instructions
        <textarea v-model="doc.printInstructions" class="textarea" rows="4" placeholder="Shown only on the print page — not in the portal card." />
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({ documents: [] }) },
  heading: { type: String, default: 'Pre-hire documents for this job' }
});
const emit = defineEmits(['update:modelValue']);

const model = computed({
  get: () => {
    const v = props.modelValue && typeof props.modelValue === 'object' ? props.modelValue : {};
    if (!Array.isArray(v.documents)) v.documents = [];
    return v;
  },
  set: (val) => emit('update:modelValue', val)
});

const blankDoc = () => ({
  id: `doc-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
  kind: 'acknowledgement',
  title: '',
  instructions: '',
  printInstructions: '',
  url: '',
  templateId: '',
  scheduledOn: ''
});

const addDoc = () => {
  model.value.documents.push(blankDoc());
};
const removeDoc = (idx) => {
  model.value.documents.splice(idx, 1);
};
</script>

<style scoped>
.jpde { margin-top: 14px; }
.jpde-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.jpde-head h4 { margin: 0 0 4px; }
.jpde-empty { padding: 10px 0; }
.jpde-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  margin-top: 10px;
  background: #fff;
}
.jpde-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.jpde-remove { border: 0; background: none; color: #b91c1c; font-weight: 650; cursor: pointer; }
.jpde-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.jpde-grid label, .jpde-full { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; font-weight: 650; }
.jpde-full { margin-top: 8px; }
.muted { color: #6b7280; font-size: 0.85rem; font-weight: 400; }
@media (max-width: 720px) { .jpde-grid { grid-template-columns: 1fr; } }
</style>
