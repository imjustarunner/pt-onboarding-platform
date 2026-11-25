<script setup>
import { computed,ref,watch,nextTick } from 'vue';
import {NARRIVA_CHECKS} from '../../config/narrivaBrand.js';
import NarrivaReviewProgress from './NarrivaReviewProgress.vue';
const props=defineProps({review:Object,busy:Boolean,preGeneration:Boolean});
const emit=defineEmits(['edit','approval']);
const editing=ref(false),edited=ref({});
const approvedSections=ref([]);
const approvalToken=computed(()=>props.preGeneration && ['passed','bypassed'].includes(props.review?.status) ? props.review?.draftApprovalToken : null);
function clearApproval(){
  approvedSections.value=[];
  emit('approval',null);
}
watch([()=>props.review?.id,approvalToken],()=>{
  editing.value=false;
  clearApproval();
});
watch(approvedSections,titles=>{
  const allApproved=Object.keys(sections.value).every(title=>titles.includes(title));
  emit('approval',approvalToken.value && titles.length && allApproved ? {token:approvalToken.value,sections:[...titles]} : null);
});
function startEdit(){clearApproval();edited.value={...sections.value};editing.value=true;nextTick(()=>document.querySelectorAll('.narriva-draft-editor').forEach(grow));}
function grow(event){const el=event.target || event;el.style.height='auto';el.style.height=el.scrollHeight+'px';}
function saveEdit(){emit('edit',{...edited.value});editing.value=false;}
const preview=computed(()=>props.preGeneration && props.review?.draftPreview);
const sections=computed(()=>props.review?.draftPreviewSections || {'Draft note':props.review?.draftPreview});
const sources=computed(()=>props.review?.enrollmentSources);
const instrumentLabel=value=>({phq9:'PHQ-9',phqa:'PHQ-A',gad7:'GAD-7',psc17:'PSC-17'})[value] || value;
</script>
<template>
  <section class="narriva-review-workspace" aria-label="Draft and compliance review">
    <NarrivaReviewProgress v-if="busy" :stage="review?.stage || (preGeneration ? 'sources' : 'checking')" />
    <p v-if="sources" class="narriva-source-summary" role="status">
      <template v-if="sources.submissions">Enrollment sources loaded · {{ sources.submissions }} completed {{ sources.submissions === 1 ? 'submission' : 'submissions' }} · {{ sources.clinicalAnswers }} clinical answers<template v-if="sources.instruments?.length"> · {{ sources.instruments.map(instrumentLabel).join(', ') }}</template></template>
      <template v-else>No completed enrollment clinical answers were found for this client in this workspace.</template>
    </p>
    <details v-if="review?.enrollmentPreview && Object.keys(review.enrollmentPreview).length" class="narriva-enrollment-preview">
      <summary>View enrollment information used</summary>
      <section v-for="(text,title) in review.enrollmentPreview" :key="title"><h3>{{ title }}</h3><p>{{ text }}</p></section>
    </details>
    <details v-if="review?.enrollmentAssessments?.length" class="narriva-enrollment-preview"><summary>Assessment evidence · automatically included</summary>
      <section v-for="(screen,index) in review.enrollmentAssessments" :key="index"><h3>{{ instrumentLabel(screen.instrumentKey) }} · {{ String(screen.submittedAt || '').slice(0,10) }}</h3><p>{{ screen.text }}</p><details><summary>View original answers</summary><p v-for="(item,i) in screen.items" :key="i">{{ item.question || item.label }} — {{ item.value ?? 'Unanswered' }}</p></details></section>
    </details>
    <div class="narriva-review-columns" :class="{'has-preview':preview}">
      <article v-if="preview" class="narriva-draft-preview" aria-label="Draft under review">
        <header><h2>{{ review?.status === 'stale' ? 'Previous draft' : 'Draft under review' }}</h2><p>{{ review?.status === 'stale' ? 'Your source content changed. Run checks again to update the draft.' : 'Review this wording alongside the findings. Confirmed additions will be used to update the final note.' }}</p></header>
        <p v-if="review?.manualEdited" class="narriva-edit-notice">Manually edited · retained for compliance review</p>
        <button v-if="!editing" type="button" :disabled="busy || review?.status === 'stale'" @click="startEdit">Edit draft</button>
        <p v-if="editing" class="narriva-edit-notice">Saving your changes rechecks this draft and records manual editing for compliance review.</p>
        <p v-if="approvalToken && !editing" class="narriva-approval-hint">Review and approve each section to enable Finalize note.</p>
        <section v-for="(text,title) in sections" :key="title">
          <h3>{{ title }}</h3>
          <textarea v-if="editing" class="narriva-draft-editor" v-model="edited[title]" :aria-label="title" @input="grow" />
          <template v-else>
            <p>{{ text }}</p>
            <label v-if="approvalToken" class="narriva-section-approval">
              <input v-model="approvedSections" type="checkbox" :value="title" :disabled="busy" />
              I reviewed and approve {{ title }}
            </label>
          </template>
        </section>
        <div v-if="editing"><button type="button" @click="saveEdit">Save edits and recheck</button><button type="button" @click="editing=false">Cancel</button></div>
      </article>
      <div class="narriva-review-findings"><div v-if="busy && preview" class="narriva-pending-checks"><h2>Checking the draft</h2><ul><li v-for="check in NARRIVA_CHECKS" :key="check.id">{{ ['90791','H0031'].includes(review?.documentationCode) && check.id === 'participation_plan' ? 'Assessment Recommendations' : review?.clientPresent === false && check.id === 'participation_plan' ? 'Progress & Plan' : check.label }}<span>Reviewing</span></li></ul></div><slot /></div>
    </div>
  </section>
</template>
<style scoped>
.narriva-review-workspace{container-type:inline-size;min-width:0;display:grid;gap:14px;scroll-margin-top:100px}
.narriva-review-columns{display:grid;gap:20px;align-items:start;min-width:0}
.narriva-draft-preview{box-sizing:border-box;border:1px solid #ccdae5;border-radius:12px;background:#fff;padding:20px;min-width:0;color:#1c3448}
.narriva-draft-preview header{padding-bottom:12px;border-bottom:2px solid #dce7ef}.narriva-draft-preview h2{font-size:18px;margin:0 0 6px}.narriva-draft-preview header p,.narriva-source-summary{font-size:12px;color:#536c7f;line-height:1.5}
.narriva-source-summary{padding:10px 14px;background:#edf5fb;border-radius:8px;margin:0}
.narriva-draft-preview section{padding:12px 0;border-bottom:1px solid #e7edf2}.narriva-draft-preview h3{font-size:14px;margin:0 0 8px}.narriva-draft-preview section p{font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.narriva-enrollment-preview{padding:12px 16px;border:1px solid #cddce6;border-radius:8px;color:#254760}.narriva-enrollment-preview summary{cursor:pointer;font-size:13px;font-weight:650}.narriva-enrollment-preview h3{font-size:13px}.narriva-enrollment-preview p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5}
.narriva-draft-editor{box-sizing:border-box;width:100%;min-height:90px;resize:vertical;overflow:hidden;font:inherit;font-size:14px;line-height:1.65;border:1px solid #b5c9d8;border-radius:6px;padding:10px}.narriva-draft-preview button{font:inherit;font-size:13px;color:#174f75;background:#f2f7fc;border:1px solid #b8cfdf;border-radius:7px;padding:9px 12px;cursor:pointer;margin-right:8px}.narriva-edit-notice{font-size:12px;color:#84601c}
.narriva-review-findings{min-width:0}.narriva-review-findings :deep(.narriva-compliance){margin:0}.narriva-pending-checks{padding:20px;background:#f6faff;border:1px solid #d4e3ed;border-radius:12px}.narriva-pending-checks h2{font-size:16px;margin:0 0 10px}.narriva-pending-checks ul{list-style:none;margin:0;padding:0}.narriva-pending-checks li{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #dde7ef;font-size:13px}.narriva-pending-checks span{color:#647b8d}
@container(min-width:850px){.narriva-review-columns.has-preview{grid-template-columns:minmax(0,1fr) minmax(380px,1fr)}}
@media(max-width:600px){.narriva-draft-preview{padding:14px}}
.narriva-approval-hint{font-size:13px;color:#47647b;margin:12px 0 0}
.narriva-section-approval{display:flex;align-items:center;gap:8px;margin-top:10px;color:#205779;font-size:13px;min-height:32px;cursor:pointer}
</style>
