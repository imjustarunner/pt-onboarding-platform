<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import api from '../../services/api';
import {useRoute} from 'vue-router';
const route=useRoute();
const AppointmentConversa = defineAsyncComponent(() => import('./AppointmentConversa.vue'));
const props = defineProps({ appointmentId: { type: Number, required: true } });
const emit=defineEmits(['details']);
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
    if (!/^\/(?:in-person-tutoring-session|tutoring-session)\/\d+$/.test(result.destination||'')) throw new Error('The learning session could not be opened.');
    const prefix=route?.params?.organizationSlug?`/${route.params.organizationSlug}`:'';
    window.location.assign(prefix+result.destination);
  } catch(e) { const message=e.response?.data?.error?.message||e.message||'';error.value=/unknown column|sqlstate|field list|ER_[A-Z_]+/i.test(message)?'The learning session could not be opened. Your appointment is unchanged. Try again, or contact support if this continues.':message||'Could not open the learning session.'; }
  finally { openingLearning.value=false; }
}
async function load() {
  const current = ++request; loading.value = true; error.value = ''; saved.value = ''; data.value = null; editing.value = false; messaging.value = false;
  try { const result = await api.get(`/appointments/${props.appointmentId}/staff-tools`, { skipGlobalLoading: true }); if (current === request) { data.value = result.data; emit('details',result.data);draft.value = result.data.alert?.text || ''; showOnSchedule.value = !!result.data.alert?.showOnSchedule; selectedClientId.value = result.data.clients?.[0]?.id || 0; } }
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
    <p v-if="error" role="alert" tabindex="-1">{{ error }} <button type="button" :disabled="saving||openingLearning" @click="load">Reload appointment tools</button></p>
    <p v-if="loading" role="status">Loading appointment tools…</p>
    <template v-if="data">
      <p v-if="data.canOpenLearningWorkspace"><button type="button" :disabled="openingLearning" @click="openLearningWorkspace">{{ openingLearning ? 'Opening…' : 'Open learning session' }}</button></p>
      <div class="staff-alert" :class="{ 'staff-alert--active': !!data.alert.text }">
        <div class="staff-alert__heading"><strong>Schedule clip</strong><button v-if="data.canEdit && !editing" type="button" @click="editing = true; draft = data.alert.text; showOnSchedule = !!data.alert.showOnSchedule">{{ data.alert.text ? 'Edit clip' : 'Add clip' }}</button></div>
        <p class="hint">Visible to providers, support, and admin on this appointment. Check Show on the schedule to also flag it on the schedule. The note author must acknowledge a current clip before starting or continuing this session note. Never sent to clients.</p>
        <p v-if="data.alert.text && !editing" class="alert-text">{{ data.alert.text }}</p>
        <p v-if="data.alert.text && !editing" class="hint">{{ data.alert.showOnSchedule ? 'Shown on the schedule.' : 'On this appointment only.' }}</p>
        <form v-if="editing" @submit.prevent="save">
          <label>Clip for this appointment<textarea v-model="draft" rows="2" maxlength="500" :disabled="saving" placeholder="For example: prepare the worksheet before this session." /></label>
          <label class="check"><input v-model="showOnSchedule" type="checkbox" :disabled="saving" /> Show on the schedule</label>
          <div class="staff-alert__actions"><button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save clip' }}</button><button type="button" :disabled="saving" @click="editing = false">Discard changes</button><button v-if="data.alert.text" type="button" :disabled="saving" @click="draft = ''; showOnSchedule = false; save()">Remove clip</button></div>
        </form>
      </div>
      <div v-for="alert in data.diagnosisAlerts || []" :key="`${alert.clientId}:${alert.diagnosisId}:${alert.code}`" class="staff-alert staff-alert--active" role="status"><strong>Diagnosis review</strong><p>{{ alert.message }}</p><a :href="`/admin/clients/${alert.clientId}?tab=clinical`">Review clinical record</a></div>
      <div v-if="data.clients.length" class="staff-contact">
        <label v-if="data.clients.length > 1">Client<select v-model="selectedClientId" @change="messaging = false"><option v-for="client in data.clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></label>
        <button type="button" @click="messaging = !messaging">{{ messaging ? 'Hide messages' : 'Text, message or email client · Conversa' }}</button>
        <AppointmentConversa v-if="messaging && selectedClient" :key="selectedClient.id" :agency-id="data.agencyId" :client-id="selectedClient.id" :client-name="selectedClient.name" @close="messaging = false" />
      </div>
    </template>
    <p v-if="saved" role="status">{{ saved }}</p>
  </section>
</template>
<style scoped>
.appointment-staff-tools{grid-column:1/-1;min-width:0}.staff-alert{padding:12px;border:1px solid #cbd5e1;border-radius:10px}.staff-alert--active{background:#fef3c755;border-color:#d6a63d}.staff-alert__heading,.staff-alert__actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.staff-alert__heading{justify-content:space-between}.hint{font-size:12px;color:var(--text-secondary,#64748b);margin:6px 0}.alert-text{white-space:pre-wrap;overflow-wrap:anywhere}.staff-contact{margin-top:12px}button{font:inherit;cursor:pointer;padding:7px 10px;border-radius:7px;border:1px solid #cbd5e1;background:var(--bg-card,#fff);color:inherit}label{display:grid;gap:6px;margin:10px 0}textarea,select{width:100%;box-sizing:border-box;font:inherit;padding:8px;border-radius:8px;border:1px solid #cbd5e1}p[role=alert]{color:#b91c1c}
</style>
