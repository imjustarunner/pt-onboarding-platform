<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import api from '../../services/api';
const AppointmentConversa = defineAsyncComponent(() => import('./AppointmentConversa.vue'));
const props = defineProps({ appointmentId: { type: Number, required: true } });
const data = ref(null); const draft = ref(''); const editing = ref(false); const loading = ref(false); const saving = ref(false); const error = ref(''); const saved = ref(''); const selectedClientId = ref(0); const messaging = ref(false); let request = 0;
const selectedClient = computed(() => data.value?.clients?.find(c => Number(c.id) === Number(selectedClientId.value)));
async function load() {
  const current = ++request; loading.value = true; error.value = ''; saved.value = ''; data.value = null; editing.value = false; messaging.value = false;
  try { const result = await api.get(`/appointments/${props.appointmentId}/staff-tools`, { skipGlobalLoading: true }); if (current === request) { data.value = result.data; draft.value = result.data.alert?.text || ''; selectedClientId.value = result.data.clients?.[0]?.id || 0; } }
  catch (e) { if (current === request && e.response?.status !== 403) error.value = e.response?.data?.error?.message || 'Could not load appointment tools.'; }
  finally { if (current === request) loading.value = false; }
}
async function save() {
  if (saving.value) return;
  saving.value = true; error.value = ''; saved.value = '';
  const appointmentId = props.appointmentId;
  try {
    const result = await api.put(`/appointments/${appointmentId}/staff-alert`, { text: draft.value, revision: data.value.alert.revision }, { skipGlobalLoading: true });
    window.dispatchEvent(new CustomEvent('appointment-staff-alert-changed', { detail: { appointmentId, alert: result.data.alert } }));
    if (props.appointmentId !== appointmentId) return;
    data.value.alert = result.data.alert; editing.value = false; saved.value = result.data.alert.text ? 'Appointment alert saved.' : 'Appointment alert removed.';
  } catch (e) { if (props.appointmentId === appointmentId) error.value = e.response?.data?.error?.message || 'Could not save the appointment alert.'; }
  finally { saving.value = false; }
}
watch(() => props.appointmentId, load, { immediate: true });
</script>
<template>
  <section v-if="data || loading || error" class="appointment-staff-tools">
    <p v-if="loading" role="status">Loading appointment tools…</p>
    <template v-if="data">
      <div class="staff-alert" :class="{ 'staff-alert--active': !!data.alert.text }">
        <div class="staff-alert__heading"><strong>⚑ Internal appointment alert</strong><button v-if="data.canEdit && !editing" type="button" @click="editing = true; draft = data.alert.text">{{ data.alert.text ? 'Edit alert' : 'Add alert' }}</button></div>
        <p class="hint">Visible to staff with full access to this schedule. Never sent to clients.</p>
        <p v-if="data.alert.text && !editing" class="alert-text">{{ data.alert.text }}</p>
        <form v-if="editing" @submit.prevent="save">
          <label>Reminder for this appointment<textarea v-model="draft" rows="2" maxlength="500" :disabled="saving" placeholder="For example: prepare the intake paperwork before this session." /></label>
          <div class="staff-alert__actions"><button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save alert' }}</button><button type="button" :disabled="saving" @click="editing = false">Discard changes</button><button v-if="data.alert.text" type="button" :disabled="saving" @click="draft = ''; save()">Remove alert</button></div>
        </form>
      </div>
      <div v-if="data.clients.length" class="staff-contact">
        <label v-if="data.clients.length > 1">Client<select v-model="selectedClientId" @change="messaging = false"><option v-for="client in data.clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></label>
        <button type="button" @click="messaging = !messaging">{{ messaging ? 'Hide messages' : 'Text, message or email client · Conversa' }}</button>
        <AppointmentConversa v-if="messaging && selectedClient" :key="selectedClient.id" :agency-id="data.agencyId" :client-id="selectedClient.id" :client-name="selectedClient.name" @close="messaging = false" />
      </div>
    </template>
    <p v-if="saved" role="status">{{ saved }}</p><p v-if="error" role="alert">{{ error }} <button type="button" :disabled="saving" @click="load">Reload appointment tools</button></p>
  </section>
</template>
<style scoped>
.appointment-staff-tools{grid-column:1/-1;min-width:0}.staff-alert{padding:12px;border:1px solid #cbd5e1;border-radius:10px}.staff-alert--active{background:#fef3c755;border-color:#d6a63d}.staff-alert__heading,.staff-alert__actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.staff-alert__heading{justify-content:space-between}.hint{font-size:12px;color:var(--text-secondary,#64748b);margin:6px 0}.alert-text{white-space:pre-wrap;overflow-wrap:anywhere}.staff-contact{margin-top:12px}button{font:inherit;cursor:pointer;padding:7px 10px;border-radius:7px;border:1px solid #cbd5e1;background:var(--bg-card,#fff);color:inherit}label{display:grid;gap:6px;margin:10px 0}textarea,select{width:100%;box-sizing:border-box;font:inherit;padding:8px;border-radius:8px;border:1px solid #cbd5e1}p[role=alert]{color:#b91c1c}
</style>
