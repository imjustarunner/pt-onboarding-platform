<template>
  <main class="staff-event-page">
    <article class="staff-event-card">
      <p v-if="loading">Loading event…</p>
      <div v-if="!signedIn"><p class="eyebrow">Private event invitation</p><h1>You’re invited</h1><p>Sign in to view the event, respond, vote and see the latest updates.</p><a :href="signInUrl" class="btn btn-primary">Sign in to view event</a></div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <template v-if="event">
        <div class="event-labels"><p class="eyebrow">{{ branding.agencyName }} · Private event</p><span class="attendance-tag">{{ event.mandatory ? 'Mandatory attendance' : 'Optional invitation' }}</span></div>
        <h1>{{ event.title }}</h1>
        <p class="event-date">{{ event.startsAt ? `${formatDate(event.startsAt)} – ${formatDate(event.endsAt)}` : 'Date & time to be decided' }}</p><p v-if="!event.startsAt" class="muted">Help choose the details in the event votes below. Your invitation link stays the same.</p>
        <p v-if="event.eventLocationName || event.locationName">{{ event.eventLocationName || event.locationName }}</p>
        <p v-if="event.eventLocationAddress || event.locationAddress">{{ event.eventLocationAddress || event.locationAddress }}</p>
        <p class="description">{{ event.description }}</p>
        <p v-if="event.employeeReportTime">Report by {{ event.employeeReportTime }}</p>
        <a v-if="!signedIn" :href="signInUrl" class="btn btn-primary">Sign in to RSVP or check in</a>
        <template v-else>
          <a v-if="participation?.canManage && !event.outreachTripId" class="btn btn-secondary" :href="`/admin/company-events?eventId=${eventId}&agencyId=${participation.agencyId}`">Manage this event</a>
          <a v-if="event.outreachTripId && authStore.user?.capabilities?.canAccessOutreach" class="btn btn-secondary" :href="`/admin/outreach-hub?trip=${event.outreachTripId}`">School notes and trip route</a>
          <a v-if="event.isWorkEvent && participation?.canSubmitTravel" class="btn btn-secondary" :href="`/dashboard?tab=submit&eventTravel=${eventId}`">Submit event travel</a>
          <section>
            <h2>{{ event.isWorkEvent ? 'Can you help?' : 'Will you join us?' }}</h2>
            <p>{{ event.isWorkEvent ? 'Your response lets the coordinator know you are interested. The coordinator confirms staff assignments.' : 'Let the organizers know if you can attend. You can update your RSVP here.' }}</p>
            <div class="actions">
              <button type="button" class="btn btn-primary" :disabled="busy" @click="respond('yes')">{{ event.isWorkEvent ? "I'm interested" : "Yes, I’ll be there" }}</button>
              <button type="button" class="btn btn-secondary" :disabled="busy" @click="respond('maybe')">Maybe</button>
              <button type="button" class="btn btn-secondary" :disabled="busy" @click="respond('no')">Unavailable</button>
            </div>
            <p v-if="response" role="status">Response saved: {{ responseLabel }}. {{ event.isWorkEvent ? (participation?.assigned ? 'You are assigned to this event.' : 'Assignment requires coordinator approval.') : 'Thank you for letting us know.' }}</p>
          </section>
          <section v-if="participation && (event.isWorkEvent || participation.clockedIn)" id="event-check-in">
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
        <section v-if="signedIn" class="event-conversation"><div><h2>Keep the conversation going</h2><p>Messages for this event stay together in an invitee group named {{ event.title }}.</p></div><button type="button" class="btn btn-primary" :disabled="busy" @click="openConversation">Message event group</button></section>
        <section v-if="signedIn" class="event-polls"><h2>Help shape the event</h2><p>Vote on dates, plans and other questions. Each vote is separate from your RSVP.</p><StaffPollsPanel :linked-event-id="eventId" /></section>
        <section v-if="event.potluckEnabled" class="event-potluck"><h2>What’s on the table</h2><p v-if="event.organizerProviding?.length">The organizers are bringing: {{ event.organizerProviding.join(', ') }}.</p><p>Choose a requested item, or an open spot to tell us what you’ll bring. You can change your choice.</p><div class="potluck-items"><article v-for="item in needList" :key="item.id" :class="{mine:item.mine}"><span>{{ item.name }}</span><small>{{ item.mine ? 'You’re bringing this' : item.claimed ? 'Already covered' : 'Available' }}</small></article></div><form @submit.prevent="savePotluck"><label>My contribution<select v-model="contributionId"><option value="">I’m not bringing an item</option><option value="__custom">I’ll bring something else</option><option v-for="item in needList.filter(i => !i.claimed || i.mine)" :key="item.id" :value="String(item.id)">{{ item.name }}</option></select></label><label v-if="contributionId === '__custom' || needList.find(i => String(i.id) === contributionId)?.openRequest">What will you bring?<input v-model.trim="contributionName" maxlength="255" required /></label><button class="btn btn-primary" type="submit" :disabled="busy">Save my contribution</button></form></section>
        <section v-if="event.updates?.length"><h2>Event updates</h2><article v-for="update in event.updates" :key="update.id" class="event-update"><time>{{ formatDate(update.scheduledAt) }}</time><p>{{ update.content }}</p></article></section>
        <p class="muted event-footer">Keep this invitation link to see updates, vote and change your response.</p>
        <p v-if="notice" role="status" class="notice">{{ notice }}</p>
      </template>
    </article>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { notifyCompanyEventRsvpChanged } from '../../utils/companyEventRsvpEvents';
import StaffPollsPanel from '../../components/dashboard/StaffPollsPanel.vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
const route = useRoute();
const router = useRouter();
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
const needList = ref([]), contributionId = ref(''), contributionName = ref('');
const responseLabel = computed(() => ({ yes: event.value?.isWorkEvent ? 'Interested' : 'Yes', maybe: 'Maybe', no: 'No' })[response.value] || response.value);
const formatDate = (value) => value ? new Date(value).toLocaleString(undefined,{timeZone:event.value?.timezone || 'America/Denver'}) : '';
const staffEndpoint = () => `/company-events/staff/${eventId.value}/${encodeURIComponent(token.value)}`;
async function loadParticipation() {
  const { data } = await api.get(`/me/company-events/${eventId.value}/participation`);
  participation.value = data;
  if (data.response) response.value = data.response;
}
async function respond(value) {
  busy.value = true; error.value = ''; notice.value = '';
  try { await api.post(`${staffEndpoint()}/respond`, { response: value }); response.value = value; notifyCompanyEventRsvpChanged({eventId:eventId.value,agencyId:event.value?.agencyId,response:value}); notice.value = 'Thank you! Your RSVP was saved.'; if(event.value?.isWorkEvent) await loadParticipation(); }
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
async function loadEvent() {
  const {data} = await api.get(staffEndpoint(), {skipAuthRedirect:true});
  event.value=data.event;branding.value=data.branding || {};needList.value=data.needList || [];response.value=data.event?.response || '';
  const mine=needList.value.find(item=>item.mine);contributionId.value=mine?.custom ? '__custom' : String(mine?.id || '');contributionName.value=mine?.custom ? mine.name : '';
}
async function openConversation() {
  busy.value=true;error.value='';
  try {const {data}=await api.post(`${staffEndpoint()}/conversation`,{});await router.push(data.url);}
  catch(e){error.value=e?.response?.data?.error?.message || 'Could not open the event conversation.';}
  finally{busy.value=false;}
}
async function savePotluck() {
  busy.value=true;error.value='';
  try{await api.post(`${staffEndpoint()}/potluck`,{itemId:contributionId.value==='__custom' ? null : contributionId.value || null,customItemName:contributionId.value ? contributionName.value : ''});await loadEvent();notice.value='Your contribution was saved. Thank you!';}
  catch(e){error.value=e?.response?.data?.error?.message || 'Could not save your contribution.';}
  finally{busy.value=false;}
}
onMounted(async () => {
  try {
    if (!signedIn.value) return;
    await loadEvent();
    if (event.value?.isWorkEvent) await loadParticipation();
    await nextTick();
    if (route.hash === '#event-check-in') document.getElementById('event-check-in')?.scrollIntoView?.();
  }
  catch (e) { error.value = e?.response?.data?.error?.message || 'This event link is unavailable.'; }
  finally { loading.value = false; }
});
</script>

<style scoped>
.staff-event-page { min-height: 100vh; padding: 52px 20px; background: radial-gradient(ellipse at top left,#e3efeb,transparent 60%),#f6f7f4; color:#203d36; }
.staff-event-card { max-width: 880px; margin: 0 auto; padding: 40px; background: white; box-shadow:0 20px 70px #193d3010; border: 1px solid #e2e8f0; border-radius: 14px; }
h1 { margin: 10px 0; font-size: 28px; } h2 { font-size: 20px; } p { line-height: 1.6; } .eyebrow { color: #475569; font-size: 13px; } .description { white-space: pre-wrap; }
section { border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 10px; } .actions { display: flex; flex-wrap: wrap; gap: 10px; }
.travel-fields { display: flex; flex-wrap: wrap; gap: 16px; } .travel-fields label { flex: 1; min-width: 190px; }
input[type="datetime-local"] { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; display: block; margin-top: 6px; }
.attestation { display: block; margin: 16px 0; font-size: 14px; line-height: 1.5; }.error { color: #b91c1c; }.notice { background: #eff6ff; padding: 12px; border-radius: 6px; }
.event-labels{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.attendance-tag{background:#e9f3ed;color:#315c49;padding:7px 12px;border-radius:40px;font-size:12px}.event-date{font-size:19px;font-weight:600}.event-conversation{display:flex;align-items:center;gap:24px;justify-content:space-between}.muted{color:#62756e;font-size:13px}.potluck-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:20px 0}.potluck-items article{border:1px solid #dee8e1;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px}.potluck-items small{color:#6a7c72}.potluck-items .mine{background:#f0f6ef;border-color:#7f9b7f}select,input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;padding:11px;border:1px solid #c9d7ce;border-radius:8px;margin:8px 0 16px}button,a.btn{cursor:pointer;border:1px solid #ccd7d0;border-radius:8px;padding:11px 18px;font:inherit;text-decoration:none}.btn-primary{background:#315e4c;color:#fff}.btn-secondary{background:#f4f6f3;color:#315344}button:disabled{opacity:.55;cursor:default}.event-update{border-left:3px solid #8da891;padding:8px 18px;margin:15px 0}.event-update time{font-size:12px;color:#66786f}.event-footer{padding-top:24px;border-top:1px solid #e2e8e0;margin-top:28px}h1{font-size:36px;letter-spacing:-1px;line-height:1.2}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #6c9a84;outline-offset:3px}@media(max-width:600px){.staff-event-page{padding:20px 10px}.staff-event-card{padding:24px 18px}.event-conversation{display:block}h1{font-size:29px}}
</style>
