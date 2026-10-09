<template>
  <main class="conversa-consent-page">
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="signed" class="signed" role="status">
      <ConversaEnrollmentHeader heading="h1" title="Your choices have been signed" :organization-name="data?.disclosure?.brandName" status="Signature received" description="Thank you. Your communication preferences are ready for your organization to review." />
      <div class="signed-body"><div class="signed-step"><span class="signed-icon"><ConversaIcon type="read" :size="25" /></span><div><h2>Signature recorded</h2><p>Your signed choices have been submitted.</p></div></div><div class="signed-step"><span class="signed-icon pending"><ConversaIcon type="scheduled" :size="23" /></span><div><h2>Organization review</h2><p>The practice will review your signed choices before activating any selected text subscriptions. Choosing No does not affect your access to services.</p></div></div><p class="signed-return">You can return to your portal and check your notification setup. You may close this tab.</p></div>
    </section>
    <SmsConsentForm v-else-if="data" v-bind="data" :busy="busy" @sign="sign" />
    <p v-else-if="!error">Loading consent form…</p>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SmsConsentForm from '../../components/communications/SmsConsentForm.vue';
import ConversaEnrollmentHeader from '../../components/conversa/ConversaEnrollmentHeader.vue';
import ConversaIcon from '../../components/conversa/ConversaIcon.vue';
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
.conversa-consent-page{box-sizing:border-box;min-height:100vh;padding:48px 22px;background:radial-gradient(ellipse at top left,#eaf1fc,transparent 65%),#f5f7fb}.signed{max-width:760px;margin:0 auto;border:1px solid #d6e1ef;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 16px 60px #122e5b10}.signed-body{padding:30px 32px}.signed-step{display:flex;align-items:flex-start;gap:16px;margin-bottom:26px}.signed-icon{display:grid;place-items:center;flex:0 0 44px;height:44px;background:#eaf5ef;border-radius:13px;color:#2a7055}.signed-icon.pending{background:#edf3fc;color:#355b89}.signed-step h2{margin:0;font-size:16px;color:#203957}.signed-step p{font-size:13px;line-height:1.7;color:#61738c;margin:7px 0 0}.signed-return{padding:15px 18px;background:#f5f8fc;border-radius:9px;font-size:12px;line-height:1.65;color:#536680}[role=alert]{max-width:720px;margin:24px auto;padding:20px;border:1px solid #efcdd1;border-radius:12px;background:#fff;color:#9d2525}@media(max-width:560px){.conversa-consent-page{padding:20px 12px}.signed-body{padding:24px 20px}}
</style>
