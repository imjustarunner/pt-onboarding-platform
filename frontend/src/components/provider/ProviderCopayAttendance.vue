<template>
  <section v-if="enabled && (matchingSessions.length || notice || error)" :class="['copay-attendance',{'copay-attendance--compact':compact}]" aria-label="Session attendance and copay protection" @click.stop @pointerdown.stop @mousedown.stop @keydown.stop>
    <h3 v-if="!compact">Confirm completed sessions</h3>
    <p v-if="!compact">Confirm whether each session occurred. Yes may collect the authorized copay. No holds the copay immediately; cancellation or missed-session details can be completed later. Unanswered sessions stay on hold.</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <ul>
      <li v-for="session in visibleSessions" :key="session.sessionId">
        <div><strong v-if="!compact">{{ session.clientLabel }} · {{ formatTime(session.startAt) }}</strong><span>{{ session.documentationRequired ? 'Copay held · Details pending' : 'Did this session occur?' }}</span></div>
        <div class="actions">
          <button v-if="!session.documentationRequired" type="button" :disabled="!!busy || state.busy.has(session.sessionId)" @click="confirm(session, true)">Yes</button>
          <button v-if="!session.documentationRequired" type="button" :disabled="!!busy || state.busy.has(session.sessionId)" class="secondary" @click="confirm(session, false)">No</button>
          <button v-else type="button" :disabled="!!busy || state.busy.has(session.sessionId)" class="secondary" @click="startMissedFlow(session, 'no_show')">Complete details</button>
          <button type="button" :disabled="!!busy || state.busy.has(session.sessionId)" class="secondary" @click="deferSession(session)">{{ session.documentationRequired ? 'Finish later' : 'Later' }}</button>
          <button v-if="session.documentationRequired" type="button" :disabled="!!busy || state.busy.has(session.sessionId)" class="secondary" @click="resetSelection(session)">Selected by mistake?</button>
        </div>
      </li>
    </ul>
    <details v-if="deferredSessions.length" class="attendance-later"><summary>{{ deferredSessions.length }} {{ compact ? 'saved for later' : 'sessions to review later' }}</summary>
      <p>These copays stay on hold. Any recorded No answer is preserved.</p>
      <button v-for="session in deferredSessions" :key="session.sessionId" type="button" @click="state.deferred.delete(session.sessionId)">{{ compact ? 'Review attendance' : session.clientLabel + ' · ' + formatTime(session.startAt) }}</button>
    </details>
  </section>
  <AppointmentChangeWizard :change="appointmentChange" @completed="onMissedComplete" @closed="load" />
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import {attendanceState,refreshAttendance} from './sessionAttendance';
import { useAppointmentChange } from '../../composables/useAppointmentChange';
import AppointmentChangeWizard from '../schedule/AppointmentChangeWizard.vue';
const props=defineProps({agencyId:[Number,String],appointmentId:[Number,String],sessionId:[Number,String],compact:Boolean});
const appointmentChange = useAppointmentChange();
const route = useRoute(), agencyStore = useAgencyStore(), authStore = useAuthStore();
const agencyId = computed(() => Number(props.agencyId || route.query.agencyId || agencyStore.currentAgency?.id || 0));
const serviceDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(String(route.query.copayDate || '')) ? route.query.copayDate : undefined);
const state=computed(()=>attendanceState(agencyId.value,authStore.user?.id));
const enabled=computed(()=>state.value.enabled),zone=computed(()=>state.value.timezone);
const matchingSessions=computed(()=>state.value.sessions.filter(session=>(!props.sessionId||Number(session.sessionId)===Number(props.sessionId))&&(!props.appointmentId||Number(session.appointmentId)===Number(props.appointmentId))&&(!serviceDate.value||new Intl.DateTimeFormat('en-CA',{timeZone:zone.value,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(session.startAt))===serviceDate.value)));
const visibleSessions=computed(()=>matchingSessions.value.filter(s=>!state.value.deferred.has(s.sessionId)));
const deferredSessions=computed(()=>matchingSessions.value.filter(s=>state.value.deferred.has(s.sessionId)));
const busy=ref(null),error=ref(''),notice=ref('');
function deferSession(session){state.value.deferred.add(session.sessionId);notice.value='Saved for later. The copay stays on hold.';}

let timer, generation = 0;
const formatTime = value => new Intl.DateTimeFormat(undefined,{timeZone:zone.value,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
async function load(force=false){
  if(!agencyId.value||!authStore.user?.id||['guardian','client','school_staff'].includes(authStore.user.role))return;
  const current=++generation;
  const result=await refreshAttendance(agencyId.value,authStore.user.id,{force:force===true});
  if(current===generation)error.value=result.error;
}
async function confirm(session, occurred) {
  if(state.value.busy.has(session.sessionId))return;
  const decisionState=state.value;decisionState.busy.add(session.sessionId);
  busy.value=session.sessionId;error.value='';notice.value='';
  try {
    const {data}=await api.post(`/family-billing/provider/copay-attendance/${session.sessionId}`,{agencyId:agencyId.value,occurred},{skipGlobalLoading:true});
    notice.value = !occurred ? 'Copay held. Complete the missed-session or cancellation details now, or choose Finish later.' : data.collection?.paid ? 'Attendance recorded and copay collected.' : 'Attendance recorded. Billing will review payment if needed.';
    window.dispatchEvent(new Event('session-attendance-changed'));
    await load(true);
  } catch(e) { error.value=e.response?.data?.error?.message || 'Attendance could not be saved. Please try again.'; }
  finally { decisionState.busy.delete(session.sessionId);busy.value=null; }
}
async function startMissedFlow(session, eventType) {
  error.value=''; notice.value='';
  if(state.value.busy.has(session.sessionId))return;
  const decisionState=state.value;decisionState.busy.add(session.sessionId);
  busy.value=session.sessionId;
  try {
    await api.post(`/family-billing/provider/copay-attendance/${session.sessionId}`,{agencyId:agencyId.value,occurred:false},{skipGlobalLoading:true});
    if (!session.appointmentId) {
      error.value='The service copay is held. Open this session from your schedule to complete its missed-appointment or cancellation flow; the linked appointment needs office review.';
      window.dispatchEvent(new Event('session-attendance-changed'));
      await load(true); return;
    }
    await appointmentChange.openWizard({appointmentId:session.appointmentId,context:{clientId:session.clientId,clientName:session.clientLabel,whenLabel:formatTime(session.startAt),serviceLabel:session.serviceCode}});
    if (!appointmentChange.workflow.value || appointmentChange.workflow.value.status === 'draft') appointmentChange.facts.eventType=eventType;
    notice.value='The service copay is on hold. Complete the missed-appointment or cancellation details to update the chart.';
    window.dispatchEvent(new Event('session-attendance-changed'));
    await load(true);
  } catch(e) { error.value=e.response?.data?.error?.message || 'Could not begin the missed-appointment flow.'; }
  finally { decisionState.busy.delete(session.sessionId);busy.value=null; }
}
async function resetSelection(session) {
  if(state.value.busy.has(session.sessionId))return;
  const decisionState=state.value;decisionState.busy.add(session.sessionId);
  busy.value=session.sessionId; error.value='';
  try {
    await api.post(`/family-billing/provider/copay-attendance/${session.sessionId}/reset`,{agencyId:agencyId.value},{skipGlobalLoading:true});
    notice.value='Selection reset. Confirm whether the session occurred before saving a session draft. Any existing balance hold stays with billing for review; resetting does not reverse a payment or release a held charge.';
    window.dispatchEvent(new Event('session-attendance-changed'));
    await load(true);
  } catch(e) { error.value=e.response?.data?.error?.message || 'This selection needs billing review before it can be changed.'; }
  finally { decisionState.busy.delete(session.sessionId);busy.value=null; }
}
async function onMissedComplete() {
  notice.value='Appointment change documented. No service copay will run for this session.';
  window.dispatchEvent(new Event('pt-schedule-refresh'));
  window.dispatchEvent(new Event('session-attendance-changed'));
  await load(true);
}
watch([agencyId,serviceDate,()=>authStore.user?.id],()=>{notice.value='';error.value='';load();});
const attendanceChanged=()=>load(true);
onMounted(()=>{load();timer=setInterval(load,60000);window.addEventListener('session-attendance-changed',attendanceChanged);});
onBeforeUnmount(()=>{generation++;clearInterval(timer);window.removeEventListener('session-attendance-changed',attendanceChanged);});
</script>

<style scoped>
.copay-attendance{margin:1rem 0;padding:1rem;border:1px solid var(--border-color,#d6e4df);border-radius:12px;background:var(--surface-color,#fff)}
h3{margin:0 0 .5rem}p{line-height:1.5}ul{list-style:none;margin:0;padding:0}li{padding:.75rem 0;border-top:1px solid #e0e7e5;display:flex;justify-content:space-between;gap:.75rem;align-items:center}.actions{display:flex;gap:.5rem;flex-wrap:wrap}button{min-height:44px;border:0;border-radius:8px;padding:.6rem .9rem;background:#234f66;color:white;cursor:pointer}.secondary{background:#edf2f5;color:#234f66}button:disabled{opacity:.55;cursor:wait}.error{color:#a32929}@media(max-width:600px){li{align-items:flex-start;flex-direction:column}.actions{width:100%}.actions button{flex:1}}
.copay-attendance--compact{margin:5px 0;padding:6px;font-size:11px}.copay-attendance--compact li{padding:3px 0;border:0;flex-direction:column;align-items:flex-start;gap:4px}.copay-attendance--compact button{font-size:11px;min-height:28px;padding:4px 7px}.copay-attendance--compact .actions{gap:3px}.attendance-later{margin-top:6px}.attendance-later summary{cursor:pointer}
</style>
