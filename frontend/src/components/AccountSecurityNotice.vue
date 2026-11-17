<template>
  <span v-if="auth.user?.id && !auth.user?.demoMode" ref="anchor" class="security-menu" @keydown.esc.stop="menuOpen = false">
    <button ref="trigger" class="security-trigger" type="button" :aria-expanded="menuOpen" aria-controls="workspace-security-menu" @click="toggleMenu">{{ ft("Security") }} <span v-if="needsVerification || protectionRequired" class="security-status">{{ ft("Action needed") }}</span><span v-else-if="summary.requests" class="security-status">{{ summary.requests }}</span> ▾</button>
    <Teleport to="body"><aside v-show="menuOpen" id="workspace-security-menu" ref="menu" class="account-security-notice" :style="menuStyle" :aria-label="ft('Security')" @keydown.esc.stop="menuOpen = false; trigger?.focus()">
    <strong>{{ ft("Security") }}</strong>
    <p class="security-explainer">{{ ft('Blocked requests are actions the system stopped for review, including repeated retries and sign-in limits. They do not mean an account owner acted maliciously.') }}</p>
    <p v-if="needsVerification">{{ ft(state?.enabled ? 'Verify your sign-in to open protected client information.' : 'Protect client privacy: set up two-step verification to view full names and open client documents.') }}</p>
    <p v-else-if="state?.guardianAccount && !state?.enabled">{{ ft('Protect your family’s portal with a passkey, authenticator, or email verification. Each parent sets up their own sign-in protection.') }}</p>
    <p v-if="protectionRequired">{{ ft(protectionMessage) }} <button type="button" class="request-toggle" :aria-expanded="showRequest" :disabled="requestBusy" @click="requestAccess">{{ ft(requestBusy ? 'Sending request…' : 'Request access') }}</button></p>
    <p v-if="requestMessage" role="status">{{ ft(requestMessage) }}</p>
    <p v-if="requestError" role="alert">{{ ft(requestError) }}</p>
    <ActivityProtectionPanel v-if="protectionRequired && showRequest" />
    <p v-if="protectionUnavailable">{{ ft('Access-review status could not be checked. Open Security & sign-in activity for the current status.') }}</p>
    <p v-if="summaryUnavailable">{{ ft('Security alert counts are unavailable. Open Privacy review to check the queue.') }}</p>
    <p v-if="summary.alerts || summary.requests"><router-link to="/privacy-review" @click="menuOpen = false">Review security activity: {{ summary.alerts }} unreviewed blocked requests<template v-if="Number.isFinite(summary.accounts)"> affecting {{ summary.accounts }} accounts</template><template v-if="summary.unidentified"> · {{ summary.unidentified }} unidentified attempts</template> · {{ summary.requests }} file-access requests</router-link></p>
    <p v-if="state?.canReviewPrivacy"><router-link to="/privacy-review" @click="menuOpen = false">{{ ft('Privacy review queue') }}</router-link></p>
    <router-link to="/account-security" @click="menuOpen = false">{{ ft(needsVerification ? (state?.passkeyEnabled ? 'Verify with a passkey or recover access' : state?.method === 'email' ? 'Verify with an email code' : 'Set up or verify two-step verification') : 'Security & sign-in activity') }}</router-link>
  </aside></Teleport></span>
  <FileAccessReviewToasts v-if="auth.user?.id && state?.canReviewPrivacy && !needsVerification" :key="auth.user?.id" :user-id="auth.user.id" />
</template>
<script setup>
import {familyTranslator,useActiveFamilyLocale} from '../composables/useFamilyLocale';
import {canPollWorkspace,useSessionPolling} from '../composables/useSessionPolling';

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import ActivityProtectionPanel from './ActivityProtectionPanel.vue';
import FileAccessReviewToasts from './FileAccessReviewToasts.vue';
const auth = useAuthStore(), state = ref(null), protectionRequired = ref(false), summary = ref({}), summaryUnavailable = ref(false);
const ft=familyTranslator(useActiveFamilyLocale(computed(()=>auth.user?.id)));
const anchor = ref(null), trigger = ref(null), menu = ref(null), menuOpen = ref(false), menuStyle = ref({});
function positionMenu() {
  const bounds = trigger.value?.getBoundingClientRect();
  if (!bounds) return;
  const top = Math.max(8,Math.min(bounds.bottom + 8,window.innerHeight - 120));
  const width = Math.min(390,window.innerWidth - 24);
  menuStyle.value = { top:`${top}px`, left:`${Math.max(12,Math.min(bounds.left,window.innerWidth-width-12))}px`, width:`${width}px`, maxHeight:`${window.innerHeight-top-12}px` };
}
async function toggleMenu() { menuOpen.value = !menuOpen.value; if (menuOpen.value) { positionMenu(); await nextTick(); menu.value?.querySelector('a,button')?.focus(); } }
function outside(event) { if (!anchor.value?.contains(event.target) && !menu.value?.contains(event.target)) menuOpen.value = false; }
onMounted(() => { document.addEventListener('pointerdown',outside); window.addEventListener('resize',positionMenu); document.addEventListener('scroll',positionMenu,true); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown',outside); window.removeEventListener('resize',positionMenu); document.removeEventListener('scroll',positionMenu,true); });

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
  ? 'Download, export, and print access is paused for security review. Your role still permits audited document views, including opening individual PDF receipts. A browser may offer Save or Print for an opened PDF.'
  : 'Additional access is paused for security review.');
const needsVerification = computed(() => state.value?.required === true && !state.value.verified);
async function refreshProtection() {
  if (!canPollWorkspace()) return;
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
  if (!canPollWorkspace()) return;
  const id = auth.user?.id; state.value = null;
  if (!id) return;
  await Promise.allSettled([
    refreshProtection(),
    api.get('/account-security', { skipGlobalLoading: true }).then(({ data }) => { if (auth.user?.id === id) state.value = data; })
  ]);
}
let protectionRevision = 0;
function required() { refresh(); }
function protectionBlocked() { menuOpen.value = true; nextTick(positionMenu); protectionRevision += 1; protectionRequired.value = true; refreshProtection(); }
async function refreshSummary() {
  if (!canPollWorkspace()) return;
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
useSessionPolling(refresh);
onBeforeUnmount(() => { clearInterval(summaryTimer);window.removeEventListener('activity-protection-required',protectionBlocked); window.removeEventListener('account-security-required', required); window.removeEventListener('account-security-changed', refresh); });
</script>
<style scoped>
.security-menu { display:inline-flex; align-items:center; flex-shrink:0; }
.security-trigger { border:0; background:transparent; color:inherit; padding:8px 10px; font:inherit; cursor:pointer; white-space:nowrap; border-radius:8px; }
.security-trigger:hover, .security-trigger[aria-expanded="true"] { background:#ffffff20; }
.security-status { font-size:11px; border-radius:8px; padding:2px 5px; background:#fff0d5; color:#794505; }
.account-security-notice { position:fixed; z-index:10120; box-sizing:border-box; overflow:auto; padding:16px; border:1px solid #d5dfec; border-radius:12px; background:var(--bg-card,#fff); color:var(--text-primary,#17345c); font-size:.85rem; box-shadow:0 8px 30px #0003; }
p { margin:8px 0; } .security-explainer { font-size:.8rem; color:#526777; line-height:1.5; } a { display:block; margin:8px 0; font-weight:600; color:var(--primary,#285d91); }
.request-toggle { margin-left:.4rem; padding:.2rem .6rem; border:1px solid #b8c8dc; border-radius:6px; background:#edf3fa; color:#17345c; font-weight:600; cursor:pointer; }
.security-trigger:focus-visible { outline:2px solid currentColor; }
</style>
