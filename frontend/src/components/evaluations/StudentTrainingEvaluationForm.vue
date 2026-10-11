<template>
  <section class="training-form" :aria-label="template.title">
    <header class="training-form-header">
      <span class="training-eyebrow">{{ preview ? 'Appendix G · Form preview' : 'Student training · Quarterly review' }}</span>
      <h4>{{ template.title }}</h4>
      <p>{{ template.purpose }}</p>
      <span class="training-version">Form v{{ template.version }} · {{ template.maxPoints }} points possible</span>
    </header>
    <p v-if="preview" class="training-preview-note">This is the blank form used for intern evaluations in the app. Complete an evaluation in Evaluations → Student training, or My Account → Evaluations. Individual responses are private and never appear in this appendix.</p>
    <dl class="training-identities"><div><dt>Intern / trainee</dt><dd>{{ context.studentName || 'Assigned intern' }}</dd></div><div><dt>Evaluator</dt><dd>{{ context.evaluatorName || 'Assigned supervisor / People Operations' }}</dd></div><div><dt>Review period</dt><dd>{{ context.year && context.quarter ? `Q${context.quarter} ${context.year}` : 'Year and quarter' }}</dd></div></dl>
    <fieldset v-for="(section, index) in template.sections" :key="section.key" class="training-category">
      <legend><span class="training-number">{{ String(index + 1).padStart(2, '0') }}</span>{{ section.title }}<span class="training-points">{{ section.maxPoints }} points</span></legend>
      <p>{{ section.description }}</p>
      <details :open="preview" class="training-bands"><summary>Scoring guide</summary><div v-for="band in section.bands" :key="band.label" class="training-band"><strong>{{ band.label }} <span>{{ band.min }}–{{ band.max }}</span></strong><p>{{ band.description }}</p></div></details>
      <div class="training-score-row"><label :for="`${uid}-${section.key}-score`">Score <select :id="`${uid}-${section.key}-score`" :value="modelValue.scores?.[section.key] ?? ''" :disabled="disabled || preview" @change="setScore(section.key, $event.target.value)"><option value="">Choose a score</option><option v-for="score in section.maxPoints + 1" :key="score - 1" :value="score - 1">{{ score - 1 }} / {{ section.maxPoints }}</option></select></label><span v-if="bandFor(section)" class="training-level">{{ bandFor(section).label }}</span></div>
      <label :for="`${uid}-${section.key}-notes`" class="training-note-label">Observations / development notes <span>Optional</span></label>
      <textarea :id="`${uid}-${section.key}-notes`" :value="modelValue.notes?.[section.key] || ''" :disabled="disabled || preview" rows="2" maxlength="4000" placeholder="Specific observations and areas for growth…" @input="setField('notes', section.key, $event.target.value)" />
    </fieldset>
    <section class="training-overall">
      <h5>Overall evaluation</h5>
      <div class="training-total" aria-live="polite"><strong>{{ complete ? total : '—' }}<small> / {{ template.maxPoints }}</small></strong><span>{{ complete ? outcome?.description : `${scoredCount} of ${template.sections.length} categories scored` }}</span></div>
      <label :for="`${uid}-summary`">Summary <span>Optional</span></label><textarea :id="`${uid}-summary`" :value="modelValue.summary || ''" :disabled="disabled || preview" rows="3" maxlength="4000" @input="setText('summary', $event.target.value)" />
      <label :for="`${uid}-next`">Next steps / development goals <span>Optional</span></label><textarea :id="`${uid}-next`" :value="modelValue.nextSteps || ''" :disabled="disabled || preview" rows="3" maxlength="4000" @input="setText('nextSteps', $event.target.value)" />
      <details class="training-outcomes" :open="preview"><summary>Overall scoring guide</summary><p v-for="band in template.outcomes" :key="band.min"><strong>{{ band.min }}–{{ band.max }}:</strong> {{ band.description }}</p></details>
    </section>
  </section>
</template>

<script setup>
import { computed, useId } from 'vue';
const props = defineProps({ template: { type: Object, required: true }, modelValue: { type: Object, default: () => ({ scores: {}, notes: {}, summary: '', nextSteps: '' }) }, context: { type: Object, default: () => ({}) }, disabled: Boolean, preview: Boolean });
const emit = defineEmits(['update:modelValue']);
const uid = `training-${useId()}`;
const validScore = s => Number.isInteger(props.modelValue.scores?.[s.key]) && props.modelValue.scores[s.key] >= 0 && props.modelValue.scores[s.key] <= s.maxPoints;
const scoredCount = computed(() => props.template.sections.filter(validScore).length);
const complete = computed(() => scoredCount.value === props.template.sections.length);
const total = computed(() => props.template.sections.reduce((sum, s) => sum + (validScore(s) ? props.modelValue.scores[s.key] : 0), 0));
const outcome = computed(() => props.template.outcomes.find(b => total.value >= b.min && total.value <= b.max));
const bandFor = s => validScore(s) ? s.bands.find(b => props.modelValue.scores[s.key] >= b.min && props.modelValue.scores[s.key] <= b.max) : null;
function setField(field, key, value) { if (!props.disabled && !props.preview) emit('update:modelValue', { ...props.modelValue, [field]: { ...props.modelValue[field], [key]: value } }); }
function setScore(key, value) { setField('scores', key, value === '' ? null : Number(value)); }
function setText(key, value) { if (!props.disabled && !props.preview) emit('update:modelValue', { ...props.modelValue, [key]: value }); }
</script>

<style scoped>
.training-form{--training-ink:#18543f;color:#284737;font:14px/1.65 var(--handbook-font, Arial),sans-serif;max-width:100%;overflow-wrap:anywhere}.training-form *{box-sizing:border-box}.training-form-header{padding:25px;background:#edf3e6;border-radius:12px;border-top:4px solid var(--training-ink)}.training-eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:10px;color:#637951}.training-form-header h4{font:30px/1.2 Georgia,serif;color:var(--training-ink);margin:12px 0}.training-form-header p{margin:12px 0;max-width:75ch}.training-version{font-size:11px}.training-preview-note{padding:15px 18px;background:#faf6df;border:1px solid #e6dfbd;border-radius:8px;font-size:12px}.training-identities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:25px 0}.training-identities dt{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6c7c5e}.training-identities dd{margin:4px 0;font-size:13px}.training-category{min-width:0;border:1px solid #d5dfcf;border-radius:10px;padding:20px;margin:24px 0;background:#fffef9}.training-category legend{max-width:100%;padding:0 8px;font-weight:600;color:var(--training-ink)}.training-number{color:#7a916c;font:18px Georgia,serif;margin-right:10px}.training-points{display:inline-block;font-size:10px;font-weight:400;padding:3px 8px;margin-left:10px;border-radius:15px;background:#eaf0e3}.training-category>p{margin-top:4px;font-size:13px}.training-bands{margin:15px 0;font-size:12px}.training-bands summary,.training-outcomes summary{cursor:pointer;color:var(--training-ink);font-weight:600}.training-band{padding:12px 0;border-bottom:1px solid #e6ebdf}.training-band strong{display:flex;justify-content:space-between;gap:10px}.training-band strong span{font-weight:400;color:#617655}.training-band p{margin:5px 0 0}.training-score-row{display:flex;gap:15px;align-items:flex-end;flex-wrap:wrap;margin:17px 0}.training-score-row label{display:grid;gap:5px;font-weight:600;font-size:12px}.training-form select{padding:10px;background:white;color:#284737;border:1px solid #b7c7ab;border-radius:6px;max-width:100%;font:inherit}.training-level{font-size:11px;padding:8px 0;color:#547246}.training-form label span{font-size:10px;color:#77856c;font-weight:400;margin-left:7px}.training-note-label,.training-overall>label{display:block;font-weight:600;font-size:12px;margin:15px 0 6px}.training-form textarea{display:block;width:100%;max-width:100%;border:1px solid #cbd7c1;border-radius:6px;padding:11px;resize:vertical;background:white;color:#284737;font:13px/1.7 Arial,sans-serif}.training-form textarea:disabled,.training-form select:disabled{color:#57664c;background:#f5f7f0;opacity:1}.training-overall{padding:24px;border-radius:12px;background:#edf3e6}.training-overall h5{font:23px Georgia,serif;margin:0 0 15px}.training-total{display:flex;align-items:center;gap:18px;margin:10px 0 25px}.training-total strong{font:36px Georgia,serif;white-space:nowrap}.training-total small{font:14px Arial,sans-serif}.training-total>span{font-size:12px}.training-outcomes{font-size:12px;margin-top:22px}.training-form :focus-visible{outline:2px solid #18543f;outline-offset:3px}@media(max-width:600px){.training-form-header,.training-overall{padding:18px}.training-form-header h4{font-size:25px}.training-identities{grid-template-columns:1fr;gap:10px}.training-category{padding:14px}.training-category legend{font-size:13px}.training-total{align-items:flex-start;flex-direction:column;gap:6px}}
</style>
