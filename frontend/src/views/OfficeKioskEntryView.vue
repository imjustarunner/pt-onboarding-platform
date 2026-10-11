<template>
  <KioskWelcomeView v-if="session && !buildingMismatch" :location-id="session.locationId" @lock-kiosk="lock" />
  <main v-else class="kiosk-setup">
    <section class="setup-card" aria-labelledby="kiosk-title">
      <img src="/office/auricwell-kiosk.svg" alt="" class="kiosk-logo" />
      <p class="eyebrow">AURICWELL KIOSK</p>
      <h1 id="kiosk-title">A warm welcome.<br /><em>One simple connection.</em></h1>
      <p v-if="loading" role="status">Opening your office…</p>
      <form v-else @submit.prevent="unlock">
        <p v-if="buildingMismatch" class="setup-error" role="alert">This device is connected to {{ session.locationName || 'another building' }}. This link is for {{ expectedName }}. Enter {{ expectedName }}’s code below to switch buildings.</p>
        <p v-else-if="expectedOfficeId"><strong>Set up {{ expectedName }}</strong></p>
        <p>Enter your office’s six-digit setup code. This device will remember your office for future visits.</p>
        <label for="office-code">Office setup code</label>
        <input id="office-code" v-model="code" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required placeholder="••••••" :disabled="busy" />
        <p v-if="error" class="setup-error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="busy || !/^\d{6}$/.test(code)">{{ busy ? 'Connecting…' : 'Open this office' }} <span aria-hidden="true">→</span></button>
        <small>Office administrators can create a code in Building Settings → Kiosk access.</small>
      </form>
      <p class="setup-privacy">A dedicated space for check-in. Staff accounts and client records stay separate.</p>
    </section>
  </main>
</template>
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import KioskWelcomeView from './KioskWelcomeView.vue';
import { applyOfficeInstallIdentity, OFFICE_SITES } from '../utils/officeSite';
const route = useRoute();
const expectedOfficeId = computed(() => /^\d+$/.test(String(route.params.locationId || '')) ? Number(route.params.locationId) : null);
const expectedName = computed(() => OFFICE_SITES.find(site => site.locationId === expectedOfficeId.value)?.name || 'the requested building');
const session = ref(null), code = ref(''), loading = ref(true), busy = ref(false), error = ref('');
const buildingMismatch = computed(() => session.value && expectedOfficeId.value && Number(session.value.locationId) !== expectedOfficeId.value);
let timer, disposed = false, sessionVersion = 0;
const options = { skipGlobalLoading: true, skipAuthRedirect: true };
function expired() { sessionVersion++; session.value = null; code.value = ''; }
async function restore() {
  const version = ++sessionVersion;
  try { const { data } = await api.get('/public/office-kiosk/session', options); if (!disposed && version === sessionVersion) session.value = data; }
  catch (e) {
    if (e.response?.status === 401 || e.response?.status === 403) expired();
    else if (!session.value) error.value = 'The office could not connect. Please try again.';
  } finally { loading.value = false; }
}
async function unlock() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  const version = ++sessionVersion;
  const entered = code.value; code.value = '';
  try { const { data } = await api.post('/public/office-kiosk/unlock', { code: entered }, options); if (!disposed && version === sessionVersion) session.value = data; }
  catch (e) { error.value = e.response?.data?.error?.message || 'The office could not connect. Please try again.'; }
  finally { busy.value = false; }
}
async function lock() {
  // No automatic logout on idle: the lobby already clears the previous visitor's responses.
  if (!window.confirm('Disconnect this device? An office setup code will be needed to reopen it.')) return;
  try { await api.post('/public/office-kiosk/lock', {}, options); expired(); }
  catch { window.alert('Could not disconnect. Please try again.'); }
}
onMounted(() => { applyOfficeInstallIdentity(); window.addEventListener('auricwell:kiosk-locked', expired); restore(); timer = setInterval(() => { if (session.value) restore(); }, 60000); });
onUnmounted(() => { disposed = true; clearInterval(timer); window.removeEventListener('auricwell:kiosk-locked', expired); });
</script>
<style scoped>
.kiosk-setup{min-height:100dvh;display:grid;place-items:center;padding:32px 20px;background:radial-gradient(ellipse at 20% 0%,#e2ebee,transparent 55%),radial-gradient(ellipse at 90% 100%,#efe5c9,transparent 50%),#f7f8f2;color:#142d43}.setup-card{width:100%;max-width:480px;text-align:center}.kiosk-logo{width:112px;height:112px;border-radius:25px;box-shadow:0 15px 36px #06368b1c}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.2em;margin:24px 0 16px}h1{font-size:clamp(30px,5vw,42px);line-height:1.14;font-weight:550;letter-spacing:-.04em}h1 em{font-family:Georgia,serif;font-weight:400;color:#526d63}form{margin-top:28px;text-align:left}form p{font-size:16px;line-height:1.6;color:#526572}label{display:block;font-weight:650;margin:24px 0 10px}input{width:100%;box-sizing:border-box;text-align:center;font-size:32px;letter-spacing:.4em;padding:16px;border:1px solid #becbd0;background:#fff;border-radius:14px;color:#073782}input:focus{outline:3px solid #b9cdeb;outline-offset:2px}button{width:100%;display:flex;justify-content:space-between;border:0;border-radius:14px;background:#073782;color:white;font-size:17px;font-weight:650;padding:18px 22px;margin:14px 0;cursor:pointer}button:disabled{opacity:.55;cursor:default}small{display:block;font-size:13px;line-height:1.5;color:#526572}.setup-error{color:#9c322e!important}.setup-privacy{font-size:12px;line-height:1.5;color:#657783;max-width:330px;margin:30px auto 0}
</style>
