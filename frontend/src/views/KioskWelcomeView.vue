<template>
  <div class="lobby">
    <header class="lobby-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true">✳</span><div><strong>{{ locationName || 'Welcome to our office' }}</strong><span>MAKE YOURSELF AT HOME</span></div></div>
      <div class="clock"><strong>{{ clockTime }}</strong><span>{{ clockDate }}</span></div>
    </header>
    <main>
      <div class="welcome"><div><span class="eyebrow">A LITTLE CHECK-IN. A WARM WELCOME.</span><h1>You’re in the<br /><em>right place.</em></h1><p>Find your provider, choose your appointment time,<br class="desktop-break" /> and let them know you’re here.</p></div><div class="welcome-note"><span aria-hidden="true">↗</span><p>Take a breath.<br />We’re glad you’re here.</p></div></div>
      <div class="steps" aria-label="Check-in steps"><span><b>1</b> Choose your provider</span><i aria-hidden="true">→</i><span><b>2</b> Pick your time</span><i aria-hidden="true">→</i><span><b>3</b> Settle in</span><small>No client name needed</small></div>
      <div class="workspace">
        <section class="main-section" aria-labelledby="section-title">
          <div class="section-header"><div><span class="eyebrow">{{ tab === 'providers' ? 'LET’S GET YOU CHECKED IN' : 'FIND YOUR WAY' }}</span><h2 id="section-title">{{ tab === 'providers' ? 'Who are you here to see?' : 'Today in our offices' }}</h2></div><span class="updated" :class="{ stale: error || directoryError }">{{ error || directoryError ? 'Update needed' : loading ? 'Connecting…' : 'Updates every minute' }}</span></div>
          <nav class="tabs" aria-label="Lobby views"><button :class="{ active: tab === 'providers' }" :aria-pressed="tab === 'providers'" @click="tab = 'providers'">Provider check-in <span>{{ providers.length }}</span></button><button :class="{ active: tab === 'offices' }" :aria-pressed="tab === 'offices'" @click="tab = 'offices'">Office directory</button></nav>
          <div v-if="error" class="notice" role="alert">{{ error }} <button @click="refresh">Try again</button></div>
          <div v-if="loading" class="empty" role="status">Getting the office ready…</div>
          <template v-else-if="tab === 'providers'">
            <div v-if="providers.length" class="provider-grid"><KioskProviderCard v-for="provider in providers" :key="provider.id" :provider="provider" @select="selectedProvider = $event" /></div>
            <div v-else-if="!error" class="empty"><strong>No providers are scheduled for the rest of today.</strong><p>If you have an appointment, please ask the office team for help.</p><button @click="refresh">Refresh schedule</button></div>
          </template>
          <template v-else>
            <div v-if="directoryError" class="notice" role="alert">{{ directoryError }} <button @click="loadDirectory">Try again</button></div>
            <div v-if="directoryLoading" class="empty" role="status">Loading office assignments…</div>
            <div v-else-if="!rooms.length && !directoryError" class="empty">No offices are listed at this location yet. Please ask the office team for directions.</div>
            <div v-else class="room-grid"><article v-for="room in rooms" :key="room.id" class="room-card"><header><div><span class="eyebrow">OFFICE</span><h3>{{ room.roomNumber || room.name }}</h3><p v-if="room.roomNumber">{{ room.name }}</p></div><span class="room-status" :class="{ occupied: room.assignments.some(a => a.status === 'current') }">{{ room.assignments.some(a => a.status === 'current') ? 'Assigned now' : 'No current assignment' }}</span></header><div v-for="(assignment, index) in room.assignments" :key="index" class="assignment" :class="assignment.status"><span class="assignment-dot" aria-hidden="true" /><div><strong>{{ assignment.providerName }}</strong><span>{{ formatKioskTime(assignment.startAt) }} – {{ formatKioskTime(assignment.endAt) }}</span></div><small>{{ assignment.status === 'current' ? 'NOW' : assignment.status === 'finished' ? 'EARLIER' : 'LATER' }}</small></div><p v-if="!room.assignments.length" class="room-empty">No assignments today</p></article></div>
            <p class="directory-note">Assignments reflect the office schedule. Please wait in the lobby until your provider welcomes you.</p>
          </template>
        </section>
        <aside><div class="privacy-card"><span class="line-icon" aria-hidden="true">✓</span><h3>A simple,<br />private arrival.</h3><p>Just your provider and appointment time. No client names to enter or look through.</p><span class="card-rule" /><p>Once you check in, an arrival alert is saved for your provider.</p></div><div class="help-card"><span class="eyebrow">NEED A HAND?</span><h3>We’re here to help.</h3><p>Can’t find your provider or appointment? Please ask the office team before choosing another time.</p></div><button class="directory-link" @click="tab = tab === 'offices' ? 'providers' : 'offices'">{{ tab === 'offices' ? 'Back to check-in' : 'Who’s in which office?' }} <span aria-hidden="true">→</span></button></aside>
      </div>
    </main>
    <footer class="lobby-footer"><span>YOUR NEXT STEP STARTS HERE.</span><span>Provider &amp; time only <i aria-hidden="true">·</i> {{ locationName || 'Office check-in' }}</span><slot name="actions" /></footer>
    <KioskCheckInFlow v-if="selectedProvider" :provider="selectedProvider" :location-id="locationId" :timezone="timezone" @close="closeCheckin" />
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import KioskProviderCard from '../components/kiosk/KioskProviderCard.vue';
import KioskCheckInFlow from '../components/kiosk/KioskCheckInFlow.vue';
import { formatKioskTime } from '../utils/kioskTime';
const props = defineProps({ locationId: { type: [String, Number], default: null } });
const route = useRoute();
const locationId = computed(() => props.locationId || route.params.locationId);
const locationName = ref('');
const timezone = ref('America/Denver');
const providers = ref([]);
const rooms = ref([]);
const loading = ref(true);
const directoryLoading = ref(true);
const error = ref('');
const directoryError = ref('');
const tab = ref('providers');
const selectedProvider = ref(null);
const now = ref(new Date());
const clockTime = computed(() => now.value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone.value }));
const clockDate = computed(() => now.value.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone.value }));
let clockTimer, refreshTimer;
let generation = 0;
let refreshing = false;
async function loadProviders() {
  const requestGeneration = generation;
  try {
    const { data } = await api.get(`/kiosk/${locationId.value}/providers-today`);
    if (requestGeneration !== generation) return;
    providers.value = data.providers || []; locationName.value = data.locationName || ''; timezone.value = data.timezone || 'America/Denver'; error.value = '';
  } catch { if (requestGeneration === generation) error.value = 'The schedule couldn’t refresh. Displayed information may be out of date.'; }
  finally { if (requestGeneration === generation) loading.value = false; }
}
async function loadDirectory() {
  const requestGeneration = generation;
  try {
    const { data } = await api.get(`/kiosk/${locationId.value}/office-directory`);
    if (requestGeneration !== generation) return;
    rooms.value = data.rooms || []; directoryError.value = '';
  } catch { if (requestGeneration === generation) directoryError.value = 'Office assignments couldn’t refresh. Please ask staff to confirm directions.'; }
  finally { if (requestGeneration === generation) directoryLoading.value = false; }
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try { await Promise.all([loadProviders(), loadDirectory()]); } finally { refreshing = false; }
}
function closeCheckin() { selectedProvider.value = null; refresh(); }
watch(locationId, () => { generation++; providers.value = []; rooms.value = []; selectedProvider.value = null; loading.value = true; directoryLoading.value = true; refreshing = false; refresh(); });
onMounted(() => { refresh(); clockTimer = setInterval(() => { now.value = new Date(); }, 1000); refreshTimer = setInterval(refresh, 60_000); });
onUnmounted(() => { generation++; clearInterval(clockTimer); clearInterval(refreshTimer); });
</script>
<style scoped>
.lobby{--ink:#24443d;--muted:#6c796d;min-height:100dvh;background:#f7f8f0;color:var(--ink);font-family:'Avenir Next','Segoe UI',sans-serif;display:flex;flex-direction:column}.lobby *{box-sizing:border-box}.lobby-header{display:flex;align-items:center;justify-content:space-between;padding:24px 5%;border-bottom:1px solid #e4e7d9}.brand{display:flex;gap:14px;align-items:center}.brand-mark{font-size:46px;line-height:1;color:#7b8d58}.brand strong{display:block;font-size:17px;letter-spacing:-.3px}.brand div>span{display:block;font-size:9px;letter-spacing:2px;color:var(--muted);margin-top:6px}.clock{text-align:right}.clock strong{font-size:22px;font-weight:500}.clock>span{display:block;font-size:11px;color:var(--muted);margin-top:5px}main{width:100%;max-width:1440px;margin:0 auto;padding:44px 5% 55px;flex:1}.welcome{display:flex;align-items:center;justify-content:space-between;padding:0 0 32px}.eyebrow{font-size:10px;letter-spacing:1.8px;font-weight:700;color:#788465}h1{font-size:clamp(44px,5.6vw,78px);letter-spacing:-3px;line-height:1.02;font-weight:500;margin:22px 0}h1 em{font-family:Georgia,serif;font-weight:400;color:#768855}p{line-height:1.7}.welcome p{font-size:16px;color:var(--muted);margin:0}.welcome-note{width:220px;min-height:175px;padding:27px;border-radius:48% 48% 14px 14px;background:#eaeddc;transform:rotate(4deg);text-align:center;margin-right:7%}.welcome-note>span{font-size:34px;color:#879562}.welcome-note p{font-family:Georgia,serif;font-style:italic;font-size:21px;margin-top:8px;color:#586b47}.steps{display:flex;align-items:center;gap:22px;padding:20px 0;border-top:1px solid #dfe5d5;border-bottom:1px solid #dfe5d5;font-size:12px}.steps>span{display:flex;gap:10px;align-items:center;white-space:nowrap}.steps b{display:grid;place-items:center;font-size:11px;font-weight:500;background:#e9eddc;width:25px;height:25px;border-radius:50%}.steps i{color:#9da891;font-style:normal}.steps small{margin-left:auto;color:var(--muted);font-size:10px}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:38px;margin-top:40px}.section-header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:26px;letter-spacing:-.7px;font-weight:500;margin:9px 0 22px}.updated{font-size:9px;color:#718263;white-space:nowrap}.updated:before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#8f9e6c;margin-right:6px}.updated.stale{color:#9b652e}.updated.stale:before{background:#b87932}.tabs{display:flex;gap:6px;padding:5px;background:#eef0e5;border-radius:13px;width:fit-content;margin:0 0 24px}.tabs button{background:transparent;border:0;border-radius:9px;padding:12px 17px;font:inherit;font-size:12px;color:#63725f;cursor:pointer;min-height:44px}.tabs button.active{background:#fffefa;color:#24443d;box-shadow:0 2px 5px #3043300a}.tabs button span{margin-left:9px;font-size:10px;background:#e9eddf;border-radius:5px;padding:3px 6px}.provider-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.privacy-card{background:#e9eddf;border-radius:22px;padding:27px}.line-icon{display:grid;place-items:center;border:1px solid #8a9a76;border-radius:12px;width:38px;height:38px;font-size:22px;color:#788864}.privacy-card h3{font-family:Georgia,serif;font-weight:400;font-size:27px;line-height:1.15;letter-spacing:-.5px;margin:25px 0 17px}aside p{font-size:12px;color:#64715b;margin:0}.card-rule{display:block;width:35px;height:1px;background:#bdc6ac;margin:22px 0}.help-card{padding:27px 12px}.help-card h3{font-size:16px;font-weight:500;margin:12px 0}.directory-link{width:100%;display:flex;justify-content:space-between;background:transparent;border:1px solid #d5decb;border-radius:12px;padding:16px 13px;font:inherit;font-size:11px;font-weight:600;color:var(--ink);cursor:pointer}.lobby-footer{border-top:1px solid #e4e7d9;padding:23px 5%;display:flex;gap:20px;justify-content:space-between;color:#859077;font-size:10px}.lobby-footer>span:first-child{letter-spacing:1.8px;font-size:9px}.lobby-footer i{margin:0 8px;font-style:normal}.notice,.empty{padding:25px;background:#fffefa;border:1px solid #e1e7dc;border-radius:16px;margin:15px 0;line-height:1.7;font-size:14px}.notice{background:#fff4e2;color:#805b30}.notice button,.empty button{border:1px solid currentColor;border-radius:8px;padding:12px 16px;min-height:44px;background:transparent;color:inherit;font:inherit;cursor:pointer;margin:8px}.room-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.room-card{background:#fffefa;border:1px solid #e1e7dc;border-radius:20px;padding:22px}.room-card header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:16px}.room-card h3{font-size:28px;font-weight:500;margin:6px 0}.room-card header p{font-size:12px;margin:0;color:var(--muted)}.room-status{font-size:9px;padding:7px;border-radius:7px;background:#f0f1e9;color:#748067}.room-status.occupied{background:#e4eddd;color:#537345}.assignment{display:flex;gap:9px;align-items:center;border-top:1px solid #edf0e6;padding:13px 0}.assignment-dot{width:7px;height:7px;border-radius:50%;background:#c3ab80;flex-shrink:0}.assignment.current .assignment-dot{background:#7b9258}.assignment strong,.assignment div>span{display:block;font-size:12px}.assignment div>span{color:#74806c;font-size:10px;margin-top:5px}.assignment small{margin-left:auto;font-size:8px;color:#74806c}.assignment.finished{opacity:.6}.assignment.finished .assignment-dot{background:#a9afa2}.room-empty,.directory-note{font-size:12px;color:var(--muted)}button:focus-visible{outline:3px solid #b78432;outline-offset:4px}@media(min-width:1280px){.provider-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(min-width:1500px){main{padding-top:55px}.provider-grid{gap:20px}.workspace{gap:45px}}@media(max-width:1100px){.provider-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace{gap:24px;grid-template-columns:minmax(0,1fr) 220px}.updated{display:none}.steps{gap:12px}.steps small{display:none}.room-grid{grid-template-columns:1fr}}@media(max-width:720px){.lobby-header{padding:20px}.brand strong{font-size:13px}.brand div>span{font-size:7px}.brand-mark{font-size:34px}.clock strong{font-size:17px}.clock>span{font-size:9px}main{padding:32px 20px}.welcome-note{display:none}h1{font-size:58px}.welcome p{font-size:14px}.workspace{grid-template-columns:1fr;margin-top:28px}.workspace aside{display:grid;grid-template-columns:1fr 1fr;gap:15px}.privacy-card{padding:21px}.privacy-card h3{font-size:24px}.help-card{padding:15px 5px}.directory-link{grid-column:1/-1}.steps{justify-content:space-between;gap:6px;font-size:9px}.steps>span{gap:5px}.steps b{width:21px;height:21px}.steps i{display:none}h2{font-size:23px}.lobby-footer{flex-wrap:wrap;gap:12px}.provider-grid{gap:12px}.room-grid{grid-template-columns:1fr}.desktop-break{display:none}}@media(max-width:390px){.provider-grid{grid-template-columns:1fr}.workspace aside{grid-template-columns:1fr}.clock>span{max-width:95px}.steps{font-size:8px}}
</style>
