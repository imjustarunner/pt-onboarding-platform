<template>
  <main class="invitation-page">
    <h1>Your meeting invitation</h1>
    <section v-if="(route.query.rsvp || route.name === 'InterviewRsvp') && !rsvpSaved"><p>Please confirm your response for this meeting.</p><button class="btn btn-primary" :disabled="saving" @click="respond('accepted')">I’m attending</button> <button class="btn btn-secondary" :disabled="saving" @click="respond('declined')">Decline</button></section>
    <p v-if="rsvpSaved" role="status">Your response has been saved: {{ rsvpSaved === 'accepted' ? 'Attending' : 'Declined' }}.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-else-if="meeting">
      <h2>{{ meeting.title }}</h2>
      <p>{{ meeting.when }}</p>
      <p v-if="meeting.location">{{ meeting.location }}</p>
      <template v-if="route.query.details">
        <ul><li v-for="person in meeting.participants" :key="person.name">{{ person.name }} · {{ person.status === 'SIGNED_UP' ? 'Confirmed' : person.status === 'DECLINED' ? 'Not attending' : person.status || 'Host' }}{{ person.isPresenter ? ' · Presenter' : '' }}{{ person.isRequired ? ' · Required' : '' }}</li></ul>
        <RouterLink :to="route.path">Open session</RouterLink>
      </template>
      <p v-else>This meeting has no online video link. See My Schedule for the meeting details.</p>
    </section>
    <p v-else-if="!(route.query.rsvp || route.name === 'InterviewRsvp')">Opening your meeting…</p>
    <RouterLink v-if="error" to="/">Return to your schedule</RouterLink>
  </main>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
const route = useRoute(), router = useRouter(), error = ref('');
const meeting = ref(null), rsvpSaved=ref(''),saving=ref(false);
async function respond(response){saving.value=true;error.value='';try{await api.post(`/meeting-invitations/${route.name === 'InterviewRsvp' ? 'interview/' : ''}${encodeURIComponent(route.params.token)}/rsvp`,{eventId:Number(route.query.eventId),response});rsvpSaved.value=response;}catch(e){error.value=e.response?.data?.error?.message||'Could not save your response.';}finally{saving.value=false;}}
onMounted(async () => {
  if((route.query.rsvp || route.name === 'InterviewRsvp'))return;
  try {
    const { data } = await api.get(`/meeting-invitations/${encodeURIComponent(route.params.token)}`, {params: route.query.details ? {details:1,eventId:route.query.eventId} : {}});
    if (!data.joinUrl && data.meeting) { meeting.value = data.meeting; return; }
    const url = new URL(data.joinUrl);
    if (url.origin === window.location.origin) await router.replace(url.pathname + url.search);
    else window.location.replace(url.href);
  } catch (e) { error.value = e.response?.data?.error?.message || 'Unable to open your invitation. Please sign in with the account that received it.'; }
});
</script>
<style scoped>
.invitation-page { max-width: 640px; margin: 4rem auto; padding: 2rem; }
</style>
