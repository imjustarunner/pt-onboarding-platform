<template>
  <details class="hub-training">
    <summary>Learn Documentation Hub · current workflow and EHR workflow</summary>
    <p>Use the guide for the record system your agency currently uses. Completing this guide is not a condition of submitting worked time.</p>
    <div class="track-buttons" role="group" aria-label="Choose your documentation workflow">
      <button type="button" :aria-pressed="track==='current'" @click="track='current'">Before the EHR transition</button>
      <button type="button" :aria-pressed="track==='ehr'" @click="track='ehr'">When chart documentation is enabled</button>
    </div>
    <template v-if="track==='current'">
      <h4>Draft here, finish in your current record system</h4>
      <ol>
        <li>Open <strong>Documentation Hub</strong>. Choose the appropriate note type, then the correct client or permitted initials. Confirm the service date and service details.</li>
        <li>Enter what actually occurred: the intervention, client response, progress toward goals, and next steps. For treatment planning, identify the goals and measurable objectives being created or revised.</li>
        <li>Generate a draft. Read and edit every section; correct unsupported statements, diagnoses, dates, and service details.</li>
        <li>Use <strong>Copy</strong> on the reviewed sections and transfer them to the appropriate fields in your current record system, such as Therapy Notes. Verify the client again and complete that system’s required review and signature.</li>
        <li><strong>Save Draft</strong> preserves work in progress. A generated or copied draft is not a signed clinical record.</li>
      </ol>
    </template>
    <template v-else>
      <h4>Draft and complete the note in the clinical chart</h4>
      <p>Use this workflow only after your agency enables chart documentation for your role.</p>
      <ol>
        <li>Open the correct client/session from the chart or note queue. Confirm the linked client, service date, and service type before writing.</li>
        <li>Review the chart context and relevant treatment goals. Document the work actually performed, then generate the appropriate draft.</li>
        <li>Review and correct every section. Check any diagnosis or treatment-plan changes before applying them to the chart.</li>
        <li>Use the completion action shown for that document: <strong>Sign</strong> for a clinical note, or the appropriate review/save action for other documents. Complete supervisor review when required.</li>
        <li>Verify that the note shows its completed status in the chart. Generating a draft alone does not sign it. Use the amendment workflow to correct an already signed note.</li>
      </ol>
    </template>
    <div class="training-example">
      <strong>Practice example · fictional, no client information</strong>
      <p>This is the actual session-summary component used in Documentation Hub, displaying sample data. Check these fields before generating or signing.</p>
      <NoteAidQuickSessionBar client-label="DEMO — fictional client" :client-linked="track==='ehr'" date-of-service="2026-10-15" service-code="90837" service-label="Individual therapy" :duration-minutes="60" location-label="Sample office" clinician-label="Demo provider" :editable="false" :setup-complete="true" />
      <p><b>Progress note:</b> “Practiced paced breathing and a coping plan. Client identified two situations to try the skill. Review practice and barriers next session.”</p>
      <p><b>Treatment-plan revision:</b> “Reviewed progress toward the existing coping goal. Revised the objective to practice one selected skill three times before the next visit and review the result.”</p>
      <p>Check that the generated draft preserves those facts without inventing symptoms, risk findings, diagnoses, or interventions. Only enter facts that apply to the actual service.</p>
    </div>
    <a :href="workspaceHref" target="_blank" rel="noopener">Open Documentation Hub in a new tab ↗</a>
    <p>If the workspace cannot handle the task or is unavailable, use your agency’s approved documentation workflow and explain that in the time request. Keep client names and clinical details out of payroll explanations.</p>
  </details>
</template>
<script setup>
import { ref, computed } from 'vue';
import NoteAidQuickSessionBar from '../clinical/NoteAidQuickSessionBar.vue';
import { useRoute } from 'vue-router';
import { noteAidPath } from '../../utils/indirectTimeNav';
const track = ref('current');
const route = useRoute();
const workspaceHref = computed(() => noteAidPath(route) + '?launchIntent=note');
</script>
<style scoped>
.hub-training{padding:16px;border:1px solid #cbdad5;border-radius:12px;background:#fff;line-height:1.6}.hub-training summary{cursor:pointer;font-weight:650}.track-buttons{display:flex;flex-wrap:wrap;gap:8px}.track-buttons button{font:inherit;padding:10px;border:1px solid #b5cec4;border-radius:8px;background:#fff;cursor:pointer}.track-buttons button[aria-pressed=true]{background:#e4f3ec;color:#155b48}.hub-training li{margin-bottom:10px}.training-example{padding:14px;background:#f2f6fa;border-radius:10px;margin-bottom:14px}.hub-training a{color:#175e52;font-weight:650}
</style>
