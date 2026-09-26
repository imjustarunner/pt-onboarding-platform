<template>
  <section class="payment-settings">
    <header><p class="eyebrow">{{ agency?.name }} · Client payments</p><h2>Stripe & payment setup</h2><p>Connect this agency’s payment account, then set service prices and send client authorizations.</p></header>
    <AgencyStripeConnectSection v-if="agency?.id" :agency-id="Number(agency.id)" />
    <nav v-if="agency?.id" aria-label="Client billing tools" class="payment-links">
      <RouterLink :to="billingLink('services')">Service prices & authorizations <span>Set self-pay prices and request a signed client authorization.</span></RouterLink>
      <RouterLink :to="billingLink('balances')">Client balances & payments <span>Review copays, receipts, payment plans, and collections.</span></RouterLink>
      <RouterLink :to="agencyPath('/admin/medical-billing')">Insurance billing workspace <span>Manage payer connections, claims, and remittances.</span></RouterLink>
    </nav>
    <p v-else>Select an agency to configure its payment account.</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import AgencyStripeConnectSection from './AgencyStripeConnectSection.vue';
const agencyStore = useAgencyStore();
const agency = computed(() => agencyStore.currentAgency);
const agencyPath = path => agency.value?.slug ? `/${agency.value.slug}${path}` : path;
const billingLink = tab => ({ path: agencyPath('/admin/family-billing'), query: { tab, agencyId: String(agency.value.id) } });
</script>
<style scoped>
.payment-settings { display:grid; gap:24px; color:var(--text-primary); }
.payment-settings header p { color:var(--text-secondary); margin:8px 0; }
.eyebrow { font-size:.8rem; font-weight:700; letter-spacing:.06em; }
.payment-links { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; }
.payment-links a { display:grid; gap:8px; padding:20px; border:1px solid var(--border); border-radius:14px; background:var(--bg-card); color:var(--link-color); text-decoration:none; font-weight:700; }
.payment-links span { color:var(--text-secondary); font-size:.9rem; font-weight:400; }
</style>
