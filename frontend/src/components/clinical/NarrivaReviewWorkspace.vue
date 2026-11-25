<script setup>
import { computed } from 'vue';
import {NARRIVA_CHECKS} from '../../config/narrivaBrand.js';
import NarrivaReviewProgress from './NarrivaReviewProgress.vue';
const props=defineProps({review:Object,busy:Boolean,preGeneration:Boolean});
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
    <div class="narriva-review-columns" :class="{'has-preview':preview}">
      <article v-if="preview" class="narriva-draft-preview" aria-label="Draft under review">
        <header><h2>{{ review?.status === 'stale' ? 'Previous draft' : 'Draft under review' }}</h2><p>{{ review?.status === 'stale' ? 'Your source content changed. Run checks again to update the draft.' : 'Review this wording alongside the findings. Confirmed additions will be used to update the final note.' }}</p></header>
        <section v-for="(text,title) in sections" :key="title"><h3>{{ title }}</h3><p>{{ text }}</p></section>
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
.narriva-review-findings{min-width:0}.narriva-review-findings :deep(.narriva-compliance){margin:0}.narriva-pending-checks{padding:20px;background:#f6faff;border:1px solid #d4e3ed;border-radius:12px}.narriva-pending-checks h2{font-size:16px;margin:0 0 10px}.narriva-pending-checks ul{list-style:none;margin:0;padding:0}.narriva-pending-checks li{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #dde7ef;font-size:13px}.narriva-pending-checks span{color:#647b8d}
@container(min-width:850px){.narriva-review-columns.has-preview{grid-template-columns:minmax(0,1fr) minmax(380px,1fr)}}
@media(max-width:600px){.narriva-draft-preview{padding:14px}}
</style>
