<template>
  <section class="packet-step" :class="{ expanded }" :aria-label="step.title">
    <header><div><small>ITSCO · {{ packet?.title || 'Choose a job posting' }}</small><h2>{{ step.title }}</h2><p>Practice mode · Entries and signatures stay in this test session.</p></div><button @click="expanded = !expanded">{{ expanded ? 'Return to normal view' : 'Expand document' }}</button></header>
    <p v-if="!packet">Choose an ITSCO job posting to load the actual documents for these steps.</p>
    <template v-else>
      <p v-if="step.key === 'agreement'">{{ packet.configName }} · Pay category {{ packet.category || 'not selected' }} · Level {{ packet.level || 'not selected' }}</p>
      <template v-if="step.key === 'background'">
        <PDFPreview class="reference-preview" v-if="referenceUrl" :pdf-url="referenceUrl" />
        <p v-else role="alert">The ITSCO reference release could not be loaded. Reopen packet setup to retry.</p>
      </template>
      <template v-else-if="step.key === 'job-description'">
        <JobDescriptionSections v-if="packet.descriptionSections" :sections="packet.descriptionSections" :title="packet.title" :schedule="packet.scheduleText" show-header />
        <div v-else-if="packet.description" class="job-text"><h3>{{ packet.title }}</h3><p>{{ packet.description }}</p></div>
        <PDFPreview v-if="jobFileUrl" :pdf-url="jobFileUrl" />
        <p v-if="packet.hasFile && !jobFileUrl" role="alert">The attached job description could not be loaded. Reopen packet setup to retry.</p>
        <p v-if="!hasJobContent" role="alert">This posting has no viewable job description. Add its content in Hiring before testing this step.</p>
      </template>
      <template v-else-if="step.key === 'agreement'">
        <p v-if="packet.sampleContract" role="status">This is a complete starter example because the selected agreement needs setup: {{ packet.sampleReason }}. It is not the selected live agreement.</p>
        <p v-if="packet.contractError" role="alert">{{ packet.contractError }}</p>
        <p v-if="packet.unresolvedTokens?.length" role="alert">This contract still needs values for: {{ packet.unresolvedTokens.join(', ') }}. You can review it here; complete the configuration before practicing the signature.</p>
        <iframe v-if="packet.html" :srcdoc="packet.html" sandbox="" title="Employment agreement in candidate step" />
      </template>
      <div v-if="step.submission?.signatureData" class="receipt"><strong>Practice signature saved</strong><p>Alex Demo · {{ new Date(step.submission.signedAt).toLocaleString() }}</p><img :src="step.submission.signatureData" alt="Alex Demo’s practice signature" /></div>
      <form v-else-if="!closed && !step.complete && documentAvailable" @submit.prevent="save">
        <label><input v-model="acknowledged" type="checkbox" /> {{ acknowledgement }}</label>
        <Signature v-model="signature" signer-name="Alex Demo" title="Sign as Alex Demo" legal-notice="Practice signature only. This does not authorize screening or create an employment agreement." />
        <button type="submit" :disabled="!acknowledged || !signature || busy">{{ busy ? 'Saving…' : 'Save practice signature' }}</button>
      </form>
      <p v-else-if="step.complete && !step.submission?.signatureData">Completed using the test shortcut. Restart prehire to practice signing this document.</p>
    </template>
    <button type="button" @click="expanded = false; $emit('configure')">{{ packet ? 'Change job or pay configuration' : 'Choose ITSCO job posting' }}</button>
  </section>
</template>
<script setup>
import {computed,ref} from 'vue';
import PDFPreview from '../documents/PDFPreview.vue';
import JobDescriptionSections from '../careers/JobDescriptionSections.vue';
import Signature from '../adaptive-intake/AdaptiveSignatureCapture.vue';
const props=defineProps({step:Object,closed:Boolean,packet:Object,referenceUrl:String,jobFileUrl:String,busy:Boolean});
const emit=defineEmits(['save','configure']);
const expanded=ref(false),acknowledged=ref(false),signature=ref('');
const hasJobContent=computed(()=>!!(props.packet?.description || props.packet?.descriptionSections || props.jobFileUrl));
const documentAvailable=computed(()=>props.step.key==='background'?!!props.referenceUrl:props.step.key==='job-description'?hasJobContent.value && (!props.packet?.hasFile || !!props.jobFileUrl):!!props.packet?.html && !props.packet?.contractError && !props.packet?.unresolvedTokens?.length);
const acknowledgement=computed(()=>({background:'I have reviewed this reference release and want to practice signing it.', 'job-description':'I have read and understand the responsibilities of this job.',agreement:'I have reviewed this employment agreement and its pay category and level.'}[props.step.key]));
function save(){if(documentAvailable.value && acknowledged.value && signature.value)emit('save',{acknowledged:true,signatureData:signature.value,signedAt:new Date().toISOString()});}
</script>
<style scoped>
.packet-step{font-size:15px}label{padding:12px;min-height:52px;align-items:center!important;border:1px solid #d0ded5;border-radius:8px;cursor:pointer}label input[type=checkbox]{width:24px;height:24px;min-width:24px;accent-color:#12583f;cursor:pointer}.reference-preview :deep(.viewer){height:auto;min-height:0;max-height:75vh}

.packet-step{padding:24px;background:white;border:1px solid #d0ded5;border-radius:12px;min-width:0;display:grid;gap:20px;color:#203e34}.packet-step.expanded{position:fixed;inset:12px;z-index:1100;overflow:auto;box-shadow:0 0 0 20px #172d2b88}.packet-step header{display:flex;justify-content:space-between;align-items:start;gap:16px}.packet-step h2{margin:8px 0;font-size:23px}.packet-step p{line-height:1.8;margin:8px 0}.packet-step small{font-size:12px}button{font:inherit;padding:12px 16px;background:white;border:1px solid #aac5b7;border-radius:7px;color:#12583f;cursor:pointer;justify-self:start}button:disabled{opacity:.5;cursor:default}form{display:grid;gap:20px}form>button{background:#12583f;color:white}label{display:flex;align-items:start;gap:10px;font-size:14px;line-height:1.6}iframe{width:100%;height:75vh;border:1px solid #d0ded5;border-radius:8px}.job-text{white-space:pre-wrap}.receipt{padding:20px;background:#edf5ee;border-radius:8px}.receipt img{max-width:260px;max-height:100px}[role=alert]{color:#8b3027;background:#fff2ed;padding:16px}.packet-step :deep(.jds-grid){grid-template-columns:minmax(0,1fr)}.packet-step :deep(.jds-card){width:100%;max-width:none}.packet-step :deep(.pdf-preview){min-width:0}.packet-step :deep(.viewer){max-width:100%;overflow:auto}@media(max-width:650px){.packet-step{padding:16px}.packet-step header{flex-direction:column}.packet-step.expanded{inset:4px}}
</style>
