<template>
  <section v-if="enabled && (sessions.length || notice || error)" class="copay-attendance" aria-labelledby="copay-attendance-title">
    <h3 id="copay-attendance-title">Confirm completed sessions</h3>
    <p>For these sessions, confirming attendance collects the verified copay from the authorized card. Please also complete your session note.</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <ul>
      <li v-for="session in sessions" :key="session.sessionId">
        <div><strong>{{ session.clientLabel }}</strong> · {{ formatTime(session.startAt) }}</div>
        <div class="actions">
          <button type="button" :disabled="!!busy" @click="confirm(session, true)">Occurred</button>
          <button type="button" :disabled="!!busy" class="secondary" @click="confirm(session, false)">Did not occur</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
const route = useRoute(), agencyStore = useAgencyStore(), authStore = useAuthStore();
const agencyId = computed(() => Number(route.query.agencyId || agencyStore.currentAgency?.id || 0));
const serviceDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(String(route.query.copayDate || '')) ? route.query.copayDate : undefined);
const enabled = ref(false), sessions = ref([]), busy = ref(null), error = ref(''), notice = ref(''), zone = ref('America/Denver');
let timer, generation = 0;
const formatTime = value => new Intl.DateTimeFormat(undefined,{timeZone:zone.value,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
async function load() {
  const current = ++generation;
  if (!agencyId.value || !authStore.user?.id || ['guardian','client','school_staff'].includes(authStore.user.role)) { enabled.value=false; sessions.value=[]; return; }
  try {
    const { data } = await api.get('/family-billing/provider/copay-attendance',{params:{agencyId:agencyId.value,date:serviceDate.value}});
    if (current !== generation) return;
    enabled.value = data.enabled === true; sessions.value = data.sessions || []; zone.value = data.timezone || 'America/Denver';
  } catch (e) {
    if (current === generation && enabled.value) error.value = e.response?.data?.error?.message || 'Attendance could not be refreshed. Please try again.';
  }
}
async function confirm(session, occurred) {
  busy.value=session.sessionId;error.value='';notice.value='';
  try {
    const {data}=await api.post(`/family-billing/provider/copay-attendance/${session.sessionId}`,{agencyId:agencyId.value,occurred});
    notice.value = !occurred ? 'Recorded. No copay will be collected for this session.' : data.collection?.paid ? 'Attendance recorded and copay collected.' : 'Attendance recorded. Billing will review payment if needed.';
    await load();
  } catch(e) { error.value=e.response?.data?.error?.message || 'Attendance could not be saved. Please try again.'; }
  finally { busy.value=null; }
}
watch([agencyId,serviceDate],()=>{notice.value='';error.value='';load();});
onMounted(()=>{load();timer=setInterval(load,60000);});
onBeforeUnmount(()=>{generation++;clearInterval(timer);});
</script>

<style scoped>
.copay-attendance{margin:1rem 0;padding:1rem;border:1px solid var(--border-color,#d6e4df);border-radius:12px;background:var(--surface-color,#fff)}
h3{margin:0 0 .5rem}p{line-height:1.5}ul{list-style:none;margin:0;padding:0}li{padding:.75rem 0;border-top:1px solid #e0e7e5;display:flex;justify-content:space-between;gap:.75rem;align-items:center}.actions{display:flex;gap:.5rem;flex-wrap:wrap}button{min-height:44px;border:0;border-radius:8px;padding:.6rem .9rem;background:#234f66;color:white;cursor:pointer}.secondary{background:#edf2f5;color:#234f66}button:disabled{opacity:.55;cursor:wait}.error{color:#a32929}@media(max-width:600px){li{align-items:flex-start;flex-direction:column}.actions{width:100%}.actions button{flex:1}}
</style>
