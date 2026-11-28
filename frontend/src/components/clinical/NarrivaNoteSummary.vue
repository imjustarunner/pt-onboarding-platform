<template>
 <div class="narriva-note-summary">
  <p class="nra-explainer">A quick look at the saved note. Open the note to review its full content before signing.</p>
  <section v-if="Object.keys(quickLook.aiSummary || {}).length" class="nra-summary">
    <h4>Narriva summary</h4>
    <dl class="nra-sections">
      <div v-for="item in summaryFields" v-show="quickLook.aiSummary[item.key]" :key="item.key">
        <dt>{{ item.label }}</dt><dd>{{ quickLook.aiSummary[item.key] }}</dd>
      </div>
    </dl>
  </section>
  <section v-if="quickLook.submissionReview" class="nra-summary" aria-label="Submission review">
    <h4>Submission review<span v-if="quickLook.submissionReview.score !== null"> · {{ quickLook.submissionReview.score }}%</span></h4>
    <p v-if="['running','pending'].includes(quickLook.submissionReview.status)">Narriva is reviewing the signed note.</p>
    <ul v-else-if="quickLook.submissionReview.findings?.length"><li v-for="finding in quickLook.submissionReview.findings" :key="finding">{{ finding }}</li></ul>
    <p v-else-if="quickLook.submissionReview.score !== null">No items flagged for review.</p>
    <p v-else>Score unavailable<span v-if="quickLook.submissionReview.message">. {{ quickLook.submissionReview.message }}</span><span v-else> for this version.</span></p>
  </section>
  <details :open="!Object.keys(quickLook.aiSummary || {}).length">
    <summary>Saved note excerpts</summary>
  <dl class="nra-sections"><div v-for="section in quickLook.sections || []" :key="section.key || section.label"><dt>{{ section.label }}</dt><dd>{{ section.text || 'Not recorded' }}</dd></div></dl>
  <p v-if="!quickLook.sections?.length">No saved narrative sections are available.</p>
  </details>
  <section class="nra-artifacts" aria-label="Session artifacts"><h4>Artifacts and supporting materials</h4><p v-if="quickLook.artifactsStatus==='unavailable'" role="status">Supporting materials could not be checked. Open the note to review its attachments.</p><ul v-else-if="quickLook.artifacts?.length"><li v-for="artifact in quickLook.artifacts" :key="artifact.id"><strong>{{ artifact.title || 'Supporting material' }}</strong><span v-if="artifact.type"> · {{ artifact.type }}</span><p v-if="artifact.text || artifact.summary">{{ artifact.text || artifact.summary }}</p><button type="button" @click="$emit('open-note')">View in note</button></li></ul><p v-else>No artifacts listed for this note.</p></section>
  <p v-if="sourceRevision.id" class="nra-version">Saved revision {{ sourceRevision.id }}. Signing validates the current version again.</p>
 </div>
</template>
<script setup>
import {computed} from 'vue';
const props=defineProps({quickLook:{type:Object,default:()=>({})},sourceRevision:{type:Object,default:()=>({})}});
const quickLook=computed(()=>props.quickLook||{}),sourceRevision=computed(()=>props.sourceRevision||{});
const summaryFields=[{key:'service',label:'Service provided'},{key:'response',label:'How the encounter went'},{key:'status',label:'Client status and progress'}];
defineEmits(['open-note']);
</script>
<style scoped>
.narriva-note-summary{font-size:13px;line-height:1.6;overflow-wrap:anywhere;color:#203b56}.nra-explainer,.nra-version{color:#63788c;font-size:12px}.nra-sections{margin:14px 0}.nra-sections>div{margin:0 0 14px}.nra-sections dt{font-size:12px;font-weight:700;color:#214f75;margin-bottom:4px}.nra-sections dd{margin:0;white-space:pre-wrap}.nra-artifacts{border-top:1px solid #e1e9f0;padding-top:10px}.nra-artifacts h4{margin:0 0 8px}.nra-artifacts ul{list-style:none;margin:0;padding:0}.nra-artifacts li{padding:9px;border-radius:7px;background:#f3f7fb;margin:7px 0}.nra-artifacts button{font:inherit;font-size:12px;padding:7px 10px;background:#f2f7fc;border:1px solid #ccddea;border-radius:7px;color:#235176;cursor:pointer}.nra-artifacts button:focus-visible{outline:2px solid #2869b3;outline-offset:2px}
</style>
