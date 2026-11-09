<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { CONVERSA_LOGO_URL } from '../constants/conversa';
const route = useRoute();
const event = ref(null), loading = ref(false), error = ref('');
let generation = 0;
async function load() {
  const id = ++generation; event.value = null; loading.value = true; error.value = '';
  try { const { data } = await api.get(`/me/company-events/${route.params.eventId}`, { params: { agencyId: Number(route.query.agencyId) || undefined } }); if (id === generation) event.value = data; }
  catch (e) { if (id === generation) error.value = e.response?.data?.error?.message || 'Event details are not available for your account.'; }
  finally { if (id === generation) loading.value = false; }
}
function date(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'To be confirmed';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short', timeZone: event.value?.timezone || undefined }).format(new Date(value)); }
  catch { return new Date(value).toLocaleString(); }
}
watch(() => [route.params.eventId, route.query.agencyId], load, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
<template>
  <main class="staff-event-page">
    <img :src="CONVERSA_LOGO_URL" width="154" height="40" alt="Conversa" />
    <p class="event-eyebrow">Internal event</p>
    <p v-if="loading" role="status">Loading event details…</p>
    <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="load">Try again</button></div>
    <article v-else-if="event"><h1>{{ event.title }}</h1><dl><div><dt>Starts</dt><dd>{{ date(event.startsAt) }}</dd></div><div><dt>Ends</dt><dd>{{ date(event.endsAt) }}</dd></div><div v-if="event.locationName || event.locationAddress"><dt>Location</dt><dd>{{ event.locationName }}<span v-if="event.locationAddress">{{ event.locationAddress }}</span></dd></div></dl><p class="event-description">{{ event.description || 'More event details will be added here by the organizer.' }}</p></article>
  </main>
</template>
<style scoped>
.staff-event-page{max-width:760px;margin:32px auto;padding:28px;color:#152c50;background:#fff;border:1px solid #dce5f2;border-radius:18px;line-height:1.6}.event-eyebrow{text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:.1em;color:#53647c;margin:24px 0 8px}.staff-event-page h1{color:#152c50;font-size:28px;line-height:1.25;margin:0 0 24px}.staff-event-page dl{background:#f2f6fd;padding:18px;border-radius:12px;display:grid;gap:14px}.staff-event-page dt{font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:.06em;color:#53647c}.staff-event-page dd{margin:3px 0 0;font-size:14px}.staff-event-page dd span{display:block}.event-description{white-space:pre-wrap;overflow-wrap:anywhere}.staff-event-page button{padding:9px 16px;border:1px solid #245ccb;color:#245ccb;background:#fff;border-radius:8px;cursor:pointer;font:inherit}.staff-event-page button:focus-visible{outline:3px solid #83b5ff;outline-offset:3px}@media(max-width:600px){.staff-event-page{margin:16px;padding:20px}.staff-event-page h1{font-size:23px}}
</style>
