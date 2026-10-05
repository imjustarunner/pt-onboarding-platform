<template>
  <main>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="signed" class="signed" role="status"><h1>Your choices have been signed</h1><p>The practice will review your signed choices before activating any selected text subscriptions. Choosing No does not affect your access to services.</p></section>
    <SmsConsentForm v-else-if="data" v-bind="data" :busy="busy" @sign="sign" />
    <p v-else-if="!error">Loading consent form…</p>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SmsConsentForm from '../../components/communications/SmsConsentForm.vue';
const route = useRoute();
const data = ref(null), error = ref(''), signed = ref(false), busy = ref(false);
// Token remains in the fragment, not server request paths, analytics query strings or Referer headers.
const token = String(route.hash || '').replace(/^#/, '');
const opts = { skipAuthRedirect: true, skipGlobalLoading: true };
const failure = (e) => { error.value = e.response?.data?.error?.message || e.message || 'Unable to load this consent request'; };
onMounted(async () => {
  try {
    const result = route.meta?.smsConsentExample
      ? await api.get(`/sms-numbers/consent-example/${encodeURIComponent(String(route.params.brandSlug || ''))}`,  { ...opts, params: { program: route.query.program || undefined, audience: route.query.audience || 'client', billing: route.query.billing || undefined } })
      : await api.post('/sms-numbers/consent-request/view', { token }, opts);
    data.value = result.data; signed.value = result.data.signed === true;
  } catch (e) { failure(e); }
});
async function sign(input) {
  if (data.value?.example) return;
  busy.value = true; error.value = '';
  try { await api.post('/sms-numbers/consent-request/sign', { ...input, token }, opts); signed.value = true; }
  catch (e) { failure(e); } finally { busy.value = false; }
}
</script>
<style scoped>
main { min-height: 100vh; padding: 24px; background: #edf4f3; }
.signed, [role=alert] { max-width: 720px; margin: 40px auto; padding: 24px; background: white; }
[role=alert] { color: #9d2525; }
</style>
