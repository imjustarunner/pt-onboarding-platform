<template>
 <section id="powered-by-plottwistco" class="ptco-band"><div class="ptco-wrap">
  <div class="ptco-centered"><p class="ptco-eyebrow">Powered by PlotTwistCo</p><h2>Strong foundations. Room to grow.</h2><p>We run the critical back office and shape the outward story so mental health organizations and other service businesses can focus on the people they serve.</p></div>
  <div class="division-tree"><span><strong>Plotline</strong>Roots &amp; trunk · Structure and stability</span><span aria-hidden="true">↑</span><span><strong>Storyline</strong>Branches &amp; crown · Growth and reach</span></div>
  <div class="division-grid"><article v-for="division in divisions" :key="division.name" class="ptco-card"><p class="ptco-eyebrow">{{division.label}}</p><h2>{{division.name}}</h2><h3>{{division.title}}</h3><p>{{division.body}}</p>
   <dl v-if="detailed"><template v-for="area in division.areas" :key="area[0]"><dt>{{area[0]}}</dt><dd>{{area[1]}}</dd></template></dl>
   <ul v-else><li v-for="area in division.areas" :key="area[0]">{{area[0]}}</li></ul>
   <p v-if="detailed" class="division-legal">On invoices and official documents: {{division.legal}}</p><router-link v-else to="/p/ptco/services#powered-by-plottwistco">Explore {{division.name}} →</router-link>
  </article></div>
  <div v-if="detailed" class="division-scope"><h3>How we work</h3><p>We agree on the services, responsibilities, goals, and reporting your organization needs. Your management agreement defines the scope across Plotline and Storyline, whether you work with us as an associate, affiliate, or subsidiary.</p><router-link class="ptco-button" to="/p/ptco/start">Discuss your scope →</router-link></div>
 </div></section>
</template>
<script setup>
defineProps({detailed:Boolean});
const divisions=[
 {name:'Plotline',label:'Operational division',title:'Operations that hold the business together.',body:'We keep you running—financially sound, compliant, and ready to support your people.',legal:'PlotTwist, LLC dba Plotline (and, where applicable, Plotline Collections).',areas:[
 ['Credentialing & Payer Enrollment','Provider enrollment, credential maintenance, and approval tracking to support compliant billing.'],
 ['Billing & Collections · Plotline Collections','Claims submission, denial management, accounts receivable tracking, patient balance management, and structured collections follow-up.'],
 ['Financial Management · Plotline Financial','Bookkeeping, account balancing, tax preparation and filings, payroll processing, and financial compliance and reporting.'],
 ['Compliance · Guideline','Policy and procedure development, HIPAA and 42 CFR Part 2 safeguards, internal audits, documentation quality assurance, and risk management.'],
 ['People Operations · Baseline','Recruiting, onboarding and organizational socialization, training, performance support, and workforce development.']]},
 {name:'Storyline',label:'Strategic division',title:'Strategy that carries the business forward.',body:'We amplify your story so the right people find you, trust you, and stay with you.',legal:'PlotTwist, LLC dba Storyline.',areas:[
 ['Branding','Positioning, naming, messaging, voice, visual identity systems, and brand governance.'],
 ['Design','Web and digital design, print collateral, environmental signage, and customer experience design systems that grow with your business.'],
 ['Outreach · Headline','Strategic partnerships, event coordination, community presence, referral network building, and public relations.'],
 ['Content','Editorial planning, blogs and articles, video production, social media campaigns, patient education resources, and performance measurement to guide the next iteration.']]}
];
</script>
<style scoped>
.division-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.division-tree{display:flex;justify-content:center;align-items:center;gap:28px;margin:30px auto 40px;padding:22px;background:#f8f3f2;border-radius:12px;text-align:center}.division-tree strong{display:block;font-size:22px}.division-grid dt{font-weight:700;margin-top:22px}.division-grid dd{margin:8px 0;color:#535b6e}.division-grid li{margin:12px 0}.division-legal{font-size:13px;border-top:1px solid #ded5d7;padding-top:20px;margin-top:24px}.division-scope{max-width:850px;margin:40px auto 0}@media(max-width:700px){.division-grid{grid-template-columns:1fr}.division-tree{flex-direction:column;gap:14px}}
</style>
