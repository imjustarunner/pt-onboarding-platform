<template>
  <main class="business-account">
    <header><p class="eyebrow">YOUR BUSINESS</p><h1>Business account</h1><p>Keep your company details, client payouts, and platform subscription together.</p></header>
    <p v-if="loading" role="status">Loading your business account…</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <template v-if="profile">
      <section class="profile-card"><h2>Business details</h2><form @submit.prevent="saveProfile">
        <div class="fields">
          <label>Business name<input v-model="profile.name" maxlength="255" required /></label>
          <label>Legal company name<input v-model="profile.officialName" maxlength="255" /></label>
          <label>Website<input v-model="profile.websiteUrl" type="url" maxlength="512" placeholder="https://" /></label>
          <label>Business phone<input v-model="profile.phoneNumber" type="tel" maxlength="50" /></label>
          <label>Street address<input v-model="profile.streetAddress" maxlength="255" autocomplete="street-address" /></label>
          <label>City<input v-model="profile.city" maxlength="100" autocomplete="address-level2" /></label>
          <label>State<input v-model="profile.state" maxlength="100" autocomplete="address-level1" /></label>
          <label>ZIP / postal code<input v-model="profile.postalCode" maxlength="20" autocomplete="postal-code" /></label>
          <label>Time zone<input v-model="profile.timezone" required placeholder="America/Denver" /></label>
          <label>Tax ID type<select v-model="profile.taxIdType"><option value="">Choose if applicable</option><option value="ein">EIN</option><option value="ssn">SSN (sole proprietor)</option></select></label>
          <label>Tax ID<input v-model="taxId" type="password" inputmode="numeric" autocomplete="off" maxlength="11" :placeholder="profile.taxIdLast4 ? `Saved ending in ${profile.taxIdLast4}` : 'Nine digits'" /><small>Leave blank to keep the saved ID.</small></label>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save business details' }}</button>
        <p v-if="saved" role="status">Business details saved.</p>
      </form></section>
      <section class="profile-card"><h2>Client payments &amp; payout bank</h2><p>Use Stripe’s secure setup to add your legal business details and the bank account that receives client payments.</p><AgencyStripeConnectSection :agency-id="agencyId" payment-context="coaching" /></section>
      <section id="business-agreement" class="profile-card"><h2>Management agreement &amp; pricing</h2><p>Review the services and prices attached to your company’s management agreement. Your signed documents are available from Review agreements in Billing below.</p><BusinessJourney :scoped-agency-id="agencyId" commercial-only /></section>
      <section class="profile-card"><h2>Platform subscription &amp; invoices</h2><p>Add a payment method for your company’s platform subscription and review your company invoices below. Saving a card does not turn on automatic payment.</p><BillingManagement independent-business /></section>
    </template>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import AgencyStripeConnectSection from '../../components/admin/AgencyStripeConnectSection.vue';
import BillingManagement from '../../components/admin/BillingManagement.vue';
import BusinessJourney from '../../components/admin/BusinessJourney.vue';
const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const profile = ref(null), taxId = ref(''), loading = ref(false), saving = ref(false), saved = ref(false), error = ref('');
let requestVersion = 0;
async function loadProfile() {
  const version = ++requestVersion; profile.value = null; error.value = ''; taxId.value = ''; saved.value = false;
  if (!agencyId.value) return;
  loading.value = true;
  try { const { data } = await api.get(`/billing/${agencyId.value}/business-profile`); if (version === requestVersion) profile.value = data; }
  catch (e) { if (version === requestVersion) error.value = e.response?.data?.error?.message || 'Unable to load your business account.'; }
  finally { if (version === requestVersion) loading.value = false; }
}
async function saveProfile() {
  if (!profile.value || saving.value) return;
  saving.value = true; saved.value = false; error.value = '';
  const id = agencyId.value, version = requestVersion;
  const { agencyId: ignoredId, taxIdLast4: ignoredLast4, ...details } = profile.value;
  try {
    const { data } = await api.put(`/billing/${id}/business-profile`, { ...details, ...(taxId.value.trim() ? { taxId: taxId.value.trim() } : {}) });
    if (version === requestVersion) { profile.value = data; taxId.value = ''; saved.value = true; }
  } catch (e) { if (version === requestVersion) error.value = e.response?.data?.error?.message || 'Unable to save your business details.'; }
  finally { saving.value = false; }
}
watch(agencyId, loadProfile, { immediate: true });
</script>

<style scoped>
.business-account{max-width:1120px;margin:auto;padding:32px 20px;color:var(--text-primary,#26372c)}
.eyebrow{letter-spacing:.15em;font-size:12px;color:#4e624b;font-weight:700}h1{font-size:36px;margin:8px 0}h2{margin-top:0}p{line-height:1.6}.profile-card{margin-top:24px;padding:26px;border:1px solid #dce4d7;border-radius:16px;background:var(--bg-primary,#fff)}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:22px 0}label{display:flex;flex-direction:column;gap:7px;font-weight:600}input,select{padding:11px;border:1px solid #bdcbb8;border-radius:7px;font:inherit;background:var(--bg-primary,#fff);color:inherit}small{font-weight:400;color:var(--text-secondary,#657562)}.error{color:#b42318}@media(max-width:650px){.fields{grid-template-columns:1fr}.profile-card{padding:18px}.business-account{padding:20px 12px}}
</style>
