<template>
 <section aria-label="Your company preview">
  <p class="pl-eyebrow">The same brand, every next step</p><h2>Your company’s journey</h2><p class="pl-muted">Example content · Unpublished</p>
  <nav class="pl-preview-tabs" aria-label="Preview surface"><button v-for="tab in tabs" :key="tab.id" type="button" :aria-pressed="surface===tab.id" @click="surface=tab.id">{{tab.label}}</button></nav>
  <p class="pl-muted" role="status">{{ descriptions[surface] }}</p>
  <PlotlineCompanyFrame :brand="brand" :context="tabs.find(t=>t.id===surface)?.label+' · '+(name||'Your company')">
   <div class="pl-company-identity"><img v-if="logo" :src="logo" class="pl-company-logo" alt="Company logo"><span v-else class="pl-company-initials">{{ initials }}</span><div><strong>{{name||'Your company'}}</strong><small>Your people journey</small></div></div>
   <div class="pl-preview-content">
    <template v-if="surface==='careers'"><p class="pl-eyebrow">Work with us</p><h2 class="pl-company-title">{{brand?.headline||'Make meaningful work happen.'}}</h2><p>{{brand?.introduction||brand?.mission||'Tell your company’s story in your own words.'}}</p><div class="pl-company-card"><h3>Room for your next chapter</h3><p>Your published jobs will appear here after you create and review them.</p></div></template>
    <template v-else-if="surface==='workspace'"><p class="pl-eyebrow">Your people, in one place</p><h2 class="pl-company-title">A thoughtful place to begin.</h2><p>Start with one useful next step. You can keep building from here.</p><div v-for="item in ['Create your first job','Welcome an applicant','Prepare onboarding']" :key="item" class="pl-company-card">{{item}}</div></template>
    <template v-else><p class="pl-eyebrow">{{surface==='prehire'?'Before your first day':surface==='onboarding'?'Welcome to the team':'Your next chapter'}}</p><h2 class="pl-company-title">{{surface==='prehire'?'Let’s get ready.':surface==='onboarding'?'Make yourself at home.':'A thoughtful transition.'}}</h2><p>{{surface==='offboarding'?'Your handover, documents and next steps in one place.':'Get to know your company and the people who will help you get started.'}}</p><div v-for="(item,index) in tasks" :key="item" class="pl-company-card"><strong>{{index+1}}. {{item}}</strong><p class="pl-muted">Example assigned step</p></div></template>
   </div>
  </PlotlineCompanyFrame>
 </section>
</template>
<script setup>
import {computed,ref} from 'vue';
import PlotlineCompanyFrame from './PlotlineCompanyFrame.vue';
const props=defineProps({name:String,brand:Object,logo:String});
const surface=ref('careers');
const tabs=[{id:'workspace',label:'Workspace'},{id:'careers',label:'Careers'},{id:'prehire',label:'Pre-hire'},{id:'onboarding',label:'Onboarding'},{id:'offboarding',label:'Offboarding'}];
const descriptions={workspace:'Your team’s day-to-day workspace.',careers:'Your company’s public careers page.',prehire:'A candidate’s portal before joining.',onboarding:'A new employee’s onboarding portal after hiring.',offboarding:'An employee’s transition portal.'};
const initials=computed(()=>(props.name||'Your company').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase());
const tasks=computed(()=>surface.value==='offboarding'?['Your handover','Return company items','Your retained documents']:surface.value==='prehire'?['Review your role','Complete your documents','Ask a question']:['Meet your company','Your first week','Connect with your team']);
</script>
<style scoped>
.pl-preview-tabs{display:flex;flex-wrap:wrap;gap:6px}.pl-preview-tabs button{font-size:12px;padding:7px 11px}.pl-preview-tabs button[aria-pressed=true]{background:#0F2D24;color:white}.pl-preview-content{padding:24px}.pl-preview-content .pl-company-card{margin:14px 0}.pl-preview-content .pl-company-card p{margin:8px 0 0}.pl-preview-content h3{margin-top:0}.pl-company-frame{border:1px solid #cad8cd;border-radius:16px;overflow:hidden}
</style>
