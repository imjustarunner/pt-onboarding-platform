<template>
  <div class="jpde">
    <div class="jpde-head">
      <div>
        <h4>{{ heading }}</h4>
        <p class="muted">
          These items appear on the candidate’s pre-hire portal when Start Pre-Hire runs.
          Pick a type below — each one does something different for the candidate.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="addDoc">Add document</button>
    </div>

    <div class="jpde-kind-guide" role="note">
      <div class="jpde-kind-guide-item">
        <strong>Sign job description</strong>
        <span>Shows the posting on the portal and collects a signature acknowledging the role.</span>
      </div>
      <div class="jpde-kind-guide-item">
        <strong>Printable instructions</strong>
        <span>Opens a dedicated print page (fingerprint steps, checklists, etc.).</span>
      </div>
      <div class="jpde-kind-guide-item">
        <strong>External website</strong>
        <span>Opens an outside URL such as IdentoGO or a vendor enrollment portal.</span>
      </div>
      <div class="jpde-kind-guide-item">
        <strong>Candidate upload</strong>
        <span>Asks the candidate to upload a completed form, receipt, or other file.</span>
      </div>
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
        <label>What should the candidate do?
          <select v-model="doc.kind" class="input">
            <option value="acknowledgement">Sign job description</option>
            <option value="print_only">Printable instructions</option>
            <option value="reference">External website link</option>
            <option value="upload">Candidate file upload</option>
          </select>
        </label>
        <label v-if="doc.kind === 'reference'">Website URL
          <input v-model="doc.url" class="input" type="url" placeholder="https://uenroll.identogo.com/…" />
          <span class="jpde-field-hint">Candidate taps “Open link” and leaves your portal for this site.</span>
        </label>
        <label v-if="doc.kind === 'upload'">Optional blank form URL
          <input v-model="doc.url" class="input" type="url" placeholder="https://…/blank-form.pdf" />
          <span class="jpde-field-hint">If you host a blank PDF, candidates can download it before uploading their completed copy.</span>
        </label>
        <label v-if="doc.kind === 'upload'">Library template ID (optional)
          <input v-model="doc.templateId" class="input" type="number" min="1" placeholder="Advanced — document_templates.id" />
          <span class="jpde-field-hint">Only needed if you also assign a formal document task from the library.</span>
        </label>
        <label>Scheduled on (optional)
          <input v-model="doc.scheduledOn" class="input" type="date" />
        </label>
      </div>
      <label class="jpde-full">Portal instructions
        <textarea
          v-model="doc.instructions"
          class="textarea"
          rows="2"
          :placeholder="instructionsPlaceholder(doc.kind)"
        />
      </label>
      <label v-if="doc.kind === 'print_only'" class="jpde-full">Print-page instructions
        <textarea
          v-model="doc.printInstructions"
          class="textarea"
          rows="4"
          placeholder="Shown only on the print page — step-by-step what to print or bring."
        />
      </label>
      <p class="jpde-kind-callout">{{ kindCallout(doc.kind) }}</p>
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

const instructionsPlaceholder = (kind) => {
  switch (String(kind || '')) {
    case 'print_only':
      return 'e.g. Print these instructions and bring them to your IdentoGO appointment.';
    case 'reference':
      return 'e.g. Complete fingerprint enrollment on the IdentoGO site, then return here.';
    case 'upload':
      return 'e.g. Upload a photo or PDF of your completed fingerprint receipt.';
    default:
      return 'e.g. Read the job description carefully, then sign to acknowledge.';
  }
};

const kindCallout = (kind) => {
  switch (String(kind || '')) {
    case 'print_only':
      return 'Candidate sees an “Open print page” button. Put the long checklist in Print-page instructions.';
    case 'reference':
      return 'Candidate sees an “Open link” button. Use this for vendor sites you do not host.';
    case 'upload':
      return 'Candidate sees an upload control on their portal. Files are stored on their hire record.';
    default:
      return 'Candidate reviews the job description in the portal and signs to acknowledge it. No extra URL needed.';
  }
};
</script>

<style scoped>
.jpde { margin-top: 14px; }
.jpde-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.jpde-head h4 { margin: 0 0 4px; }
.jpde-empty { padding: 10px 0; }
.jpde-kind-guide {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0 4px;
}
.jpde-kind-guide-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 0.8rem;
  color: #475569;
  line-height: 1.4;
}
.jpde-kind-guide-item strong {
  color: #0f172a;
  font-size: 0.82rem;
}
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
.jpde-field-hint {
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  line-height: 1.35;
}
.jpde-kind-callout {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  font-size: 0.78rem;
  font-weight: 550;
  line-height: 1.4;
}
.muted { color: #6b7280; font-size: 0.85rem; font-weight: 400; }
@media (max-width: 720px) {
  .jpde-grid,
  .jpde-kind-guide { grid-template-columns: 1fr; }
}
</style>
