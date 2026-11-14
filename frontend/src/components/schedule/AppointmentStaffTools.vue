<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import api from '../../services/api';
import { CONVERSA_LOGO_URL } from '../../constants/conversa';
const AppointmentConversa = defineAsyncComponent(() => import('./AppointmentConversa.vue'));
const props = defineProps({ appointmentId: { type: Number, required: true } });
const data = ref(null); const draft = ref(''); const showOnSchedule = ref(false); const editing = ref(false); const loading = ref(false); const saving = ref(false); const error = ref(''); const saved = ref(''); const selectedClientId = ref(0); const messaging = ref(false); let request = 0;
const selectedClient = computed(() => data.value?.clients?.find(c => Number(c.id) === Number(selectedClientId.value)));
const openingLearning = ref(false);
async function openLearningWorkspace() {
  if (openingLearning.value) return;
  openingLearning.value=true;error.value='';
  const id=props.appointmentId;
  try {
    const {data:result}=await api.post(`/appointments/${id}/learning-workspace`,{}, {skipGlobalLoading:true});
    if (props.appointmentId!==id) return;
    if (!/^\/in-person-tutoring-session\/\d+$/.test(result.destination||'')) throw new Error('The learning session could not be opened.');
    window.location.assign(result.destination);
  } catch(e) { error.value=e.response?.data?.error?.message||e.message||'Could not open the learning session.'; }
  finally { openingLearning.value=false; }
}
async function load() {
  const current = ++request; loading.value = true; error.value = ''; saved.value = ''; data.value = null; editing.value = false; messaging.value = false;
  try { const result = await api.get(`/appointments/${props.appointmentId}/staff-tools`, { skipGlobalLoading: true }); if (current === request) { data.value = result.data; draft.value = result.data.alert?.text || ''; showOnSchedule.value = !!result.data.alert?.showOnSchedule; selectedClientId.value = result.data.clients?.[0]?.id || 0; } }
  catch (e) { if (current === request && e.response?.status !== 403) error.value = e.response?.data?.error?.message || 'Could not load appointment tools.'; }
  finally { if (current === request) loading.value = false; }
}
async function save() {
  if (saving.value) return;
  saving.value = true; error.value = ''; saved.value = '';
  const appointmentId = props.appointmentId;
  try {
    const result = await api.put(`/appointments/${appointmentId}/staff-alert`, { text: draft.value, revision: data.value.alert.revision, showOnSchedule: showOnSchedule.value }, { skipGlobalLoading: true });
    window.dispatchEvent(new CustomEvent('appointment-staff-alert-changed', { detail: { appointmentId, alert: result.data.alert } }));
    if (props.appointmentId !== appointmentId) return;
    data.value.alert = result.data.alert; showOnSchedule.value = !!result.data.alert?.showOnSchedule; editing.value = false; saved.value = result.data.alert.text ? 'Schedule clip saved.' : 'Schedule clip removed.';
  } catch (e) { if (props.appointmentId === appointmentId) error.value = e.response?.data?.error?.message || 'Could not save the schedule clip.'; }
  finally { saving.value = false; }
}
watch(() => props.appointmentId, load, { immediate: true });
</script>
<template>
  <section v-if="data || loading || error" class="appointment-staff-tools">
    <p v-if="loading" role="status">Loading appointment tools…</p>
    <template v-if="data">
      <p v-if="data.canOpenLearningWorkspace"><button type="button" :disabled="openingLearning" @click="openLearningWorkspace">{{ openingLearning ? 'Opening…' : 'Open learning session' }}</button></p>
      <div class="staff-alert" :class="{ 'staff-alert--active': !!data.alert.text }">
        <div class="staff-alert__heading"><strong>Schedule clip</strong><button v-if="data.canEdit && !editing" type="button" @click="editing = true; draft = data.alert.text; showOnSchedule = !!data.alert.showOnSchedule">{{ data.alert.text ? 'Edit clip' : 'Add clip' }}</button></div>
        <p class="hint">Visible to providers, support, and admin on this appointment. Choose where the clip appears before saving. The note author must acknowledge a current clip before starting or continuing this session note. Never sent to clients.</p>
        <p v-if="data.alert.text && !editing" class="alert-text">{{ data.alert.text }}</p>
        <p v-if="data.alert.text && !editing" class="hint">{{ data.alert.showOnSchedule ? 'Shown on the schedule.' : 'On this appointment only.' }}</p>
        <form v-if="editing" @submit.prevent="save">
          <label>Clip for this appointment<textarea v-model="draft" rows="2" maxlength="500" :disabled="saving" placeholder="For example: prepare the intake paperwork before this session." /></label>
          <fieldset class="clip-visibility"><legend>Where to show this clip</legend><label><input v-model="showOnSchedule" type="radio" :value="false" :disabled="saving" /> In this appointment</label><label><input v-model="showOnSchedule" type="radio" :value="true" :disabled="saving" /> In this appointment and on the schedule</label></fieldset>
          <div class="staff-alert__actions"><button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save clip' }}</button><button type="button" :disabled="saving" @click="editing = false">Discard changes</button><button v-if="data.alert.text" type="button" :disabled="saving" @click="draft = ''; showOnSchedule = false; save()">Remove clip</button></div>
        </form>
      </div>
      <div v-for="alert in data.diagnosisAlerts || []" :key="`${alert.clientId}:${alert.diagnosisId}:${alert.code}`" class="staff-alert staff-alert--active" role="status"><strong>Diagnosis review</strong><p>{{ alert.message }}</p><a :href="`/admin/clients/${alert.clientId}?tab=clinical`">Review clinical record</a></div>
      <div v-if="data.clients.length" class="staff-contact">
        <label v-if="data.clients.length > 1">Client<select v-model="selectedClientId" @change="messaging = false"><option v-for="client in data.clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></label>
        <button type="button" class="conversa-launch" :aria-expanded="messaging" @click="messaging = !messaging"><img :src="CONVERSA_LOGO_URL" alt="Conversa" /><span><strong>{{ messaging ? 'Close conversation' : 'Contact client' }}</strong><small>Secure message, email, or text</small></span><span aria-hidden="true">{{ messaging ? '⌃' : '→' }}</span></button>
        <AppointmentConversa v-if="messaging && selectedClient" :key="selectedClient.id" :agency-id="data.agencyId" :client-id="selectedClient.id" :client-name="selectedClient.name" @close="messaging = false" />
      </div>
    </template>
    <p v-if="saved" role="status">{{ saved }}</p><p v-if="error" role="alert">{{ error }} <button type="button" :disabled="saving" @click="load">Reload appointment tools</button></p>
  </section>
</template>
<style scoped>
.conversa-launch{display:flex;align-items:center;gap:16px;width:100%;padding:16px!important;border:1px solid #ccdae8!important;border-radius:14px!important;background:linear-gradient(120deg,#f2f7fc,#fff)!important;text-align:left;color:#17385e!important}.conversa-launch img{width:132px;max-width:32%;height:40px;object-fit:contain}.conversa-launch>span:nth-child(2){display:grid;gap:4px;flex:1}.conversa-launch small{font-size:12px;color:#526b88}.conversa-launch>span:last-child{font-size:22px}.staff-contact{padding-top:12px;border-top:1px solid #e1e8f0}

.clip-visibility{border:0;padding:0;margin:12px 0}.clip-visibility legend{font-size:13px;font-weight:600}.clip-visibility label{display:flex;align-items:center;gap:8px;margin:8px 0}.clip-visibility input{width:auto;margin:0;flex:none}
.appointment-staff-tools{grid-column:1/-1;min-width:0}.staff-alert{padding:12px;border:1px solid #cbd5e1;border-radius:10px}.staff-alert--active{background:#fef3c755;border-color:#d6a63d}.staff-alert__heading,.staff-alert__actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.staff-alert__heading{justify-content:space-between}.hint{font-size:12px;color:var(--text-secondary,#64748b);margin:6px 0}.alert-text{white-space:pre-wrap;overflow-wrap:anywhere}.staff-contact{margin-top:12px}button{font:inherit;cursor:pointer;padding:7px 10px;border-radius:7px;border:1px solid #cbd5e1;background:var(--bg-card,#fff);color:inherit}label{display:grid;gap:6px;margin:10px 0}textarea,select{width:100%;box-sizing:border-box;font:inherit;padding:8px;border-radius:8px;border:1px solid #cbd5e1}p[role=alert]{color:#b91c1c}
</style>
