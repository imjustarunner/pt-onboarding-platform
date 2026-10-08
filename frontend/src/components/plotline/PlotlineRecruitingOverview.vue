<template>
  <section class="pl-wide pl-section pl-recruiting-overview" aria-labelledby="pl-recruiting-title">
    <div class="pl-recruiting-intro">
      <div><p class="pl-eyebrow">Included with recruiting</p><h2 id="pl-recruiting-title">Your online front door.<br>The start of <em>every hire.</em></h2><p>Build a branded careers page that introduces your organization, shares your culture, and brings your open roles together. Link it from your website and outreach so the people you reach have a clear place to apply.</p><p>Your careers page is part of Plotline recruiting and included in every plan. Your name, logo, and story lead; Plotline quietly connects the steps behind them.</p><router-link to="/plottline/start" class="pl-button">Build your recruiting presence →</router-link></div>
      <PlotlineProductExample screen="careers" title="Branded careers page · included with recruiting"/>
    </div>
    <ol class="pl-recruiting-journey" aria-label="From careers page to onboarding">
      <li v-for="(step,index) in steps" :key="step.title"><span aria-hidden="true">0{{ index+1 }}</span><h3>{{ step.title }}</h3><p>{{ step.body }}</p></li>
    </ol>
    <router-link to="/plottline/careers#careers-powered-by-plotline" class="pl-text-link">See live organization careers pages →</router-link>
  </section>
</template>
<script setup>
import PlotlineProductExample from './PlotlineProductExample.vue';
const steps=[
  {title:'Build your presence',body:'Make your organization’s story, benefits, and open roles easy to find on your branded careers page.'},
  {title:'Welcome applications',body:'Candidates apply from your careers page and receive confirmation and clear next steps.'},
  {title:'Move hiring forward',body:'Review candidates, arrange interviews, and keep feedback and decisions together.'},
  {title:'Welcome your hire',body:'Continue into onboarding with documents, tasks, and learning in the same people workspace.'}
];
</script>
<style scoped>
.pl-recruiting-intro{display:grid;grid-template-columns:1fr 1fr;gap:65px;align-items:center}.pl-recruiting-intro>div>p:not(.pl-eyebrow){font-size:14px;max-width:510px}.pl-recruiting-intro .pl-button{margin-top:12px}.pl-recruiting-journey{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));list-style:none;padding:0;margin:45px 0 24px;gap:26px}.pl-recruiting-journey li{border-top:2px solid #d9a58b;padding-top:18px}.pl-recruiting-journey span{font-size:11px;color:#89614a}.pl-recruiting-journey h3{font-size:18px;margin:14px 0 10px}.pl-recruiting-journey p{font-size:13px;margin:0}@media(max-width:950px){.pl-recruiting-intro{gap:30px}.pl-recruiting-journey{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.pl-recruiting-intro{grid-template-columns:1fr}.pl-recruiting-journey{gap:24px 20px}.pl-recruiting-journey h3{font-size:16px}}@media(max-width:390px){.pl-recruiting-journey{grid-template-columns:1fr}}
</style>
