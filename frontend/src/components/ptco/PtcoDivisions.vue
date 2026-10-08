<template>
 <section id="powered-by-plottwistco" class="ptco-band"><div class="ptco-wrap">
  <div class="ptco-centered"><p class="ptco-eyebrow">Powered by PlotTwistCo</p><h2>Strong foundations. Room to grow.</h2><p>Workforce Operations supports the people and systems behind your business. Strategic Operations develops your brand, presence, and growth.</p></div>
  <div class="division-grid"><article v-for="division in divisions" :key="division.name" class="ptco-card"><p class="ptco-eyebrow">{{division.label}}</p><h2>{{division.name}}</h2><h3>{{division.title}}</h3><p>{{division.body}}</p>
   <dl v-if="detailed"><template v-for="area in division.areas" :key="area[0]"><dt>{{area[0]}}</dt><dd>{{area[1]}}</dd></template></dl>
   <ul v-else><li v-for="area in division.areas" :key="area[0]">{{area[0]}}</li></ul>
   <p v-if="division.product" class="division-product"><a :href="PLOTLINE_WEBSITE_URL">Plotline · People operations →</a><span>Our people operations product within Workforce Operations. Use it on its own or connect it with other PlotTwistCo products.</span></p>
   <router-link v-if="!detailed" to="/p/ptco/services#powered-by-plottwistco">Explore {{division.name}} →</router-link>
  </article></div>
  <div v-if="detailed" class="division-scope"><h3>How we work</h3><p>We agree on the services, responsibilities, goals, and reporting your organization needs. Your management agreement defines the scope across Workforce Operations and Strategic Operations, whether you work with us as an associate, affiliate, or subsidiary.</p><router-link class="ptco-button" to="/p/ptco/start">Discuss your scope →</router-link></div>
 </div></section>
</template>
<script setup>
import { PLOTLINE_WEBSITE_URL } from '../../utils/plotline';
defineProps({detailed:Boolean});
const divisions=[
 {name:'Workforce Operations',label:'People and business support',product:true,title:'Operations that hold the business together.',body:'We keep you running—financially sound, compliant, and ready to support your people.',areas:[
 ['Credentialing & Payer Enrollment','Provider enrollment, credential maintenance, and approval tracking to support compliant billing.'],
 ['Billing & Collections','Claims submission, denial management, accounts receivable tracking, patient balance management, and structured collections follow-up.'],
 ['Financial Management','Bookkeeping, account balancing, tax preparation and filings, payroll processing, and financial compliance and reporting.'],
 ['Compliance','Policy and procedure development, HIPAA and 42 CFR Part 2 safeguards, internal audits, documentation quality assurance, and risk management.'],
 ['People Operations · Plotline','Recruiting, onboarding and organizational socialization, training, performance support, and workforce development.']]},
 {name:'Strategic Operations',label:'Brand and growth support',title:'Strategy that carries the business forward.',body:'We amplify your story so the right people find you, trust you, and stay with you.',areas:[
 ['Branding','Positioning, naming, messaging, voice, visual identity systems, and brand governance.'],
 ['Design','Web and digital design, print collateral, environmental signage, and customer experience design systems that grow with your business.'],
 ['Outreach','Strategic partnerships, event coordination, community presence, referral network building, and public relations.'],
 ['Content','Editorial planning, blogs and articles, video production, social media campaigns, patient education resources, and performance measurement to guide the next iteration.']]}
];
</script>
<style scoped>
.division-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.division-grid{margin-top:32px}.division-grid h2{font-size:clamp(28px,3vw,40px)}.division-product{padding:18px;background:#f1f5f2;border-radius:8px}.division-product a{font-weight:700}.division-product span{display:block;margin-top:8px;font-size:14px}.division-grid dt{font-weight:700;margin-top:22px}.division-grid dd{margin:8px 0;color:#535b6e}.division-grid li{margin:12px 0}.division-scope{max-width:850px;margin:40px auto 0}@media(max-width:700px){.division-grid{grid-template-columns:1fr}}
</style>
