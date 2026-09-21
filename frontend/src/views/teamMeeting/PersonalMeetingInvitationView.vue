<template>
  <main class="invitation-page">
    <h1>Your meeting invitation</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-else-if="meeting">
      <h2>{{ meeting.title }}</h2>
      <p>{{ meeting.when }}</p>
      <p v-if="meeting.location">{{ meeting.location }}</p>
      <p>This meeting has no online video link. See My Schedule for the meeting details.</p>
    </section>
    <p v-else>Opening your meeting…</p>
    <RouterLink v-if="error" to="/">Return to your schedule</RouterLink>
  </main>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
const route = useRoute(), router = useRouter(), error = ref('');
const meeting = ref(null);
onMounted(async () => {
  try {
    const { data } = await api.get(`/meeting-invitations/${encodeURIComponent(route.params.token)}`);
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
