<template>
  <fieldset class="reference-questionnaire">
    <legend>Your experience with {{ candidateName || 'the applicant' }}</legend>
    <label v-if="includeIdentity"><span>Your name <span aria-hidden="true">*</span></span><input v-model="answers.referenceName" required maxlength="255" autocomplete="name" /></label>
    <div class="reference-relationship">
      <label v-if="includeIdentity"><span>Professional relationship <span aria-hidden="true">*</span></span><select v-model="answers.relationshipType" required><option value="">Select relationship</option><option value="manager">Direct supervisor</option><option value="coworker">Colleague or coworker</option><option value="direct_report">I reported to them</option><option value="other">Other</option></select></label>
      <label v-if="current"><span>How long have you known {{ candidateName || 'the applicant' }}? <span aria-hidden="true">*</span></span>
        <select v-model="answers.relationshipDuration" required><option value="">Select duration</option><option value="under_1_year">Less than a year</option><option value="1_2_years">1–2 years</option><option value="3_5_years">3–5 years</option><option value="over_5_years">More than 5 years</option></select>
      </label>
    </div>
    <label v-if="includeIdentity && answers.relationshipType === 'other'">Describe your relationship<input v-model="answers.relationshipOther" required maxlength="500" /></label>
    <h3 v-if="current">How would you rate {{ candidateName || 'the applicant' }} in these areas?</h3>
    <p>{{ questionnaire.scale }}</p>
    <div v-for="trait in questionnaire.traits" :key="trait.key" class="reference-rating">
      <label v-if="!current">
        <strong>{{ trait.label }}</strong><span>{{ trait.question }}</span><small>{{ trait.example }}</small>
        <select v-model="answers.traits[trait.key]" required :aria-label="trait.label"><option value="">Select a rating</option><option v-for="n in 5" :key="n" :value="n">{{ n }} — {{ scaleLabels[n - 1] }}</option><option value="not_observed">Not observed</option></select>
      </label>
      <fieldset v-else class="rating-row">
        <legend>{{ trait.label }}</legend>
        <p v-if="trait.question && editedQuestion(trait)">{{ trait.question }}</p>
        <p v-if="trait.example" class="rating-example">{{ trait.example }}</p>
        <div class="rating-options">
          <label v-for="n in 5" :key="n" class="rating-choice"><input v-model="answers.traits[trait.key]" type="radio" :name="'rating-' + trait.key" :value="n" required :aria-label="trait.label + ', ' + n + ' out of 5'" /><span>{{ n }}</span></label>
          <label class="rating-choice not-observed"><input v-model="answers.traits[trait.key]" type="radio" :name="'rating-' + trait.key" value="not_observed" required /><span>Not observed</span></label>
        </div>
      </fieldset>
    </div>
    <template v-if="current">
      <label><span>What are {{ candidateName || "the applicant" }}'s greatest professional strengths? <span aria-hidden="true">*</span></span><textarea v-model="answers.strengths" required rows="4" maxlength="4000" placeholder="Share a specific example or observation…" /></label>
      <label>What areas might benefit from further development?<textarea v-model="answers.developmentAreas" rows="4" maxlength="4000" placeholder="Share constructive feedback…" /></label>
    </template>
    <label>Would you work with or rehire {{ candidateName || 'this person' }} again?<select v-model="answers.wouldHire" :required="!current"><option value="">Select a response</option><option value="yes">Yes</option><option value="with_reservations">Yes, with reservations</option><option value="no">No</option><option value="unable_to_assess">Unable to assess</option></select></label>
    <label v-for="question in questionnaire.questions || []" :key="question.key">{{ question.label }}
      <textarea v-model="answers.customAnswers[question.key]" :required="question.required" maxlength="4000" rows="3" />
    </label>
    <template v-if="!current">
      <label>What most influenced your hiring recommendation? (optional)<textarea v-model="answers.hireReason" rows="3" maxlength="4000" /></label>
      <label>Share an example, strengths, or areas where support would help. (optional)<textarea v-model="answers.additionalComments" rows="3" maxlength="8000" /></label>
    </template>
  </fieldset>
</template>
<script setup>
import { computed, watchEffect } from 'vue';
const props = defineProps({ modelValue: { type: Object, required: true }, questionnaire: { type: Object, required: true }, candidateName: String, includeIdentity: { type:Boolean, default:true } });
const answers = computed(() => props.modelValue);
const current = computed(() => props.questionnaire.version === 3);
watchEffect(() => { answers.value.customAnswers ||= {}; });
const scaleLabels = ['Consistently falls short', 'Needs frequent support', 'Meets expectations', 'Often exceeds expectations', 'Consistently excels'];
const editedQuestion = trait => trait.question !== `How would you rate their ${trait.label.toLowerCase().replace(' & ', ' and ')}?`;
</script>
<style scoped>
.reference-questionnaire {
  border:1px solid var(--border-color,#d8e1dc);
  border-radius:12px;
  padding:20px;
  min-width:0;
}
label {
  display:flex;
  flex-direction:column;
  gap:6px;
  margin:22px 0;
}
input,select,textarea {
  padding:12px;
  border:1px solid #aabbb2;
  border-radius:10px;
  font:inherit;
  width:100%;
  box-sizing:border-box;
}
small {
  color:#52665b;
  font-weight:normal;
}
.reference-relationship {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:20px;
}
.rating-row {
  border:0;
  border-bottom:1px solid #e4e7e0;
  padding:16px 0;
  min-width:0;
}
.rating-row legend {
  font-weight:600;
  font-size:16px!important;
}
.rating-options {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}
.rating-choice {
  position:relative;
  margin:0;
  cursor:pointer;
}
.rating-choice input {
  position:absolute;
  opacity:0;
  width:1px;
  height:1px;
  min-height:0!important;
}
.rating-choice span {
  display:block;
  border:1px solid #b5c4b9;
  border-radius:9px;
  padding:9px 16px;
  text-align:center;
  min-width:20px;
}
.rating-choice input:checked+span {
  background:#153e32;
  color:white;
  border-color:#153e32;
}
.rating-choice input:focus-visible+span {
  outline:3px solid #bc7b5d;
  outline-offset:3px;
}
.not-observed span {
  font-size:13px;
}
.rating-example {
  font-size:14px;
  color:#52665b;
}
@media(max-width:600px) {
  .reference-relationship {
    grid-template-columns:1fr;
    gap:0;
  }
  .rating-options {
    gap:6px;
  }
  .rating-choice span {
    padding:8px 12px;
  }
  .reference-questionnaire {
    padding:16px;
  }
}
</style>
