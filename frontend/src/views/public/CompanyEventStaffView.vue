<template>
  <main class="event-experience event-experience--conversa staff-event-page">
    <nav class="ee-nav" aria-label="Event navigation"><div class="ee-nav-inner"><a class="ee-nav-brand" href="/dashboard"><img :src="CONVERSA_EVENT_LOGO_URL" alt="Conversa" width="140" height="36" /><span class="ee-nav-product">Events</span></a><div class="ee-nav-links"><a href="/dashboard"><House :size="18" aria-hidden="true" />Home</a><a href="#event-overview" aria-current="page"><CalendarDays :size="18" aria-hidden="true" />Events</a><a href="/messages?view=workspace&tab=dms"><Users :size="18" aria-hidden="true" />Groups</a><a href="/messages"><MessageSquare :size="18" aria-hidden="true" />Messages</a></div><EventHostIdentity v-if="displayBranding.agencyName" :branding="displayBranding" compact class="ee-nav-host" /><span v-if="signedIn" class="ee-nav-person" :aria-label="userName">{{ initials(userName) }}</span></div></nav>
    <div class="ee-container">
      <div v-if="loading" class="ee-card ee-page-state" role="status">Loading your event…</div>
      <template v-else-if="!signedIn || (!event && invitationPreview)"><CompanyEventPublicView v-if="showGuestRegistration && eventId" :key="eventId" :event-id="eventId" /><template v-else-if="invitationPreview"><EventInvitationPreview :invitation="invitationPreview" :sign-in-url="signInUrl" :guest-registration-url="guestRegistrationUrl" :signed-in="signedIn" /><CompanyEventRsvpView v-if="personalInvitation" :key="personalInvitation" :invitation-token="personalInvitation" :expected-event-id="eventId" class="event-personal-rsvp" /></template><div v-else class="ee-card ee-page-state"><p class="ee-muted">Private event invitation</p><h1>You’re invited</h1><p>Sign in to view this event and join in.</p><a :href="signInUrl" class="ee-button ee-button-primary">Sign in to view event</a></div></template>
      <p v-if="error" role="alert" class="ee-error">{{ error }}</p>
      <template v-if="event">
        <EventPageHero :event="event" :branding="branding" conversa :status="rsvpClosed ? 'RSVP closed' : event.startsAt ? 'Open RSVP' : 'Planning together'" />
        <div v-if="canManage || event.outreachTripId || participation?.canSubmitTravel" class="event-organizer-actions"><a v-if="canManage && !event.outreachTripId" class="ee-button" :href="`/admin/company-events?eventId=${eventId}&agencyId=${event.agencyId}`">Manage this event <ArrowUpRight :size="14" aria-hidden="true" /></a><a v-if="event.outreachTripId && authStore.user?.capabilities?.canAccessOutreach" class="ee-button" :href="`/admin/outreach-hub?trip=${event.outreachTripId}`">School notes and trip route</a><a v-if="event.isWorkEvent && participation?.canSubmitTravel" class="ee-button" :href="`/dashboard?tab=submit&eventTravel=${eventId}`">Submit event travel</a></div>
        <div class="ee-overview-grid">
          <section class="ee-card event-rsvp-card" aria-labelledby="event-rsvp-title">
            <h2 id="event-rsvp-title">Your RSVP</h2><p class="ee-muted">{{ event.isWorkEvent ? 'Your response lets the coordinator know you are interested. The coordinator confirms staff assignments.' : 'Let the organizers know if you can attend.' }}</p>
            <div class="event-rsvp-options" role="group" aria-label="Your event response"><button v-for="choice in responseChoices" :key="choice.value" type="button" :aria-pressed="response === choice.value" :class="{selected:response === choice.value}" :disabled="busy || rsvpClosed" @click="respond(choice.value)"><component :is="choice.icon" :size="22" aria-hidden="true" />{{ event.isWorkEvent && choice.value === 'yes' ? "I'm interested" : choice.label }}</button></div>
            <div v-if="response" class="event-rsvp-receipt" :class="`response-${response}`" role="status"><span class="event-response-check"><component :is="response === 'yes' ? Check : response === 'maybe' ? CircleHelp : X" :size="18" aria-hidden="true" /></span><div><strong>{{ responseHeading }}</strong><p>{{ event.isWorkEvent ? (participation?.assigned ? 'You are assigned to this event.' : 'Assignment requires coordinator approval.') : 'Thanks for your RSVP. We’ll keep you updated with any changes.' }}</p></div><span v-if="event.attendance?.attending" class="ee-pill"><Users :size="15" aria-hidden="true" />{{ event.attendance.attending }} attending</span></div>
            <p v-else class="event-response-hint">{{ event.mandatory ? 'Mandatory attendance · Please confirm your plans.' : 'Optional invitation · You can change your response any time before RSVPs close.' }}</p>
            <p v-if="rsvpClosed" class="event-response-hint">RSVP changes are closed. Contact the organizer if your plans have changed.</p>
            <p v-if="notice" role="status" class="event-save-notice">{{ notice }}</p>
          </section>
          <section class="ee-card event-facts-card" aria-labelledby="event-facts-title"><h2 id="event-facts-title">Event details</h2><dl><div><dt><Users :size="17" aria-hidden="true" />Who’s invited</dt><dd>{{ event.audienceLabel || 'Event invitees' }}</dd></div><div><dt><Tag :size="17" aria-hidden="true" />Event type</dt><dd>{{ eventTypeLabel }}</dd></div><div><dt><MapPin :size="17" aria-hidden="true" />Format</dt><dd>{{ event.eventLocationName || event.eventLocationAddress ? 'In person' : 'To be confirmed' }}</dd></div><div><dt><Map :size="17" aria-hidden="true" />Location</dt><dd>{{ event.eventLocationAddress || event.eventLocationName || 'Details to follow' }}</dd></div><div><dt><UserRound :size="17" aria-hidden="true" />Attendance</dt><dd>{{ event.mandatory ? 'Mandatory attendance' : 'Optional invitation' }}</dd></div><div v-if="event.rsvpDeadline"><dt><Clock3 :size="17" aria-hidden="true" />RSVP by</dt><dd>{{ formatDate(event.rsvpDeadline) }}</dd></div></dl><details v-if="calendarReady" class="event-calendar-menu"><summary><CalendarPlus :size="19" aria-hidden="true" />Add to calendar <ChevronDown :size="16" aria-hidden="true" /></summary><div><a :href="googleCalendarUrl" target="_blank" rel="noopener">Google Calendar <ArrowUpRight :size="14" aria-hidden="true" /></a><button type="button" @click="downloadCalendar">Apple / Outlook calendar file</button></div></details><p v-else class="event-calendar-pending"><CalendarClock :size="17" aria-hidden="true" />Calendar options appear once the date is set.</p></section>
        </div>
        <EventConversation :key="eventId" :endpoint="`${staffEndpoint()}/conversation`" :title="event.title" :me-id="authStore.user?.id || 0" />
        <section class="ee-card event-polls" aria-labelledby="event-polls-title"><header class="ee-section-header"><div class="ee-section-title"><span class="ee-icon-tile"><ChartNoAxesColumnIncreasing :size="23" aria-hidden="true" /></span><div><h2 id="event-polls-title">Help shape the event</h2><p>Vote on dates, preferences, and other details to make the event a success.</p></div></div></header><StaffPollsPanel :linked-event-id="eventId" :agency-id="event.agencyId" variant="event" /></section>
        <section v-if="event.potluckEnabled" class="ee-card event-potluck"><header class="ee-section-title"><span class="ee-icon-tile green"><Utensils :size="23" aria-hidden="true" /></span><div><h2>What’s on the table</h2><p>Choose a requested item or tell us what you’d like to bring.</p></div></header><p v-if="event.organizerProviding?.length" class="ee-muted">The organizers are bringing: {{ event.organizerProviding.join(', ') }}.</p><div v-if="needList.length" class="potluck-items"><article v-for="item in needList" :key="item.id" :class="{mine:item.mine}"><span>{{ item.name }}</span><small>{{ item.mine ? 'You’re bringing this' : item.claimed ? 'Already covered' : 'Available' }}</small></article></div><form @submit.prevent="savePotluck"><label>My contribution<select v-model="contributionId"><option value="">I’m not bringing an item</option><option value="__custom">I’ll bring something else</option><option v-for="item in needList.filter(i => !i.claimed || i.mine)" :key="item.id" :value="String(item.id)">{{ item.name }}</option></select></label><label v-if="contributionId === '__custom' || needList.find(i => String(i.id) === contributionId)?.openRequest">What will you bring?<input v-model.trim="contributionName" maxlength="255" required /></label><button class="ee-button ee-button-primary" type="submit" :disabled="busy">Save my contribution</button></form></section>
        <div class="ee-bottom-grid">
          <section class="ee-card event-schedule"><header class="ee-section-title"><span class="ee-icon-tile purple"><CalendarDays :size="23" aria-hidden="true" /></span><div><h2>Schedule</h2><p>A look at when we’ll get together.</p></div></header><ol v-if="schedule.length" class="event-timeline"><li v-for="item in schedule" :key="item.label"><time>{{ item.time }}</time><strong>{{ item.label }}</strong></li></ol><p v-else class="ee-muted event-empty-note">We’re choosing the date together. Check the votes above and come back here for the plan.</p></section>
          <section class="ee-card event-attendees"><header class="ee-section-header"><div class="ee-section-title"><span class="ee-icon-tile green"><Users :size="23" aria-hidden="true" /></span><div><h2>Attendees</h2><p>See who’s going and get familiar with the group.</p></div></div><button v-if="attendees.length" class="event-attendee-toggle ee-pill" type="button" :aria-expanded="showAttendees" @click="showAttendees = !showAttendees">{{ showAttendees ? 'Show less' : `View all ${attendees.length}` }}<ArrowRight :size="14" aria-hidden="true" /></button></header><div v-if="attendees.length" class="event-avatar-row"><span v-for="(person,index) in attendees.slice(0,5)" :key="person.id" class="event-avatar" :class="`tone-${index % 5}`" :title="person.name" :aria-label="person.name">{{ initials(person.name) }}</span><span v-if="attendees.length > 5" class="event-avatar event-avatar-more">+{{ attendees.length - 5 }}</span></div><p v-else class="ee-muted event-empty-note">Attending invitees will appear here as they RSVP.</p><div v-if="showAttendees" class="event-attendee-list"><label>Find an attendee<input v-model.trim="attendeeSearch" type="search" placeholder="Search names…" /></label><ul><li v-for="person in filteredAttendees" :key="person.id"><span class="event-avatar tone-0">{{ initials(person.name) }}</span>{{ person.name }}<Check :size="15" aria-label="Attending" /></li></ul><p v-if="!filteredAttendees.length" class="ee-muted">No attendees match that name.</p></div><p v-if="event.attendance?.maybe" class="event-attendees-maybe">{{ event.attendance.maybe }} {{ event.attendance.maybe === 1 ? 'person is' : 'people are' }} considering it</p></section>
        </div>
          <section class="ee-card event-work-card" v-if="participation && (event.isWorkEvent || participation.clockedIn)" id="event-check-in">
            <h2>Event check-in</h2>
            <p v-if="participation.adminTimeHourlyRate">Your approved outreach work uses Admin Time at ${{ Number(participation.adminTimeHourlyRate).toFixed(2) }}/hour. Submit travel separately.</p>
            <p v-else-if="String(event.eventType || '').startsWith('school_')">Approved event work uses your applicable event rate. Submit travel separately.</p>
            <p v-if="event.outreachTripId">Check in and out at each school stop. Check out while driving between schools; report that travel in Submit.</p>
            <p v-if="participation.clockedIn">You are checked in. Check out when your event work ends.</p>
            <p v-else-if="participation.assigned">You are assigned to this event. {{ participation.isEventDay ? 'Check in when your event work begins.' : 'Check-in opens on the event day.' }}</p>
            <p v-else>The coordinator must assign you before you can check in or submit travel time.</p>
            <template v-if="participation.clockedIn">
              <p v-if="participation.lastPunch?.at">Clocked in: {{ formatDate(participation.lastPunch.at) }}</p>
              <div class="ee-work-actions">
                <button type="button" class="ee-button ee-button-primary" :disabled="busy || !participation.canCheckOut" @click="punch('check-out')">Clock out now</button>
                <button type="button" class="ee-button" :disabled="busy || !participation.canCheckOut" @click="showCheckoutTime = !showCheckoutTime">Choose checkout time</button>
              </div>
              <form v-if="showCheckoutTime" @submit.prevent="submitCheckoutTime">
                <p>Already finished? Enter the actual time your event work ended, in your device timezone: {{ deviceTimezone }}.</p>
                <label>Work ended<input v-model="checkoutTime" type="datetime-local" :min="checkoutMinimum" :max="localInputTime(new Date())" required /></label>
                <label class="attestation"><input v-model="checkoutAttestation" type="checkbox" required /> This is the actual time I finished working at the event.</label>
                <button type="submit" class="ee-button ee-button-primary" :disabled="busy || !participation.canCheckOut || !checkoutTime || !checkoutAttestation">Save checkout time</button>
              </form>
            </template>
            <button v-else-if="participation.assigned" type="button" class="ee-button ee-button-primary" :disabled="busy || !participation.canCheckIn" @click="punch('check-in')">Check in</button>
          </section>

        <section v-if="event.updates?.length" class="ee-card event-updates"><header class="ee-section-title"><span class="ee-icon-tile"><Bell :size="22" aria-hidden="true" /></span><div><h2>Event updates</h2><p>The latest from your organizers.</p></div></header><article v-for="update in event.updates" :key="update.id" class="event-update"><time>{{ formatDate(update.scheduledAt) }}</time><p>{{ update.content }}</p></article></section>
        <p class="ee-footer">Keep this invitation link to see updates, vote and change your response.</p>
      </template>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { House, CalendarDays, Users, MessageSquare, ArrowUpRight, Check, CircleHelp, CircleX, X, Tag, MapPin, Map, UserRound, Clock3, CalendarPlus, CalendarClock, ChevronDown, ChartNoAxesColumnIncreasing, Utensils, ArrowRight, Bell } from '@lucide/vue';
import EventHostIdentity from '../../components/events/EventHostIdentity.vue';
import EventPageHero from '../../components/events/EventPageHero.vue';
import EventInvitationPreview from '../../components/events/EventInvitationPreview.vue';
import CompanyEventRsvpView from './CompanyEventRsvpView.vue';
import CompanyEventPublicView from './CompanyEventPublicView.vue';
import EventConversation from '../../components/events/EventConversation.vue';
import { CONVERSA_EVENT_LOGO_URL } from '../../constants/conversa';
import '../../styles/eventExperience.css';
import { useRoute } from 'vue-router';
import { notifyCompanyEventRsvpChanged } from '../../utils/companyEventRsvpEvents';
import { companyEventInvitationRedirect } from '../../utils/companyEventInvitationHost';
import StaffPollsPanel from '../../components/dashboard/StaffPollsPanel.vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
const route = useRoute();
const authStore = useAuthStore();
const pageOrganization = computed(() => String(route.params.eventOrganization || ''));
const pageSlug = computed(() => String(route.params.eventSlug || ''));
const readablePage = computed(() => !!pageOrganization.value && !!pageSlug.value);
const resolvedEventId = ref(0), signInOrganization = ref('');
const eventId = computed(() => Number(route.params.eventId) || resolvedEventId.value);
const token = computed(() => String(route.params.token || ''));
const signedIn = computed(() => !!authStore.isAuthenticated);
const signInUrl = computed(() => `${readablePage.value ? `/conversa/login/${encodeURIComponent(signInOrganization.value || pageOrganization.value)}` : '/login'}?redirect=${encodeURIComponent(route.fullPath)}`);
const personalInvitation = computed(() => readablePage.value && !signedIn.value ? String(route.query?.invitation || '') : '');
const showGuestRegistration = computed(() => readablePage.value && route.query?.register === '1' && invitationPreview.value?.event?.publicRegistrationEnabled);
const guestRegistrationUrl = computed(() => readablePage.value && invitationPreview.value?.event?.publicRegistrationEnabled ? `${route.path || route.fullPath.split('?')[0]}?register=1` : '');
const event = ref(null);
const invitationPreview = ref(null);
const branding = ref({});
const displayBranding = computed(() => event.value ? branding.value : { ...invitationPreview.value?.branding, agencies: invitationPreview.value?.branding?.agencies || invitationPreview.value?.agencies });
const canManage = ref(false);
const showAttendees = ref(false), attendeeSearch = ref('');
const userName = computed(() => [authStore.user?.first_name || authStore.user?.firstName, authStore.user?.last_name || authStore.user?.lastName].filter(Boolean).join(' ') || 'You');
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase();
const attendees = computed(() => event.value?.attendees || []);
const filteredAttendees = computed(() => attendees.value.filter(person => person.name.toLowerCase().includes(attendeeSearch.value.toLowerCase())));
const responseChoices = [{value:'yes',label:'Attending',icon:Check},{value:'maybe',label:'Maybe',icon:CircleHelp},{value:'no',label:'Unavailable',icon:CircleX}];
const responseHeading = computed(() => ({yes:event.value?.isWorkEvent ? 'Your interest is saved' : 'You’re attending!',maybe:'You’re on the maybe list',no:'You’re marked unavailable'})[response.value]);
const rsvpClosed = computed(() => [event.value?.endsAt,event.value?.rsvpDeadline].some(value => value && new Date(value).getTime() < Date.now()));
const eventTypeLabel = computed(() => String(event.value?.eventType || 'company_event').replaceAll('_',' ').replace(/\b\w/g,letter => letter.toUpperCase()));
const calendarReady = computed(() => [event.value?.startsAt,event.value?.endsAt].every(value => value && Number.isFinite(new Date(value).getTime())));
const googleCalendarUrl = computed(() => {
 if (!calendarReady.value) return '';
 const format = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const query = new URLSearchParams({action:'TEMPLATE',text:event.value.title,dates:format(event.value.startsAt)+'/'+format(event.value.endsAt),details:[event.value.description,window.location.href.split(/[?#]/)[0]].filter(Boolean).join('\n\n'),location:[event.value.eventLocationName,event.value.eventLocationAddress].filter(Boolean).join(', '),ctz:event.value.timezone || 'America/Denver'});
 return 'https://calendar.google.com/calendar/render?'+query;
});
const schedule = computed(() => {
 const rows=[];
 if(event.value?.employeeReportTime)rows.push({time:event.value.employeeReportTime,label:'Staff report time'});
 if(event.value?.startsAt)rows.push({time:formatDate(event.value.startsAt),label:'Event begins'});
 if(event.value?.endsAt)rows.push({time:formatDate(event.value.endsAt),label:'Event ends'});
 return rows;
});
async function downloadCalendar(){try{const {data}=await api.get(`/me/company-events/${eventId.value}/ics`,{responseType:'blob'});const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download=`event-${eventId.value}.ics`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error.value=e?.response?.data?.error?.message || 'Could not download the calendar file.';}}
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
const formatDate = value => value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:event.value?.timezone || 'America/Denver'}).format(new Date(value)) : '';
let pageGeneration = 0;
const pageEndpoint = () => `/company-events/page/${encodeURIComponent(pageOrganization.value)}/${encodeURIComponent(pageSlug.value)}`;
const staffEndpoint = () => readablePage.value ? `${pageEndpoint()}/staff` : `/company-events/staff/${eventId.value}/${encodeURIComponent(token.value)}`;
async function loadParticipation(scope = pageGeneration) {
  const { data } = await api.get(`/me/company-events/${eventId.value}/participation`);
  if(scope !== pageGeneration)return;
  participation.value = data;
  if (data.response) response.value = data.response;
}
async function respond(value) {
  if(busy.value || rsvpClosed.value)return;
  const scope=pageGeneration,id=eventId.value,agencyId=event.value?.agencyId;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.post(`${staffEndpoint()}/respond`, { response: value });
    if(scope !== pageGeneration)return;
    await loadEvent(scope).catch(() => {});
    if(scope !== pageGeneration)return;
    response.value=value;notifyCompanyEventRsvpChanged({eventId:id,agencyId,response:value});notice.value='Thank you! Your RSVP was saved.';
    if(event.value?.isWorkEvent)await loadParticipation(scope);
  } catch(e){if(scope === pageGeneration)error.value=e?.response?.data?.error?.message || 'Could not save your response.';}
  finally{if(scope === pageGeneration)busy.value=false;}
}
async function punch(action, payload = {}) {
  if(busy.value)return;
  const scope=pageGeneration;
  busy.value=true;error.value='';notice.value='';
  try {
    await api.post(`/me/company-events/${eventId.value}/${action}`,payload);
    if(scope !== pageGeneration)return;
    await loadParticipation(scope);
    if(scope !== pageGeneration)return;
    notice.value=action === 'check-in' ? 'Checked in. Your event time is being recorded.' : 'Checked out. Your event time was saved.';
    checkoutTime.value='';checkoutAttestation.value=false;showCheckoutTime.value=false;
  } catch(e){if(scope === pageGeneration)error.value=e?.response?.data?.error?.message || 'Could not record your event time.';}
  finally{if(scope === pageGeneration)busy.value=false;}
}
async function submitCheckoutTime() {
  if (busy.value || !checkoutAttestation.value) return;
  const chosen = new Date(checkoutTime.value);
  if (!Number.isFinite(chosen.getTime()) || chosen > new Date()) { error.value = 'Choose the actual time you finished, no later than now.'; return; }
  if (participation.value?.lastPunch?.at && chosen <= new Date(participation.value.lastPunch.at)) { error.value = 'Checkout time must be after your clock-in time.'; return; }
  await punch('check-out', { checkoutAt: chosen.toISOString() });
}
async function loadEvent(scope = pageGeneration) {
  const {data} = await api.get(staffEndpoint(), {skipAuthRedirect:true});
  if(scope !== pageGeneration)return;
  resolvedEventId.value=Number(data.event?.id) || 0;event.value=data.event;branding.value={...invitationPreview.value?.branding,...data.branding,agencies:invitationPreview.value?.agencies || data.branding?.agencies};canManage.value=!!data.canManage;needList.value=data.needList || [];response.value=data.event?.response || '';
  const mine=needList.value.find(item=>item.mine);contributionId.value=mine?.custom ? '__custom' : String(mine?.id || '');contributionName.value=mine?.custom ? mine.name : '';
}
async function savePotluck() {
  if(busy.value)return;
  const scope=pageGeneration;
  busy.value=true;error.value='';
  try{await api.post(`${staffEndpoint()}/potluck`,{itemId:contributionId.value==='__custom' ? null : contributionId.value || null,customItemName:contributionId.value ? contributionName.value : ''});if(scope !== pageGeneration)return;await loadEvent(scope);if(scope === pageGeneration)notice.value='Your contribution was saved. Thank you!';}
  catch(e){if(scope === pageGeneration)error.value=e?.response?.data?.error?.message || 'Could not save your contribution.';}
  finally{if(scope === pageGeneration)busy.value=false;}
}
async function loadPage() {
  const scope=++pageGeneration;
  event.value=null;invitationPreview.value=null;resolvedEventId.value=0;signInOrganization.value='';participation.value=null;response.value='';needList.value=[];notice.value='';error.value='';busy.value=false;loading.value=true;canManage.value=false;showAttendees.value=false;attendeeSearch.value='';
  showCheckoutTime.value=route.query?.attendance === 'checkout-time';checkoutTime.value='';checkoutAttestation.value=false;
  try {
    try {
      const endpoint=readablePage.value ? pageEndpoint() : `/company-events/invitation/${eventId.value}/${encodeURIComponent(token.value)}`;
      const {data}=await api.get(endpoint,{skipAuthRedirect:true,skipGlobalLoading:true});
      if(scope !== pageGeneration)return;
      const redirect=companyEventInvitationRedirect(data?.canonicalUrl,window.location.href);
      if(redirect){window.location.replace(redirect);return;}
      signInOrganization.value=data?.organizationSlug || pageOrganization.value;
      resolvedEventId.value=Number(data?.event?.id) || 0;
      invitationPreview.value=data;
      if(!signedIn.value)return;
    }catch(previewError){
      if(readablePage.value || !signedIn.value)throw previewError;
      // Program/work links retain their existing authenticated experience.
    }
    await loadEvent(scope);
    if(scope !== pageGeneration)return;
    if(event.value?.isWorkEvent)await loadParticipation(scope);
    await nextTick();
    if(scope === pageGeneration && route.hash === '#event-check-in')document.getElementById('event-check-in')?.scrollIntoView?.();
  } catch(e){if(scope === pageGeneration)error.value=e?.response?.data?.error?.message || 'This event link is unavailable.';}
  finally{if(scope === pageGeneration)loading.value=false;}
}
watch(() => [route.params.eventId,pageOrganization.value,pageSlug.value,token.value,signedIn.value,authStore.user?.id],loadPage,{immediate:true});
onBeforeUnmount(() => {pageGeneration++;});
</script>
<style scoped>
.event-organizer-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.event-rsvp-card>.ee-muted{margin:8px 0 18px}.event-rsvp-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.event-rsvp-options button{display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;border:1px solid #d4dde3;border-radius:9px;background:linear-gradient(#fafcfc,#f2f5f6);color:#1d2d42;font:inherit;font-size:13px;font-weight:650;cursor:pointer}.event-rsvp-options button.selected{background:linear-gradient(135deg,#1b5749,#14483e);color:#fff;border-color:#164b40;box-shadow:0 2px 6px #164b4010}.event-rsvp-options button:disabled{opacity:.55;cursor:default}.event-rsvp-receipt{display:flex;align-items:center;gap:12px;padding:17px;border-radius:11px;background:linear-gradient(110deg,#edf7f0,#e7f2ed);margin-top:20px;color:#1c4d40}.event-response-check{display:grid;place-items:center;background:#23883b;border-radius:50%;color:white;width:26px;height:26px;flex-shrink:0}.event-rsvp-receipt strong{font-size:13px;display:block}.event-rsvp-receipt p{font-size:11px;margin:3px 0 0;color:#3c5b54}.event-rsvp-receipt .ee-pill{margin-left:auto;background:#f6fcf9;border:1px solid #d9ebe2;font-size:10px}.response-no{background:#f1f4f8;color:#34465d}.response-no .event-response-check{background:#7c8a9d}.response-maybe{background:#fff8e9;color:#755824}.response-maybe .event-response-check{background:#a9802d}.event-response-hint{font-size:11px;color:#64748b;margin:18px 0 0}.event-save-notice{font-size:12px;color:#21624a;margin:12px 0 0}.event-facts-card h2{font-size:18px}.event-facts-card dl{margin:14px 0 18px}.event-facts-card dl>div{display:grid;grid-template-columns:minmax(110px, .9fr) minmax(0,1.2fr);gap:12px;padding:7px 0;border-bottom:1px solid #f0f3f7;font-size:11px}.event-facts-card dt{display:flex;align-items:center;gap:12px;font-weight:650}.event-facts-card dd{margin:0;color:#41516a;overflow-wrap:anywhere}.event-calendar-menu{position:relative}.event-calendar-menu summary{display:flex;gap:12px;align-items:center;justify-content:center;padding:9px 14px;border:1px solid #d6dfe3;border-radius:9px;background:#f5f8f8;color:#174f43;font-size:12px;font-weight:650;cursor:pointer;list-style:none}.event-calendar-menu summary::-webkit-details-marker{display:none}.event-calendar-menu summary svg:last-child{margin-left:auto}.event-calendar-menu summary svg:first-child{margin-left:auto}.event-calendar-menu>div{display:grid;gap:4px;padding-top:8px}.event-calendar-menu a,.event-calendar-menu button{display:flex;justify-content:space-between;align-items:center;font:inherit;font-size:12px;border:1px solid #e2e8ed;border-radius:7px;background:white;text-decoration:none;padding:10px;color:#244b43;cursor:pointer;text-align:left}.event-calendar-pending{display:flex;gap:8px;align-items:center;margin:0;font-size:11px;color:#5d6d7f}.event-polls :deep(.staff-polls){margin-top:20px}.event-timeline{list-style:none;padding:0 0 0 10px;margin:23px 0 0}.event-timeline li{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.7fr);gap:20px;border-left:2px solid #dddff4;padding:0 0 19px 22px;font-size:11px}.event-timeline li:last-child{padding-bottom:0}.event-timeline li:before{content:'';width:7px;height:7px;position:absolute;border-radius:50%;background:#9499ee;box-shadow:0 0 0 3px #ececfc;left:-4.5px;top:4px}.event-timeline time{color:#53637c}.event-timeline strong{font-weight:600}.event-empty-note{margin:24px 0 4px;line-height:1.8}.event-attendee-toggle{border:0;font:inherit;font-size:10px;cursor:pointer;background:#eaf4fe;flex-shrink:0}.event-avatar-row{display:flex;gap:18px;margin:25px 0 4px;flex-wrap:wrap}.event-avatar{width:48px;height:48px;display:inline-grid;place-items:center;border-radius:50%;font-size:13px;font-weight:650;flex-shrink:0}.tone-0{background:#e1f6e8;color:#287841}.tone-1{background:#efe7ff;color:#673c9d}.tone-2{background:#e0f1ff;color:#21679d}.tone-3{background:#ffeadf;color:#9f4a29}.tone-4{background:#edf6db;color:#597b23}.event-avatar-more{background:#edf0f5;color:#394967}.event-attendees-maybe{font-size:11px;color:#64748b;margin:17px 0 0}.event-attendee-list{padding-top:20px}.event-attendee-list label{font-size:11px;font-weight:600}.event-attendee-list ul{list-style:none;margin:12px 0 0;padding:0;max-height:300px;overflow:auto}.event-attendee-list li{display:flex;gap:12px;align-items:center;padding:8px 0;font-size:12px;border-top:1px solid #edf1f6}.event-attendee-list li .event-avatar{width:30px;height:30px;font-size:10px}.event-attendee-list li svg{margin-left:auto;color:#237e49}.potluck-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:20px 0}.potluck-items article{border:1px solid #e0e8e4;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px;font-size:13px}.potluck-items small{color:#6a7c72;font-size:11px}.potluck-items .mine{background:#f0f8f2;border-color:#92baa0}.event-potluck form{display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-top:18px}.event-potluck form label{min-width:180px;flex:1;font-size:12px;color:#41546a}.event-potluck form .ee-button{margin-bottom:0;min-height:42px}.event-experience input:not([type=checkbox]),.event-experience select{display:block;box-sizing:border-box;width:100%;padding:11px;border:1px solid #d2dce5;border-radius:8px;margin:7px 0 0;font:inherit;background:white;color:#26394e}.event-work-card h2{margin-bottom:14px}.event-work-card p{font-size:13px;color:#53627a}.ee-work-actions{display:flex;gap:10px;flex-wrap:wrap}.event-work-card form{margin-top:20px;max-width:550px}.event-work-card label{font-size:12px}.event-work-card .attestation{display:flex;gap:8px;align-items:flex-start;margin:15px 0}.event-work-card .attestation input{margin-top:3px}.event-update{border-left:2px solid #a9c3b6;padding:5px 18px;margin-top:22px}.event-update time{font-size:11px;color:#687990}.event-update p{font-size:13px;white-space:pre-wrap;margin:5px 0;overflow-wrap:anywhere}@media(max-width:1100px){.event-rsvp-receipt{flex-wrap:wrap}.event-rsvp-receipt .ee-pill{margin-left:38px}.event-avatar-row{gap:12px}.event-avatar{width:42px;height:42px}.event-attendees .ee-section-header{flex-wrap:wrap}}@media(max-width:600px){.event-rsvp-options{gap:7px}.event-rsvp-options button{flex-direction:column;gap:5px;font-size:11px;padding:12px 6px;min-height:72px}.event-facts-card dl>div{font-size:12px;padding:9px 0}.event-rsvp-receipt{padding:15px}.event-rsvp-receipt>div{flex:1;min-width:calc(100% - 40px)}.event-rsvp-receipt .ee-pill{margin-left:38px}.event-potluck form{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.event-potluck form label{min-width:0}.event-potluck form .ee-button{width:100%}.event-timeline li{grid-template-columns:minmax(0,1fr);gap:4px}.event-attendees .ee-section-title p{max-width:220px}}
</style>
