<template>
  <aside class="account-security-notice" v-if="auth.user?.id && !auth.user?.demoMode">
    <p v-if="needsVerification">{{ state?.enabled ? 'Verify your sign-in to open protected client information.' : 'Protect client privacy: set up two-step verification to view full names and open client documents.' }}</p>
    <p v-if="protectionRequired">Additional access is paused for security review. Open Security & sign-in activity to request access.</p>
    <p v-if="summaryUnavailable">Security alert counts are unavailable. Open Privacy review to check the queue.</p>
    <p v-if="summary.alerts || summary.requests"><router-link to="/privacy-review">Review security activity: {{ summary.alerts }} unreviewed blocks · {{ summary.requests }} file-access requests</router-link></p>
    <p v-if="state?.canReviewPrivacy"><router-link to="/privacy-review">Privacy review queue</router-link></p>
    <router-link to="/account-security">{{ needsVerification ? (state?.method === 'email' ? 'Verify with an email code' : 'Set up or verify two-step verification') : 'Security & sign-in activity' }}</router-link>
  </aside>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
const auth = useAuthStore(), state = ref(null), protectionRequired = ref(false), summary = ref({}), summaryUnavailable = ref(false);
const needsVerification = computed(() => state.value?.required === true && !state.value.verified);
async function refresh() {
  const id = auth.user?.id; state.value = null;
  if (!id) return;
  try { const { data } = await api.get('/account-security', { skipGlobalLoading: true }); if (auth.user?.id === id) { state.value = data; } } catch { /* The security page provides the recoverable error. */ }
}
function required() { refresh(); }
function protectionBlocked() { protectionRequired.value = true; }
async function refreshSummary() {
 const id=auth.user?.id;
 if(!id || !state.value?.canReviewPrivacy || (state.value?.required && !state.value?.verified) || document.visibilityState==='hidden'){summary.value={};summaryUnavailable.value=false;return;}
 try {const response=await api.get('/privacy-review/summary',{skipGlobalLoading:true});if(auth.user?.id===id){summary.value=response.data;summaryUnavailable.value=false;}} catch { summary.value={};summaryUnavailable.value=true; }
}
const summaryTimer=setInterval(refreshSummary,60000);
watch(()=>state.value?.verified,refreshSummary);
window.addEventListener('activity-protection-required',protectionBlocked);
watch(() => auth.user?.id, refresh, { immediate: true });
window.addEventListener('account-security-required', required);
window.addEventListener('account-security-changed', refresh);
onBeforeUnmount(() => { clearInterval(summaryTimer);window.removeEventListener('activity-protection-required',protectionBlocked); window.removeEventListener('account-security-required', required); window.removeEventListener('account-security-changed', refresh); });
</script>
<style scoped>
.account-security-notice { padding: .7rem 1rem; border-bottom: 1px solid var(--border, #cbd5e1); background: var(--bg-secondary, #f1f5f9); color: var(--text-primary); font-size: .9rem; }
p { margin: 0 0 .3rem; } a { font-weight: 600; color: var(--primary, #285d91); }
</style>
