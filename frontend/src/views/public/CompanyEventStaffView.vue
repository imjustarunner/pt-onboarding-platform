<template>
  <main class="staff-event-page">
    <article class="staff-event-card">
      <p v-if="loading">Loading event…</p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <template v-if="event">
        <p class="eyebrow">{{ branding.agencyName }} · Staff event</p>
        <h1>{{ event.title }}</h1>
        <p>{{ formatDate(event.startsAt) }} – {{ formatDate(event.endsAt) }}</p>
        <p v-if="event.eventLocationName || event.locationName">{{ event.eventLocationName || event.locationName }}</p>
        <p v-if="event.eventLocationAddress || event.locationAddress">{{ event.eventLocationAddress || event.locationAddress }}</p>
        <p class="description">{{ event.description }}</p>
        <p v-if="event.employeeReportTime">Report by {{ event.employeeReportTime }}</p>
        <a v-if="!signedIn" :href="signInUrl" class="btn btn-primary">Sign in to RSVP or check in</a>
        <template v-else>
          <a v-if="participation?.canManage" class="btn btn-secondary" :href="`/admin/company-events?eventId=${eventId}&agencyId=${participation.agencyId}`">Manage this event</a>
          <section>
            <h2>Can you help?</h2>
            <p>Your response lets the coordinator know you are interested. The coordinator confirms staff assignments.</p>
            <div class="actions">
              <button type="button" class="btn btn-primary" :disabled="busy" @click="respond('yes')">I'm interested</button>
              <button type="button" class="btn btn-secondary" :disabled="busy" @click="respond('maybe')">Maybe</button>
              <button type="button" class="btn btn-secondary" :disabled="busy" @click="respond('no')">Unavailable</button>
            </div>
            <p v-if="response" role="status">Response saved: {{ responseLabel }}. {{ participation?.assigned ? 'You are assigned to this event.' : 'Assignment requires coordinator approval.' }}</p>
          </section>
          <section v-if="participation" id="event-check-in">
            <h2>Event check-in</h2>
            <p v-if="String(event.eventType || '').startsWith('school_')">Approved event time is compensated at your indirect rate. Record travel separately below.</p>
            <p v-if="participation.clockedIn">You are checked in. Check out when your event work ends.</p>
            <p v-else-if="participation.assigned">You are assigned to this event. {{ participation.isEventDay ? 'Check in when your event work begins.' : 'Check-in opens on the event day.' }}</p>
            <p v-else>The coordinator must assign you before you can check in or submit travel time.</p>
            <button v-if="participation.clockedIn" type="button" class="btn btn-primary" :disabled="busy || !participation.canCheckOut" @click="punch('check-out')">Check out</button>
            <button v-else-if="participation.assigned" type="button" class="btn btn-primary" :disabled="busy || !participation.canCheckIn" @click="punch('check-in')">Check in</button>
          </section>
          <section v-if="participation?.assigned || participation?.lastPunch">
            <h2>Travel time</h2>
            <p>Record actual travel to and from this event as Support Activity → Approved Travel, paid at your Support Activity rate. Submit each direction separately from time checked in at the event.</p>
            <form @submit.prevent="submitTravel">
              <label>Travel direction<select v-model="travelDirection" required><option value="to_event">To the event</option><option value="from_event">From the event</option></select></label>
              <p>Enter times in your device timezone: {{ deviceTimezone }}.</p>
              <div class="travel-fields">
                <label>Travel started<input v-model="travelStartedAt" type="datetime-local" required /></label>
                <label>Travel ended<input v-model="travelEndedAt" type="datetime-local" :min="travelStartedAt" required /></label>
              </div>
              <label class="attestation"><input v-model="travelAttestation" type="checkbox" required /> This is my actual travel time and I have not logged it elsewhere.</label>
              <button type="submit" class="btn btn-secondary" :disabled="busy || !travelAttestation || !travelStartedAt || !travelEndedAt">Submit travel for review</button>
            </form>
          </section>
        </template>
        <p v-if="notice" role="status" class="notice">{{ notice }}</p>
      </template>
    </article>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
const route = useRoute();
const authStore = useAuthStore();
const eventId = computed(() => Number(route.params.eventId));
const token = computed(() => String(route.params.token || ''));
const signedIn = computed(() => !!authStore.isAuthenticated);
const signInUrl = computed(() => `/login?redirect=${encodeURIComponent(route.fullPath)}`);
const event = ref(null);
const branding = ref({});
const participation = ref(null);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const response = ref('');
const travelStartedAt = ref('');
const travelEndedAt = ref('');
const travelAttestation = ref(false);
const travelDirection = ref('to_event');
const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const responseLabel = computed(() => ({ yes: 'Interested', maybe: 'Maybe', no: 'Unavailable' })[response.value] || response.value);
const formatDate = (value) => value ? new Date(value).toLocaleString() : '';
const staffEndpoint = () => `/company-events/staff/${eventId.value}/${encodeURIComponent(token.value)}`;
async function loadParticipation() {
  const { data } = await api.get(`/me/company-events/${eventId.value}/participation`);
  participation.value = data;
  if (data.response) response.value = data.response;
}
async function respond(value) {
  busy.value = true; error.value = ''; notice.value = '';
  try { await api.post(`${staffEndpoint()}/respond`, { response: value }); response.value = value; await loadParticipation(); }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not save your response.'; }
  finally { busy.value = false; }
}
async function punch(action) {
  busy.value = true; error.value = ''; notice.value = '';
  try { await api.post(`/me/company-events/${eventId.value}/${action}`, {}); await loadParticipation(); notice.value = action === 'check-in' ? 'Checked in. Your event time is being recorded.' : 'Checked out. Your event time was saved.'; }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not record your event time.'; }
  finally { busy.value = false; }
}
async function submitTravel() {
  if (busy.value || !travelAttestation.value) return;
  const start = new Date(travelStartedAt.value);
  const end = new Date(travelEndedAt.value);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { error.value = 'Travel end must be after travel start.'; return; }
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post(`/me/company-events/${eventId.value}/travel-context`, { travelStartedAt: start.toISOString(), travelEndedAt: end.toISOString(), travelDirection: travelDirection.value, attestation: true });
    await api.post('/payroll/me/time-claims', data);
    notice.value = 'Travel time submitted for review.';
    travelStartedAt.value = ''; travelEndedAt.value = ''; travelAttestation.value = false;
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not submit travel time.'; }
  finally { busy.value = false; }
}
onMounted(async () => {
  try {
    const { data } = await api.get(staffEndpoint(), { skipAuthRedirect: true }); event.value = data.event; branding.value = data.branding || {};
    if (signedIn.value) await loadParticipation();
    await nextTick();
    if (route.hash === '#event-check-in') document.getElementById('event-check-in')?.scrollIntoView?.();
  }
  catch (e) { error.value = e?.response?.data?.error?.message || 'This event link is unavailable.'; }
  finally { loading.value = false; }
});
</script>

<style scoped>
.staff-event-page { min-height: 100vh; padding: 24px 16px; background: #f1f5f9; }
.staff-event-card { max-width: 760px; margin: 0 auto; padding: 28px; background: white; border: 1px solid #e2e8f0; border-radius: 14px; }
h1 { margin: 10px 0; font-size: 28px; } h2 { font-size: 20px; } p { line-height: 1.6; } .eyebrow { color: #475569; font-size: 13px; } .description { white-space: pre-wrap; }
section { border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 10px; } .actions { display: flex; flex-wrap: wrap; gap: 10px; }
.travel-fields { display: flex; flex-wrap: wrap; gap: 16px; } .travel-fields label { flex: 1; min-width: 190px; }
input[type="datetime-local"] { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; display: block; margin-top: 6px; }
.attestation { display: block; margin: 16px 0; font-size: 14px; line-height: 1.5; }.error { color: #b91c1c; }.notice { background: #eff6ff; padding: 12px; border-radius: 6px; }
</style>
