<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAppointmentChange } from '../../composables/useAppointmentChange';
import { invalidateScheduleSummaryRequests } from '../../utils/scheduleSummaryRequests';
import { parseScheduleUtcInstant } from '../../utils/scheduleEventInstants';

const AppointmentChangeWizard = defineAsyncComponent(() => import('../schedule/AppointmentChangeWizard.vue'));
const AppointmentCommunicationsPanel = defineAsyncComponent(() => import('../schedule/AppointmentCommunicationsPanel.vue'));

const props = defineProps({ item: { type: Object, required: true }, providerId: { type: Number, required: true } });
const emit = defineEmits(['close', 'changed']);
const route = useRoute();
const dialog = ref(null);
const appointment = ref(null);
const loading = ref(false);
const loadError = ref('');
const actionError = ref('');
const working = ref('');
const feedback = ref('');
const selectedAction = ref('');
const historyOpen = ref(false);
const change = useAppointmentChange({ recoverOperations: false });
const appointmentId = computed(() => Number(props.item.appointmentId) || 0);
const singleClient = computed(() => {
  const participants = appointment.value?.participants?.filter(p => p.clientId) || [];
  return participants.length === 1 ? participants[0].clientId : null;
});
const status = computed(() => String(appointment.value?.status || ''));
const response = computed(() => {
  const details = appointment.value?.cancellationRecommendationJson || {};
  if (appointment.value?.serviceSetting?.isSchool) return 'RSVP not requested for school visits';
  if (/cancel/.test(status.value)) return status.value === 'cancellation_requested' ? 'Cancellation requested' : 'Canceled';
  if (status.value === 'reschedule_requested') return 'New time requested';
  if (details.staffConfirmationRecordedAt) return 'Confirmed with staff';
  if (status.value === 'client_confirmed' || details.clientReply === 'confirm') return 'Confirmed by client or guardian';
  if (status.value === 'confirmed') return 'Confirmed';
  return 'No RSVP recorded';
});
const canChange = computed(() => appointment.value && appointment.value.providerUserId === props.providerId
  && appointment.value.productOrigin !== 'auricwell_ehr'
  && ['scheduled', 'confirmed', 'client_confirmed', 'cancellation_requested', 'reschedule_requested', 'checked_in'].includes(status.value));
const canConfirm = computed(() => canChange.value && status.value === 'scheduled' && singleClient.value
  && appointment.value.serviceSetting?.requiresConfirmation === true
  && !appointment.value.cancellationRecommendationJson?.clientReply
  && +parseScheduleUtcInstant(appointment.value.startAt) > Date.now());
const canReleaseAppointmentRoom = computed(() => canChange.value && !!appointment.value.officeEventId
  && +parseScheduleUtcInstant(appointment.value.endAt) > Date.now());
const canReleaseRoom = computed(() => !appointmentId.value && !!props.item.roomReservation
  && props.item.endMs > Date.now());
const scheduleLink = computed(() => {
  const slug = route.params.organizationSlug;
  const date = props.item.dateYmd;
  return {
    path: slug ? `/${slug}/my-schedule` : '/my-schedule',
    query: { ...(date ? { date } : {}), ...(appointmentId.value
      ? { scheduleAction: 'appointment', scheduleAppointmentId: String(appointmentId.value) }
      : {}) }
  };
});

function openDialog() {
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
}
onMounted(openDialog);
watch(change.open, open => {
  if (open) dialog.value?.close();
  else openDialog();
});

async function load() {
  if (!appointmentId.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.get(`/appointments/${appointmentId.value}`, { skipGlobalLoading: true });
    if (!data?.appointment) throw new Error('Appointment unavailable');
    appointment.value = data.appointment;
  } catch (error) {
    loadError.value = error.response?.data?.error?.message || 'Could not load appointment details.';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function saveSelectedAction() {
  const action = selectedAction.value;
  if (working.value || !action || (action === 'confirm' ? !canConfirm.value : !canReleaseRoom.value)) return;
  working.value = action;
  actionError.value = '';
  try {
    if (action === 'confirm') {
      await api.post(`/appointments/${appointmentId.value}/staff-confirmation`, { clientConfirmedWithStaff: true }, { skipGlobalLoading: true });
      feedback.value = 'Confirmation recorded.';
      await load();
    } else {
      const { officeId, eventId, date } = props.item.roomReservation;
      await api.post(`/office-slots/${officeId}/events/${eventId}/occupancy`, { usage: 'vacant', date }, { skipGlobalLoading: true });
      emit('close');
    }
    selectedAction.value = '';
    notifyChange();
  } catch (error) {
    actionError.value = error.response?.data?.error?.message || 'Could not save the change. Try again.';
  } finally {
    working.value = '';
  }
}

function notifyChange() {
  invalidateScheduleSummaryRequests(props.providerId);
  emit('changed');
  window.dispatchEvent(new Event('pt-schedule-refresh'));
}

function changeAppointment(eventType, releaseOffice = false) {
  if (!canChange.value) return;
  selectedAction.value = '';
  void change.openWizard({
    appointmentId: appointmentId.value,
    initialEventType: eventType,
    initialOfficeDisposition: releaseOffice ? 'release' : 'keep',
    context: {
      clientId: singleClient.value,
      clientName: props.item.title,
      whenLabel: props.item.timeLabel,
      businessType: appointment.value.businessType,
      serviceLabel: appointment.value.serviceLabel || appointment.value.title
    }
  });
}
async function onChangeCompleted(result) {
  notifyChange();
  feedback.value = result.pendingApproval ? 'Request saved for review.' : 'Appointment updated.';
  await load();
}
</script>

<template>
  <dialog ref="dialog" class="dashboard-visit" aria-labelledby="dashboard-visit-title" @cancel.prevent="!working && emit('close')">
    <header class="visit-header">
      <div>
        <span class="visit-kicker">My Schedule</span>
        <h2 id="dashboard-visit-title">{{ item.title }}</h2>
        <p>{{ item.timeLabel }}<template v-if="item.subtitle"> · {{ item.subtitle }}</template></p>
      </div>
      <button type="button" class="visit-close" aria-label="Close schedule details" :disabled="!!working" @click="emit('close')">×</button>
    </header>

    <div class="visit-body">
      <p v-if="loading" role="status">Loading appointment…</p>
      <p v-if="loadError" role="alert">{{ loadError }} <button type="button" class="btn btn-secondary" @click="load">Retry</button></p>

      <section v-if="appointment" class="visit-response" aria-label="Appointment RSVP">
        <div>
          <span class="visit-label">Appointment RSVP</span>
          <strong>{{ response }}</strong>
        </div>
        <button v-if="canConfirm" type="button" class="btn btn-primary" :disabled="!!working" @click="selectedAction = 'confirm'">
          Record confirmation
        </button>
      </section>

      <div v-if="canChange || canReleaseRoom" class="visit-actions">
        <button v-if="canChange" type="button" class="btn btn-secondary" :disabled="!!working" @click="changeAppointment('rescheduled')">Reschedule</button>
        <button v-if="canChange" type="button" class="btn btn-secondary" :disabled="!!working" @click="changeAppointment('canceled')">Cancel appointment</button>
        <button v-if="canReleaseAppointmentRoom" type="button" class="btn btn-secondary" :disabled="!!working"
          @click="changeAppointment('canceled', true)">Cancel &amp; review room release</button>
        <button v-if="canReleaseRoom" type="button" class="btn btn-secondary" :disabled="!!working" @click="selectedAction = 'vacant'">Mark room vacant</button>
      </div>

      <section v-if="selectedAction" class="visit-confirmation" aria-label="Review change">
        <p v-if="selectedAction === 'confirm'">Did the client or guardian confirm this appointment with you?</p>
        <p v-else>Release this room for the selected date so others can reserve it?</p>
        <div class="visit-actions">
          <button type="button" class="btn btn-primary" :disabled="!!working" @click="saveSelectedAction">
            {{ working ? 'Saving…' : selectedAction === 'confirm' ? 'Yes, record confirmation' : 'Release room' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="!!working" @click="selectedAction = ''; actionError = ''">Go back</button>
        </div>
      </section>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
      <p v-if="feedback" role="status">{{ feedback }}</p>

      <details v-if="appointment" class="visit-history" @toggle="historyOpen = $event.currentTarget.open">
        <summary>Reminders &amp; communication history</summary>
        <AppointmentCommunicationsPanel v-if="historyOpen" :appointment-id="appointmentId" :client-id="singleClient || 0" inline-offer-history />
      </details>
    </div>

    <footer class="visit-footer">
      <router-link :to="scheduleLink" @click="emit('close')">Open in full schedule ↗</router-link>
    </footer>
  </dialog>
  <AppointmentChangeWizard v-if="change.open.value" :change="change" @completed="onChangeCompleted" />
</template>

<style scoped>
.dashboard-visit {
  width: min(680px, calc(100vw - 2rem));
  max-height: 88dvh;
  padding: 0;
  border: 1px solid var(--border-color, #d8e1ec);
  border-top: 4px solid #b8954e;
  border-radius: 16px;
  background: var(--bg-card, #fff);
  color: var(--text-primary, #162640);
  box-shadow: 0 24px 70px #14274644;
}
.dashboard-visit::backdrop { background: #14243b80; }
.visit-header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1.25rem 1.5rem; background: var(--bg-secondary, #f1f5fb); }
.visit-kicker, .visit-label { display: block; font-size: .82rem; color: var(--text-secondary, #445670); }
.visit-header h2 { margin: .25rem 0; font-size: 1.55rem; overflow-wrap: anywhere; }
.visit-header p { margin: .15rem 0; color: var(--text-secondary, #445670); }
.visit-close { width: 2.25rem; height: 2.25rem; flex: none; border: 1px solid var(--border-color, #cad6e5); border-radius: 8px; background: var(--bg-card, #fff); color: inherit; cursor: pointer; font-size: 1.4rem; }
.visit-body { display: grid; gap: 1rem; padding: 1.25rem 1.5rem; }
.visit-response, .visit-actions { display: flex; gap: .55rem; flex-wrap: wrap; align-items: center; }
.visit-response { justify-content: space-between; }
.visit-confirmation, .visit-history { padding: .9rem; border: 1px solid var(--border-color, #dce4ef); border-radius: 10px; }
.visit-confirmation { background: var(--bg-secondary, #f1f5fb); }
.visit-confirmation p { margin: 0 0 .7rem; }
.visit-history summary { font-weight: 650; cursor: pointer; }
.visit-footer { padding: .85rem 1.5rem; border-top: 1px solid var(--border-color, #dce4ef); }
.visit-body p[role="alert"] { color: var(--error, #9b2923); }
</style>
