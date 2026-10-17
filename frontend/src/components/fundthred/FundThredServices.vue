<template>
  <section class="ft-wrap ft-section ft-services" aria-labelledby="finance-services-title">
    <p class="ft-eyebrow">PlotTwistCo’s finance division</p>
    <h1 v-if="full" id="finance-services-title">Your people. Your practice.<br><em>Your financial picture.</em></h1>
    <h2 v-else id="finance-services-title">Finance that follows<br><em>the whole organization.</em></h2>
    <p class="ft-services-intro">FundThred brings together PlotTwistCo’s finance services: payroll operations, practice billing support, reviewed collections, and financial oversight. Your organization stays clearly identified throughout.</p>
    <div class="ft-service-grid">
      <article v-for="service in services" :id="service.id" :key="service.id"><FundThredIcon :name="service.icon" :tone="service.tone"/><h3>{{service.title}}</h3><p>{{service.body}}</p><router-link class="ft-text-link" :to="{path:'/fundthred/start',query:{interest:service.id}}">Discuss {{service.short}} →</router-link></article>
    </div>
    <div class="ft-billing-journey"><div><p class="ft-eyebrow">One relationship. Clear responsibilities.</p><h2>From the first statement<br><em>to a reviewed next step.</em></h2><p>Initial billing comes from your practice’s billing address. A separate collections referral requires staff review and an agreed scope with PlotTwistCo. FundThred keeps the originating practice and current balance visible.</p></div><ol><li><strong>01 · Practice billing</strong><span>Review responsibility, insurance follow-ups, statements, and payment setup through the practice.</span><code>billing@yourpractice.com</code></li><li><strong>02 · Review before referral</strong><span>Confirm the responsible payer, balance, agreement, and any holds, disputes, payment plans, or pending payments.</span></li><li><strong>03 · FundThred collections</strong><span>A dedicated case workspace for referred balances and their financial history. Outbound collections communication is subject to service setup and approval.</span><code>collections@fundthred.com · setup pending</code></li></ol></div>
    <p class="ft-small">Services are scoped in your PlotTwistCo agreement. Collections communications require the applicable agreements, reviewed procedures, sender setup, and any required authorization before activation.</p>
    <div v-if="full" class="ft-actions"><router-link class="ft-button" :to="{path:'/fundthred/start',query:{interest:'collections'}}">Discuss collections support →</router-link><router-link class="ft-button ft-button--outline" to="/fundthred/app/collections">Open collections workspace</router-link></div>
  </section>
</template>
<script setup>
import FundThredIcon from './FundThredIcon.vue';
defineProps({full:Boolean});
const services=[
 {id:'payroll',icon:'payments',tone:'teal',title:'Payroll operations',short:'payroll',body:'Pay periods, approved submissions, reimbursements, leave balances, and agency-branded pay breakdowns with FundThred. Your agency remains the employer shown in the payroll experience.'},
 {id:'billing',icon:'documents',tone:'blue',title:'Practice billing support',short:'billing',body:'Claims and payment workflows stay connected to AuricWell. PlotTwistCo’s authorized billing team reviews insurance follow-ups and account statements using the correct practice identity.'},
 {id:'collections',icon:'approvals',tone:'amber',title:'Reviewed collections',short:'collections',body:'Bring referred balances, the responsible payer, and supporting billing history into a dedicated workspace. See current payments and blocking issues alongside the original referral.'},
 {id:'oversight',icon:'reports',tone:'green',title:'Financial oversight',short:'finance operations',body:'Connect budgets, funding, expenses, approvals, documents, and operational reporting. Keep each organization’s financial responsibilities and access clear.'}
];
</script>
<style scoped>
.ft-services-intro{max-width:900px;font-size:18px;line-height:1.65}.ft-service-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin:32px 0}.ft-service-grid article{padding:25px;border:1px solid #dbe6e7;border-radius:16px;background:#fff}.ft-service-grid h3{font-size:20px}.ft-service-grid p{font-size:14px;line-height:1.7}.ft-billing-journey{display:grid;grid-template-columns:1fr 1.1fr;gap:40px;padding:32px;background:#eef7f4;border-radius:20px;margin-bottom:22px}.ft-billing-journey ol{list-style:none;margin:0;padding:0;display:grid;gap:20px}.ft-billing-journey li{display:grid;gap:8px;padding-left:18px;border-left:3px solid #138577}.ft-billing-journey span{font-size:14px;line-height:1.6}.ft-billing-journey code{font-size:12px;overflow-wrap:anywhere}.ft-services h1{font-size:clamp(34px,4vw,64px);line-height:1.15}@media(max-width:1000px){.ft-service-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.ft-service-grid,.ft-billing-journey{grid-template-columns:1fr}.ft-billing-journey{padding:22px;gap:22px}}
</style>
