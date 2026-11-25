<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { NARRIVA_BRAND } from '../../config/narrivaBrand.js';
const props = defineProps({stage:{type:String,default:'sources'}});
const elapsed = ref(0);
let timer;
onMounted(() => { const started=Date.now(); timer=setInterval(()=>{elapsed.value=Math.floor((Date.now()-started)/1000);},1000); });
onUnmounted(()=>clearInterval(timer));
const steps = [
  {id:'sources',label:'Load the encounter and available clinical sources'},
  {id:'drafting',label:'Write the note using your narrative and clinical context'},
  {id:'checking',label:'Check the draft against the selected service and source facts'}
];
const active = computed(()=>Math.max(0,steps.findIndex(step=>step.id===props.stage)));
</script>
<template>
  <section class="narriva-review-progress" role="status" aria-live="polite" :aria-label="stage === 'finalizing' ? 'Note finalization progress' : 'Narriva review progress'">
    <header><img :src="NARRIVA_BRAND.compliance" alt="Narriva Compliance" /><span>{{ elapsed }}s elapsed</span></header>
    <strong>{{ stage === 'finalizing' ? 'Finalizing your note…' : active === 2 ? 'Checking your session…' : active === 1 ? 'Writing your draft…' : 'Preparing your session…' }}</strong>
    <div class="narriva-progress-track" role="progressbar" :aria-valuetext="stage === 'finalizing' ? 'Finalizing your note' : steps[active].label" aria-label="Narriva is working"><span /></div>
    <ol v-if="stage !== 'finalizing'"><li v-for="(step,index) in steps" :key="step.id" :class="{current:index===active,done:index<active}"><span aria-hidden="true">{{ index<active?'✓':index===active?'●':'○' }}</span>{{ step.label }}</li></ol>
    <p v-if="elapsed >= 30">Your draft is saved. This step is still running.</p>
  </section>
</template>
<style scoped>
.narriva-review-progress{display:grid;gap:14px;padding:20px;border:1px solid #cbdce9;border-radius:12px;background:#f7fbff;color:#173754}
.narriva-review-progress header{display:flex;align-items:center;justify-content:space-between;gap:12px}.narriva-review-progress img{width:min(240px,65%);height:auto}.narriva-review-progress header span,.narriva-review-progress p{font-size:12px;color:#536d82}.narriva-review-progress p{margin:0}
.narriva-progress-track{height:6px;overflow:hidden;background:#dce8f0;border-radius:6px}.narriva-progress-track span{display:block;width:35%;height:100%;background:#276c98;animation:narriva-progress 1.8s ease-in-out infinite alternate}
.narriva-review-progress ol{display:grid;gap:9px;list-style:none;margin:0;padding:0;font-size:13px}.narriva-review-progress li{display:flex;gap:9px;color:#6b7e8e}.narriva-review-progress li.current{color:#17496a;font-weight:650}.narriva-review-progress li.done{color:#28714e}
@keyframes narriva-progress{to{transform:translateX(185%)}}
@media(prefers-reduced-motion:reduce){.narriva-progress-track span{animation:none}}
</style>
