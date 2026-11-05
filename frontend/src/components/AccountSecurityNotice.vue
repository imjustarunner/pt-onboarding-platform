<template>
  <aside class="account-security-notice" v-if="auth.user?.id && !auth.user?.demoMode && (needsVerification || protectionRequired || protectionUnavailable || summaryUnavailable || summary.alerts || summary.requests)">
    <p v-if="needsVerification">{{ state?.enabled ? 'Verify your sign-in to open protected client information.' : 'Protect client privacy: set up two-step verification to view full names and open client documents.' }}</p>
    <p v-else-if="state?.guardianAccount && !state?.enabled">Protect your family’s portal with a passkey, authenticator, or email verification. Each parent sets up their own sign-in protection.</p>
    <p v-if="protectionRequired">{{ protectionMessage }} <button type="button" class="request-toggle" :aria-expanded="showRequest" :disabled="requestBusy" @click="requestAccess">{{ requestBusy ? 'Sending request…' : 'Request access' }}</button></p>
    <p v-if="requestMessage" role="status">{{ requestMessage }}</p>
    <p v-if="requestError" role="alert">{{ requestError }}</p>
    <ActivityProtectionPanel v-if="protectionRequired && showRequest" />
    <p v-if="protectionUnavailable">Access-review status could not be checked. Open Security &amp; sign-in activity for the current status.</p>
    <p v-if="summaryUnavailable">Security alert counts are unavailable. Open Privacy review to check the queue.</p>
    <p v-if="summary.alerts || summary.requests"><router-link to="/privacy-review">Review security activity: {{ summary.alerts }} unreviewed blocks · {{ summary.requests }} file-access requests</router-link></p>
    <p v-if="state?.canReviewPrivacy"><router-link to="/privacy-review">Privacy review queue</router-link></p>
    <router-link to="/account-security">{{ needsVerification ? (state?.passkeyEnabled ? 'Verify with a passkey or recover access' : state?.method === 'email' ? 'Verify with an email code' : 'Set up or verify two-step verification') : 'Security & sign-in activity' }}</router-link>
  </aside>
  <FileAccessReviewToasts v-if="auth.user?.id && state?.canReviewPrivacy && !needsVerification" :key="auth.user?.id" :user-id="auth.user.id" />
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import ActivityProtectionPanel from './ActivityProtectionPanel.vue';
import FileAccessReviewToasts from './FileAccessReviewToasts.vue';
const auth = useAuthStore(), state = ref(null), protectionRequired = ref(false), summary = ref({}), summaryUnavailable = ref(false);
const showRequest = ref(false), requestBusy = ref(false), requestMessage = ref(''), requestError = ref('');
async function requestAccess() {
 if (!protectionHolds.value.some(hold => hold.kind === 'client_file')) { showRequest.value = !showRequest.value; return; }
 if (requestBusy.value) return;
 requestBusy.value = true; requestError.value = '';
 const id = auth.user?.id;
 try {
  const { data } = await api.post('/account-security/activity-protection/requests', { reviewHold: true }, { headers: { 'X-Account-Security': '1' } });
  if (auth.user?.id === id) requestMessage.value = data.message || 'Request sent to your privacy reviewer. The hold stays in place until reviewed.';
 } catch (e) { if (auth.user?.id === id) requestError.value = e.response?.data?.error?.message || 'The request could not be sent. Please try again.'; }
 finally { requestBusy.value = false; }
}
const protectionUnavailable = ref(false), protectionHolds = ref([]), unlimitedFileViews = ref(false);
const protectionMessage = computed(() => unlimitedFileViews.value && protectionHolds.value.length && protectionHolds.value.every(hold => hold.kind === 'client_file')
  ? 'Download, export, and print access is paused for security review. Your role still permits audited document views.'
  : 'Additional access is paused for security review.');
const needsVerification = computed(() => state.value?.required === true && !state.value.verified);
async function refreshProtection() {
  const id = auth.user?.id;
  if (!id) return;
  const revision = protectionRevision;
  try {
    const { data } = await api.get('/account-security/activity-protection', { skipGlobalLoading: true, headers: { 'X-Account-Security': '1' } });
    if (auth.user?.id !== id || revision !== protectionRevision) return;
    protectionHolds.value = Array.isArray(data?.holds) ? data.holds : [];
    unlimitedFileViews.value = data?.unlimitedFileViews === true;
    protectionRequired.value = protectionHolds.value.length > 0;
    protectionUnavailable.value = false;
  } catch {
    if (auth.user?.id === id && revision === protectionRevision) protectionUnavailable.value = true;
    // A failed status read must not clear an already-known hold.
  }
}
async function refresh() {
  const id = auth.user?.id; state.value = null;
  if (!id) return;
  await Promise.allSettled([
    refreshProtection(),
    api.get('/account-security', { skipGlobalLoading: true }).then(({ data }) => { if (auth.user?.id === id) state.value = data; })
  ]);
}
let protectionRevision = 0;
function required() { refresh(); }
function protectionBlocked() { protectionRevision += 1; protectionRequired.value = true; refreshProtection(); }
async function refreshSummary() {
 const id=auth.user?.id;
 if(!id || !state.value?.canReviewPrivacy || (state.value?.required && !state.value?.verified) || document.visibilityState==='hidden'){summary.value={};summaryUnavailable.value=false;return;}
 try {const response=await api.get('/privacy-review/summary',{skipGlobalLoading:true});if(auth.user?.id===id){summary.value=response.data;summaryUnavailable.value=false;}} catch { summary.value={};summaryUnavailable.value=true; }
}
const summaryTimer=setInterval(() => { refreshSummary(); if (document.visibilityState !== 'hidden') refreshProtection(); },60000);
watch(()=>state.value?.verified,refreshSummary);
window.addEventListener('activity-protection-required',protectionBlocked);
watch(() => auth.user?.id, () => { protectionRevision += 1; protectionRequired.value = false; protectionUnavailable.value = false; protectionHolds.value = []; requestMessage.value = ''; requestError.value = ''; showRequest.value = false; refresh(); }, { immediate: true });
window.addEventListener('account-security-required', required);
window.addEventListener('account-security-changed', refresh);
onBeforeUnmount(() => { clearInterval(summaryTimer);window.removeEventListener('activity-protection-required',protectionBlocked); window.removeEventListener('account-security-required', required); window.removeEventListener('account-security-changed', refresh); });
</script>
<style scoped>
.account-security-notice { padding: .7rem 1rem; border-bottom: 1px solid var(--border, #cbd5e1); background: var(--bg-secondary, #f1f5f9); color: var(--text-primary); font-size: .9rem; }
p { margin: 0 0 .3rem; } a { font-weight: 600; color: var(--primary, #285d91); }
.request-toggle { margin-left: .4rem; padding: .2rem .6rem; border: 1px solid var(--primary, #285d91); border-radius: 6px; background: transparent; color: var(--primary, #285d91); font-weight: 600; cursor: pointer; }
</style>
