<template>
  <div class="ptco-service-detail">
    <section class="ptco-band"><div class="ptco-wrap ptco-detail-layout">
      <div><p class="ptco-eyebrow">{{ service.id === 'full-service' ? 'A partnership built around you' : 'What we help with' }}</p><h2>{{ service.id === 'full-service' ? 'One team behind your mission' : 'Practical support. Clear responsibilities.' }}</h2>
        <ul class="ptco-included"><li v-for="item in service.includes" :key="item"><PtcoIcon name="check"/><span>{{ item }}</span></li></ul>
      </div>
      <aside class="ptco-quote-card"><PtcoIcon :name="service.icon"/><h2>{{ service.id === 'full-service' ? 'Build your custom plan' : 'Start with what you need' }}</h2><p>{{ service.pricing }}</p><router-link class="ptco-button" :to="intake">Request a custom quote <PtcoIcon name="arrow"/></router-link><small>We agree on scope and pricing before work begins.</small></aside>
    </div></section>

    <section v-if="service.id === 'medical-billing'" class="ptco-band ptco-soft"><div class="ptco-wrap">
      <p class="ptco-eyebrow">Two ways to work with us</p><h2>Medical billing, in the EHR that fits.</h2>
      <div class="ptco-option-grid">
        <article class="ptco-card"><span class="ptco-service-tag">Keep your current system</span><h3>Billing in your existing EHR</h3><p>Plot Twist Co. works within your current EHR and billing workflow. We review the system, access, claim volume, and payer mix with you before quoting the engagement.</p><router-link :to="intake">Discuss your EHR <PtcoIcon name="arrow"/></router-link></article>
        <article class="ptco-card"><span class="ptco-service-tag">New contracts starting in 2027</span><h3>Billing through AuricWell</h3><p>Use our EHR, AuricWell, with medical billing support from Plot Twist Co. AuricWell is accepting new contracts starting in 2027; talk with us about your scope and transition timeline.</p><router-link :to="intake">Plan your 2027 transition <PtcoIcon name="arrow"/></router-link><a href="https://auricwell.com">Explore AuricWell <span aria-hidden="true">↗</span></a></article>
      </div>
      <p class="ptco-small">Both options are quote-only. Medical billing can be purchased on its own or included in a broader management partnership.</p>
    </div></section>

    <section v-if="product" class="ptco-band ptco-soft"><div class="ptco-wrap">
      <p class="ptco-eyebrow">Managed support or a standalone service</p><h2>{{ product.heading }}</h2>
      <div class="ptco-option-grid">
        <article class="ptco-card"><span class="ptco-service-tag">Through Plot Twist Co.</span><h3>Include it in your management plan</h3><p>{{ product.managed }}</p><router-link :to="intake">Discuss managed support <PtcoIcon name="arrow"/></router-link></article>
        <article class="ptco-card"><span class="ptco-service-tag">Available on its own</span><h3>{{ product.name }}</h3><p>{{ product.standalone }}</p><a v-if="product.external" :href="product.url">Explore {{ product.name }} <PtcoIcon name="arrow"/></a><router-link v-else :to="product.url">Explore {{ product.name }} <PtcoIcon name="arrow"/></router-link></article>
      </div>
    </div></section>

    <section class="ptco-band"><div class="ptco-wrap"><p class="ptco-eyebrow">How we get started</p><h2>A clear path from conversation to support</h2><ol class="ptco-service-steps"><li v-for="(step,index) in service.process" :key="step"><span>{{ String(index + 1).padStart(2, '0') }}</span><p>{{ step }}</p></li></ol></div></section>
    <section class="ptco-band ptco-soft"><div class="ptco-wrap"><div class="ptco-section-heading"><div><p class="ptco-eyebrow">Build on your support</p><h2>Connected services</h2></div><router-link to="/p/ptco/services">View all services →</router-link></div><div class="ptco-three"><router-link v-for="item in related" :key="item.id" :to="ptcoServicePath(item.id)" class="ptco-card"><PtcoIcon :name="item.icon"/><h3>{{ item.title }}</h3><p>{{ item.body }}</p></router-link></div></div></section>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { ptcoServices, ptcoServicePath } from '../../constants/ptcoWebsite';
import { PLOTLINE_WEBSITE_URL } from '../../utils/plotline';
import PtcoIcon from './PtcoIcon.vue';
const props = defineProps({ service: { type: Object, required: true } });
const intake = computed(() => `/p/ptco/start?path=operations&service=${props.service.id}`);
const related = computed(() => (props.service.related || []).map(id => ptcoServices.find(s => s.id === id)).filter(Boolean));
const products = {
  plotline: { name:'Plotline', heading:'People operations through Plotline', managed:'Let our team coordinate hiring, onboarding, training, and ongoing people operations through Plotline as part of your agreed scope.', standalone:'Need the people operations product on its own? Explore Plotline’s workflows and plans without a full Plot Twist Co. management partnership.', external:true, url:PLOTLINE_WEBSITE_URL },
  fundthred: { name:'FundThred', heading:'Financial management, with FundThred', managed:'Bring financial organization, budget monitoring, grant tracking, and reporting into your broader Plot Twist Co. support plan.', standalone:'Focus on nonprofit financial support with FundThred. Explore the service on its own, without adding a full management partnership.', external:true, url:'https://fundtred.com' }
};
const product = computed(() => products[props.service.product]);
</script>
