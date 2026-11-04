<template>
  <Teleport to="body">
    <div v-if="request" class="verification-overlay" @click.self="close" @keydown.esc.stop.prevent="close">
      <section ref="panel" class="verification-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title" tabindex="-1">
        <header><h2 id="verification-title">{{ readiness?.ready ? 'Ready to return to provider assignment' : 'Verify insurance before continuing' }}</h2><button type="button" aria-label="Close insurance verification" @click="close">Close</button></header>
        <p v-if="!readiness?.ready">{{ readiness?.reason || request.message }}</p>
        <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Checking verification status…</p>
        <AssignmentCoverageReview v-if="readiness?.canVerify && !readiness.ready" :key="`${request.agencyId}-${request.clientId}`" :client-id="request.clientId" :agency-id="request.agencyId" @saved="check" @updated="check" />
        <p v-else-if="readiness && !readiness.canVerify && !readiness.ready">The billing team needs to complete verification. Your assignment or Exchange request has not been saved.</p>
        <div v-if="readiness?.ready" class="verification-success" role="status">
          <p>{{ readiness.required === false ? 'Insurance verification is not required for this client.' : 'Coverage is verified.' }} Your provider assignment or Exchange request has not been saved yet. Return to the form and select Assign provider or Save again to finish.</p>
          <button type="button" class="return-button" @click="close">Return to provider assignment</button>
        </div>
        <button v-else type="button" :disabled="loading" @click="check">Recheck verification</button>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import api from '../../services/api.js';
import AssignmentCoverageReview from './AssignmentCoverageReview.vue';
const request = ref(null), readiness = ref(null), loading = ref(false), error = ref(''), panel = ref(null);
let sequence = 0, previousFocus = null;

async function check() {
  if (!request.value) return;
  const current = ++sequence;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/clients/${request.value.clientId}/coverage-readiness`, { skipGlobalLoading: true });
    if (current === sequence) readiness.value = data;
  } catch (e) {
    if (current !== sequence) return;
    if ([401, 403, 404].includes(e.response?.status)) readiness.value = null;
    error.value = e.response?.data?.error?.message || 'Verification status could not be checked. Please try again.';
  } finally { if (current === sequence) loading.value = false; }
}

function close() {
  sequence++; request.value = null; readiness.value = null; loading.value = false;
  if (previousFocus?.isConnected) previousFocus.focus();
}

async function open(event) {
  const data = event.detail;
  if (![data?.clientId, data?.agencyId].every(value => Number.isSafeInteger(Number(value)) && Number(value) > 0)) return;
  previousFocus = document.activeElement;
  request.value = { clientId: Number(data.clientId), agencyId: Number(data.agencyId), message: String(data.message || 'Coverage needs verification before this request can continue.') };
  readiness.value = null; check(); await nextTick(); panel.value?.focus();
}

function trap(event) {
  if (!request.value || event.key !== 'Tab' || !panel.value) return;
  const items = [...panel.value.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === panel.value)) { event.preventDefault(); items.at(-1).focus(); }
  else if (!event.shiftKey && (document.activeElement === items.at(-1) || document.activeElement === panel.value)) { event.preventDefault(); items[0].focus(); }
}
onMounted(() => { window.addEventListener('pt:insurance-verification-required', open); window.addEventListener('keydown', trap); });
onBeforeUnmount(() => { sequence++; window.removeEventListener('pt:insurance-verification-required', open); window.removeEventListener('keydown', trap); });
</script>
<style scoped>
.verification-overlay{position:fixed;inset:0;background:#16324888;z-index:13000;display:flex;align-items:center;justify-content:center;padding:20px}.verification-dialog{background:var(--bg-primary,#fff);color:var(--text-primary,#172b4d);border-radius:16px;padding:24px;max-width:760px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px #0004;box-sizing:border-box}.verification-dialog header{display:flex;justify-content:space-between;gap:16px}.verification-dialog h2{margin:0}.verification-dialog button{padding:10px 14px;border:1px solid #b4c9d8;background:var(--bg-primary,#fff);color:inherit;border-radius:8px;font:inherit;cursor:pointer}.verification-dialog button:disabled{opacity:.6;cursor:default}.verification-dialog [role=alert]{color:#a32332}.verification-success{margin-top:18px;background:#eaf7ef;border:1px solid #a7d6b9;padding:16px;border-radius:10px}.verification-success .return-button{background:#166b75;color:#fff;border-color:#166b75}@media(max-width:520px){.verification-overlay{padding:8px}.verification-dialog{padding:16px;max-height:94vh}.verification-dialog h2{font-size:1.2rem}.verification-dialog header{align-items:flex-start}}
</style>
