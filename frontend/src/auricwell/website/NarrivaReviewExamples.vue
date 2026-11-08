<template>
 <section class="narriva-review-examples" aria-label="Narriva summary and treatment progress examples" data-analytics-area="narriva-review" data-analytics-label="Narriva review examples">
  <header data-analytics-label="Narriva supervisor review example"><div class="nr-provider"><img src="/assets/schoolcarebridge/demo-tessa.png" alt="Fictional portrait of Dr. Tessa Brooks" loading="lazy" width="56" height="70"/><div><span>MY WORK · SUPERVISOR REVIEW</span><h3>Emerson Cole <small>Fictional client</small></h3><p>Avery Lane, LPC · Couples therapy · Nov 6, 2026</p></div></div><img class="nr-mark" :src="NARRIVA_BRAND.logo" alt="Narriva by AuricWell"/></header>
  <div class="nr-switch" role="group" aria-label="Choose a review example"><button type="button" :aria-pressed="view==='summary'" @click="view='summary'" data-analytics-id="narriva-summary">View summary</button><button type="button" :aria-pressed="view==='history'" @click="view='history'" data-analytics-id="narriva-history">Treatment progress</button></div>
  <div class="nr-content">
   <template v-if="view==='summary'"><h3>Session quick look</h3><NarrivaNoteSummary :quick-look="insights.quickLook" :source-revision="insights.sourceRevision" @open-note="notice='Open note takes you to the full saved note in the app. Explore it in the Narriva walkthrough above.'"/></template>
   <template v-else><div class="nr-trends" role="group" aria-label="Explore illustrative progress trends"><span>Compare examples:</span><button v-for="item in trends" :key="item.id" type="button" :aria-pressed="trend===item.id" @click="trend=item.id" data-analytics-id="narriva-trend">{{ item.label }}</button></div><NarrivaTreatmentHistory :history="history"/></template>
   <p v-if="notice" class="nr-notice" role="status">{{ notice }}</p>
  </div>
  <footer>Synthetic five-session history · Actual app components · Scores and trends illustrate the interface, not patient outcomes. Nothing is fetched from a chart.</footer>
 </section>
</template>
<script setup>
import {computed,ref} from 'vue';
import NarrivaNoteSummary from '../../components/clinical/NarrivaNoteSummary.vue';
import NarrivaTreatmentHistory from '../../components/clinical/NarrivaTreatmentHistory.vue';
import {NARRIVA_BRAND} from '../../config/narrivaBrand.js';
import {exampleReviewInsights,exampleTreatmentHistory} from '../demo/narriva.js';
const view=ref('history'),trend=ref('progressing'),notice=ref('');
const trends=[{id:'progressing',label:'Progressing'},{id:'stagnation',label:'Stagnation'},{id:'regression',label:'Regression'}];
const insights=exampleReviewInsights();
const history=computed(()=>exampleTreatmentHistory({trend:trend.value}));
</script>
<style scoped>
.narriva-review-examples{background:white;border:1px solid #d5e1ee;border-radius:16px;box-shadow:0 14px 42px #2248700a;overflow:hidden;color:#203b56;min-width:0;max-width:940px;margin:auto;font-family:Inter,Arial,sans-serif}.narriva-review-examples>header{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:22px 26px;border-bottom:1px solid #dfe7f0;background:linear-gradient(110deg,#f7faff,#fff)}.nr-provider{display:flex;gap:14px;align-items:center}.nr-provider>img{object-fit:cover;border-radius:8px;flex:none}.nr-provider span{font-size:9px;letter-spacing:1px;color:#6f85a0}.nr-provider h3{font-size:20px;margin:7px 0}.nr-provider h3>small{font-size:10px;font-weight:400;color:#73869c;display:inline-block;margin-left:8px}.nr-provider p{font-size:11px!important;margin:0!important;color:#637b96;line-height:1.8!important}.nr-mark{width:150px;max-width:25%;height:auto}.nr-switch{display:flex;gap:10px;padding:18px 26px 0}.nr-switch button,.nr-trends button{font:inherit;font-size:12px;padding:10px 14px;border:1px solid #cedded;border-radius:7px;background:white;color:#355e87;cursor:pointer}.nr-switch button[aria-pressed=true],.nr-trends button[aria-pressed=true]{background:#eaf2fd;border-color:#89addb;color:#184d87;font-weight:650}.nr-content{padding:20px 26px}.nr-content>h3{font-size:17px;margin:0 0 15px}.nr-trends{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:18px}.nr-trends span{font-size:11px;color:#6f8197}.nr-trends button{font-size:11px;padding:7px 10px}.nr-notice{font-size:12px!important;line-height:1.8!important;background:#f3f7fd;padding:14px;border-radius:8px}.narriva-review-examples>footer{background:#fbfdff;border-top:1px solid #dfe7f0;padding:14px 26px;font-size:10px;line-height:1.8;color:#6f829a}.narriva-review-examples :focus-visible{outline:3px solid #b38a3c;outline-offset:3px}@media(max-width:600px){.narriva-review-examples>header{padding:16px}.nr-mark{display:none}.nr-provider{gap:10px}.nr-provider h3{font-size:18px}.nr-provider h3>small{margin:3px 0;display:block}.nr-content{padding:16px}.nr-switch{padding:16px 16px 0}.nr-switch button{flex:1;font-size:11px;padding:10px}.narriva-review-examples>footer{padding:14px 16px}}
</style>
