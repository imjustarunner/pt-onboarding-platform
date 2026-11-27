<script setup>
import { computed } from 'vue';
import { eligibleForDocumentationAddendum, supervisorFeedbackSections, supervisorFeedbackSentence } from '../../utils/clinicalSupervisorFeedback.js';

const props = defineProps({ modelValue: Object, disabled: Boolean, addendum: Boolean });
const emit = defineEmits(['update:modelValue']);
const selection = computed(() => props.modelValue || {});
const sentence = computed(() => supervisorFeedbackSentence(selection.value));
function update(field, value) {
  emit('update:modelValue', {...selection.value,[field]:value,...(field==='section'?{topic:''}:{})});
}
</script>

<template>
  <div class="correction-fields">
    <label>Note section
      <select :value="selection.section || ''" :disabled="disabled" @change="update('section',$event.target.value)">
        <option value="">Choose a section</option>
        <option v-for="(_,section) in supervisorFeedbackSections" :key="section">{{ section }}</option>
      </select>
    </label>
    <label>Change needed
      <select :value="selection.reason || ''" :disabled="disabled" @change="update('reason',$event.target.value)">
        <option value="">Choose a change</option>
        <option value="detail">Additional information needed</option>
        <option value="clarify">Clarification needed</option>
        <option value="correct">Correction needed</option>
      </select>
    </label>
    <label>Topic
      <select :value="selection.topic || ''" :disabled="disabled || !selection.section" @change="update('topic',$event.target.value)">
        <option value="">Choose a topic</option>
        <option v-for="topic in supervisorFeedbackSections[selection.section] || []" :key="topic">{{ topic }}</option>
      </select>
    </label>
  </div>
  <blockquote v-if="sentence">{{ sentence }}</blockquote>
  <p v-if="sentence && addendum && eligibleForDocumentationAddendum(selection)">Co-signing with this request lets the claim continue through billing review. The author will sign a separate addendum.</p>
  <p v-else-if="sentence && !addendum">The corrected version must be signed and reviewed before the claim can proceed.</p>
</template>
