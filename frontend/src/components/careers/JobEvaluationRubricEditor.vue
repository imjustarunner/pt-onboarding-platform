<template>
  <section class="rubric-panel">
    <h4>Evaluation rubric</h4>
    <p>This is the employee self-assessment for this role. Review criteria and rating descriptions below. Saved revisions apply to future evaluations; existing evaluations retain their version.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">{{ busy }}</p>
    <ul>
      <li v-for="template in templates" :key="template.templateId">
        <strong>{{ template.name }}</strong> · Version {{ template.version }} {{ template.isPrimary ? '· Primary' : '' }}
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!!busy" @click="edit(template)">View / edit rubric</button>
      </li>
    </ul>
    <p v-if="!busy && !templates.length">No rubric attached yet. Create one, generate from the saved job responsibilities, or select an existing agency rubric.</p>
    <div class="actions">
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!!busy" @click="generate">Generate from saved responsibilities</button>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!!busy" @click="create">Create rubric</button>
    </div>
    <p class="hint">Save changes to the job description before generating from its responsibilities.</p>
    <label>Available agency rubrics
      <select v-model="selectedId" :disabled="!!busy"><option value="">Choose an existing rubric…</option><option v-for="t in available" :key="t.id" :value="t.id">{{ t.name }} · v{{ t.version }}</option></select>
    </label>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="!selectedId || !!busy" @click="attach">Attach selected rubric</button>
    <fieldset v-if="draft" :disabled="!!busy">
      <legend>{{ editingId ? 'Edit rubric — save a new version' : 'New rubric' }}</legend>
      <label>Rubric title<input v-model="draft.title" maxlength="255" /></label>
      <section v-for="(section, si) in draft.sections" :key="section.key" class="rubric-section">
        <label>Section title<input v-model="section.title" maxlength="255" /></label>
        <label><input v-model="section.hasActionItems" type="checkbox" /> Include action items</label>
        <button type="button" @click="draft.sections.splice(si, 1)">Remove section</button>
        <div v-for="(criterion, ci) in section.criteria" :key="criterion.key" class="criterion">
          <label>Criterion {{ ci + 1 }}<textarea v-model="criterion.label" rows="2" maxlength="2000" /></label>
          <details><summary>Rating descriptions (1–4)</summary>
            <label v-for="rating in scale" :key="rating.value">{{ rating.value }} · {{ rating.label }}<textarea v-model="criterion.anchors[rating.value]" rows="2" maxlength="2000" /></label>
          </details>
          <button type="button" @click="section.criteria.splice(ci, 1)">Remove criterion</button>
        </div>
        <button type="button" @click="section.criteria.push(newCriterion())">Add criterion</button>
      </section>
      <button type="button" @click="draft.sections.push(newSection())">Add section</button>
      <h5>Reflection questions</h5>
      <div v-for="(question, i) in draft.reflectionPrompts" :key="question.key">
        <label>Question {{ i + 1 }}<textarea v-model="question.label" rows="2" maxlength="2000" /></label>
        <button type="button" @click="draft.reflectionPrompts.splice(i, 1)">Remove question</button>
      </div>
      <button type="button" @click="draft.reflectionPrompts.push({ key: key('reflection'), label: '' })">Add reflection question</button>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="actions"><button type="button" class="btn btn-primary" @click="save">Save rubric for this job</button><button type="button" class="btn btn-secondary" @click="draft = null">Cancel edits</button></div>
    </fieldset>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ jobId: [Number, String], agencyId: [Number, String], jobTitle: String });
const templates = ref([]), available = ref([]), selectedId = ref(''), draft = ref(null), editingId = ref(null), busy = ref(''), error = ref(''), message = ref('');
const scale = [{ value: 1, label: 'Needs Improvement' }, { value: 2, label: 'Developing' }, { value: 3, label: 'Proficient' }, { value: 4, label: 'Exemplary' }];
const key = prefix => `${prefix}_${crypto.randomUUID()}`;
const newCriterion = () => ({ key: key('criterion'), label: '', anchors: { 1: '', 2: '', 3: '', 4: '' } });
const newSection = () => ({ key: key('section'), title: '', hasActionItems: true, criteria: [newCriterion()] });
const params = () => ({ params: { agencyId: props.agencyId } });
const endpoint = action => `/evaluations/jobs/${props.jobId}/${action}`;
function edit(t) { editingId.value = t.templateId; draft.value = JSON.parse(JSON.stringify(t.rubric)); draft.value.reflectionPrompts ||= []; error.value = ''; message.value = ''; }
function create() { editingId.value = null; draft.value = { title: `${props.jobTitle || 'Role'} Evaluation Rubric`, ratingScale: scale, sections: [newSection()], reflectionPrompts: [] }; error.value = ''; message.value = ''; }
async function run(label, action) {
  if (busy.value) return;
  busy.value = label; error.value = ''; message.value = '';
  try { await action(); } catch (e) { error.value = e?.response?.data?.error?.message || e?.message || 'Could not update the rubric.'; }
  finally { busy.value = ''; }
}
async function loadAvailable() { const { data } = await api.get('/evaluations/templates', params()); available.value = data.templates || []; }
async function generate() { await run('Generating rubric…', async () => { const { data } = await api.post(endpoint('generate-template'), {}, params()); templates.value = data.templates || []; if (templates.value[0]) edit(templates.value.find(t => t.isPrimary) || templates.value[0]); await loadAvailable(); }); }
async function attach() { await run('Attaching rubric…', async () => { const { data } = await api.post(endpoint('attach-template'), { templateId: selectedId.value }, params()); templates.value = data.templates || []; draft.value = null; message.value = 'Rubric attached to this job.'; }); }
async function save() { await run('Saving rubric…', async () => { const { data } = await api.put(endpoint('rubric'), { templateId: editingId.value, rubric: draft.value }, params()); templates.value = data.templates || []; draft.value = null; message.value = 'Rubric saved for future evaluations.'; await loadAvailable(); }); }
watch(() => [props.jobId, props.agencyId], () => run('Loading rubrics…', async () => { draft.value = null; templates.value = []; available.value = []; selectedId.value = ''; if (!props.jobId || !props.agencyId) return; const { data } = await api.get(endpoint('templates'), params()); templates.value = data.templates || []; await loadAvailable(); }), { immediate: true });
</script>
<style scoped>
.rubric-panel { padding: 18px; border: 1px solid #d5e1df; border-radius: 12px; margin: 18px 0; }
.rubric-panel label { display: block; margin: 12px 0; }.rubric-panel input:not([type=checkbox]), .rubric-panel textarea, .rubric-panel select { display: block; box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid #b8c8d0; border-radius: 6px; font: inherit; }
.rubric-panel fieldset { min-width: 0; margin-top: 20px; border: 0; padding: 0; }.rubric-section { border: 1px solid #d5e1df; padding: 14px; border-radius: 8px; margin: 14px 0; }.criterion { padding: 10px 0; border-bottom: 1px solid #ddd; }.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }.hint { font-size: .9rem; color: #526477; }[role=alert] { color: #b42318; }
</style>
