<template>
  <main class="invitation-page">
    <h1>Your meeting invitation</h1>
    <p v-if="meeting?.recipientName">Personal invitation for {{ meeting.recipientName }}. This link opens only your invited meeting; it does not sign you into the app.</p>
    <section v-if="meeting?.attendance" aria-label="Your attendance requirement">
      <h2>{{ meeting.attendance.label }}</h2>
      <p>{{ meeting.attendance.description }}</p>
      <p>RSVP confirms your plans; it does not record attendance time.</p>
    </section>
    <section v-if="(route.query.rsvp || route.name === 'InterviewRsvp') && !rsvpSaved && !signInRequired && (meeting || route.name === 'InterviewRsvp')"><p>Please confirm your response for this meeting.</p><button class="btn btn-primary" :disabled="saving" @click="respond('accepted')">I’m attending</button> <button v-if="meeting?.attendance?.tier !== 'optional'" class="btn btn-secondary" :disabled="saving" @click="declining = true">Decline</button> <button v-else class="btn btn-secondary" :disabled="saving" @click="respond('declined')">Not interested · Stop reminders</button>
      <div v-if="declining">
        <fieldset v-if="meeting?.canSkipRecurring" class="absence-options">
          <legend>Which dates can’t you attend?</legend>
          <label><input v-model="absenceScope" type="radio" value="occurrence" /> This date only</label>
          <label><input v-model="absenceScope" type="radio" value="until_date" /> This recurring day through a specific date</label>
          <label v-if="absenceScope === 'until_date'">Last date you cannot attend <input v-model="absenceUntil" type="date" :min="meeting.sessionDate" required /></label>
          <p>You cannot cancel recurring supervision forever. Choose a known end date; your invitations resume after that date. This records your absence and does not cancel the meeting for others.</p>
        </fieldset>
        <label for="decline-reason">Reason for not attending<span v-if="meeting?.attendance?.tier === 'mandatory'"> (required)</span></label><textarea id="decline-reason" v-model="declineReason" maxlength="2000" rows="3" /><button class="btn btn-primary" :disabled="saving || (meeting?.attendance?.tier === 'mandatory' && !declineReason.trim()) || (absenceScope === 'until_date' && (!absenceUntil || absenceUntil < meeting.sessionDate))" @click="respond('declined')">Confirm decline</button></div>
    </section>
    <p v-if="rsvpSaved" role="status">Your response has been saved: {{ rsvpSaved === 'accepted' ? 'Attending' : absenceScope === 'until_date' ? `Not attending this recurring day through ${absenceUntil}; invitations resume afterward` : meeting?.isTraining ? 'Not attending the remaining training dates' : 'Not attending this date' }}.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RouterLink v-if="signInRequired" :to="{path:'/login',query:{redirect:route.fullPath}}">Sign in to open this invitation</RouterLink>
    <section v-else-if="meeting">
      <h2>{{ meeting.title }}</h2>
      <p>{{ meeting.when }}</p>
      <p v-if="meeting.declineReason">Your decline reason: {{meeting.declineReason}}</p>
      <p v-if="meeting.location">{{ meeting.location }}</p>
      <template v-if="route.query.details">
        <h3>Agenda</h3>
        <ol v-if="meeting.agenda?.length"><li v-for="(item, index) in meeting.agenda" :key="index">{{ item.title }}</li></ol>
        <p v-else>No agenda items have been added yet.</p>
        <h3>RSVP responses</h3>
        <p v-if="!meeting.canSeeDeclined">Confirmed attendees and pending invitations. Declined responses are visible only to event organizers and authorized staff.</p>
        <ul><li v-for="person in meeting.participants" :key="person.name">{{ person.name }} · {{ ['SIGNED_UP','accepted'].includes(person.status) ? 'Confirmed' : ['DECLINED','declined'].includes(person.status) ? 'Not attending' : person.status || 'Host' }}{{ person.isPresenter ? ' · Presenter' : '' }}{{ person.isRequired ? ' · Required' : '' }}<p v-if="person.declineReason">Reason: {{ person.declineReason }}</p></li></ul>
        <RouterLink :to="{path:route.path,query:{rsvp:'1',eventId:route.query.eventId}}">RSVP</RouterLink>
        <RouterLink :to="route.path">Open session</RouterLink>
      </template>
      <RouterLink v-else-if="route.query.rsvp" :to="route.path">{{ rsvpSaved === 'accepted' ? 'Join session' : 'Open session' }}</RouterLink>
      <p v-else>This meeting has no online video link. See My Schedule for the meeting details.</p>
    </section>
    <p v-else-if="!error && !(route.query.rsvp || route.name === 'InterviewRsvp')">Opening your meeting…</p>
    <RouterLink v-if="error" to="/">Return to your schedule</RouterLink>
  </main>
</template>
<script setup>
import { watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { saveTeamMeetingAccess } from '../../utils/teamMeetingInvitationAccess';
import { saveSupervisionAccess } from '../../utils/supervisionInvitationAccess';
const route = useRoute(), router = useRouter(), error = ref('');
const meeting = ref(null), rsvpSaved=ref(''),saving=ref(false);
const absenceScope=ref('occurrence'), absenceUntil=ref('');
const signInRequired = ref(false), declining=ref(false), declineReason=ref('');
async function respond(response){saving.value=true;error.value='';try{await api.post(`/meeting-invitations/${route.name === 'InterviewRsvp' ? 'interview/' : ''}${encodeURIComponent(route.params.token)}/rsvp`,{eventId:Number(route.query.eventId),response,reason:declineReason.value,...(response==='declined'&&absenceScope.value==='until_date'?{scope:'until_date',untilDate:absenceUntil.value}:{})},{skipAuthRedirect:true});rsvpSaved.value=response;}catch(e){error.value=e.response?.data?.error?.message||'Could not save your response.';}finally{saving.value=false;}}
watch(() => [route.params.token, route.query.details, route.query.rsvp, route.query.eventId], async (_, __, onCleanup) => {
  let stale = false;
  onCleanup(() => { stale = true; });
  meeting.value=null;error.value='';signInRequired.value=false;rsvpSaved.value='';declining.value=false;declineReason.value='';absenceScope.value='occurrence';absenceUntil.value='';
  if(route.name === 'InterviewRsvp')return;
  try {
    const { data } = await api.get(`/meeting-invitations/${encodeURIComponent(route.params.token)}`, {skipAuthRedirect:true,params: route.query.details || route.query.rsvp ? {details:1,eventId:route.query.eventId} : {}});
    if(stale)return;
    if (!data.joinUrl && data.meeting) {
      meeting.value = data.meeting;
      declining.value = route.query.rsvp === 'absence' && data.meeting.attendance?.tier === 'mandatory';
      return;
    }
    const url = new URL(data.rsvpUrl || data.joinUrl);
    if (data.supervisionAccess || data.teamMeetingAccess) {
      if (url.origin !== window.location.origin) {
        // Exchange on the destination origin; never put the session grant in a URL.
        window.location.replace(`${url.origin}/join/invitation/${encodeURIComponent(route.params.token)}`);
        return;
      }
      if(data.supervisionAccess) saveSupervisionAccess(data.supervisionAccess);
      if(data.teamMeetingAccess) saveTeamMeetingAccess(data.teamMeetingAccess);
    }
    if (url.origin === window.location.origin) await router.replace(url.pathname + url.search);
    else window.location.replace(url.href);
  } catch (e) { if(stale)return;signInRequired.value=Number(e.response?.status)===401; error.value = e.response?.data?.error?.message || e.message || 'Unable to open your invitation.'; }
}, {immediate:true});
</script>
<style scoped>
.invitation-page { max-width: 640px; margin: 4rem auto; padding: 2rem; }
.absence-options { margin: 1rem 0; padding: 1rem; border: 1px solid #cbd5e1; border-radius: 12px; }
.absence-options label { display: block; margin: .7rem 0; }
textarea { display: block; width: 100%; margin: .5rem 0; }
.invitation-page a { display: inline-block; margin: .5rem 1rem .5rem 0; }
@media (max-width: 640px) { .invitation-page { margin: 1rem auto; padding: 1rem; } }
</style>
