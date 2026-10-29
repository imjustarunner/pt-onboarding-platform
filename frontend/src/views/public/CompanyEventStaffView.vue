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
          <a v-if="participation?.canManage && !event.outreachTripId" class="btn btn-secondary" :href="`/admin/company-events?eventId=${eventId}&agencyId=${participation.agencyId}`">Manage this event</a>
          <a v-if="event.outreachTripId && authStore.user?.capabilities?.canAccessOutreach" class="btn btn-secondary" :href="`/admin/outreach-hub?trip=${event.outreachTripId}`">School notes and trip route</a>
          <a v-if="participation?.canSubmitTravel" class="btn btn-secondary" :href="`/dashboard?tab=submit&eventTravel=${eventId}`">Submit event travel</a>
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
            <p v-if="participation.adminTimeHourlyRate">Your approved outreach work uses Admin Time at ${{ Number(participation.adminTimeHourlyRate).toFixed(2) }}/hour. Submit travel separately.</p>
            <p v-else-if="String(event.eventType || '').startsWith('school_')">Approved event work uses your applicable event rate. Submit travel separately.</p>
            <p v-if="event.outreachTripId">Check in and out at each school stop. Check out while driving between schools; report that travel in Submit.</p>
            <p v-if="participation.clockedIn">You are checked in. Check out when your event work ends.</p>
            <p v-else-if="participation.assigned">You are assigned to this event. {{ participation.isEventDay ? 'Check in when your event work begins.' : 'Check-in opens on the event day.' }}</p>
            <p v-else>The coordinator must assign you before you can check in or submit travel time.</p>
            <template v-if="participation.clockedIn">
              <p v-if="participation.lastPunch?.at">Clocked in: {{ formatDate(participation.lastPunch.at) }}</p>
              <div class="actions">
                <button type="button" class="btn btn-primary" :disabled="busy || !participation.canCheckOut" @click="punch('check-out')">Clock out now</button>
                <button type="button" class="btn btn-secondary" :disabled="busy || !participation.canCheckOut" @click="showCheckoutTime = !showCheckoutTime">Choose checkout time</button>
              </div>
              <form v-if="showCheckoutTime" @submit.prevent="submitCheckoutTime">
                <p>Already finished? Enter the actual time your event work ended, in your device timezone: {{ deviceTimezone }}.</p>
                <label>Work ended<input v-model="checkoutTime" type="datetime-local" :min="checkoutMinimum" :max="localInputTime(new Date())" required /></label>
                <label class="attestation"><input v-model="checkoutAttestation" type="checkbox" required /> This is the actual time I finished working at the event.</label>
                <button type="submit" class="btn btn-primary" :disabled="busy || !participation.canCheckOut || !checkoutTime || !checkoutAttestation">Save checkout time</button>
              </form>
            </template>
            <button v-else-if="participation.assigned" type="button" class="btn btn-primary" :disabled="busy || !participation.canCheckIn" @click="punch('check-in')">Check in</button>
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
const showCheckoutTime = ref(route.query?.attendance === 'checkout-time');
const checkoutTime = ref('');
const checkoutAttestation = ref(false);
const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const localInputTime = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const checkoutMinimum = computed(() => participation.value?.lastPunch?.at ? localInputTime(participation.value.lastPunch.at) : '');
const response = ref('');
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
async function punch(action, payload = {}) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await api.post(`/me/company-events/${eventId.value}/${action}`, payload); await loadParticipation(); notice.value = action === 'check-in' ? 'Checked in. Your event time is being recorded.' : 'Checked out. Your event time was saved.'; checkoutTime.value = ''; checkoutAttestation.value = false; showCheckoutTime.value = false; }
  catch (e) { error.value = e?.response?.data?.error?.message || 'Could not record your event time.'; }
  finally { busy.value = false; }
}
async function submitCheckoutTime() {
  if (busy.value || !checkoutAttestation.value) return;
  const chosen = new Date(checkoutTime.value);
  if (!Number.isFinite(chosen.getTime()) || chosen > new Date()) { error.value = 'Choose the actual time you finished, no later than now.'; return; }
  if (participation.value?.lastPunch?.at && chosen <= new Date(participation.value.lastPunch.at)) { error.value = 'Checkout time must be after your clock-in time.'; return; }
  await punch('check-out', { checkoutAt: chosen.toISOString() });
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
