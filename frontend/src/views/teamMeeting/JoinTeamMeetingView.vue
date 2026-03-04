<template>
  <div class="join-team-meeting-view">
    <div v-if="resolving" class="join-placeholder">Resolving meeting…</div>
    <div v-else-if="error" class="join-error">{{ error }}</div>
    <div v-else-if="token && roomName" class="join-video">
      <SupervisionTwilioVideoRoom
        :token="token"
        :room-name="roomName"
        :event-id="eventId"
        :is-host="isHost"
        @disconnected="onDisconnected"
      />
    </div>
    <div v-else class="join-placeholder">Loading…</div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import SupervisionTwilioVideoRoom from '../../components/supervision/SupervisionTwilioVideoRoom.vue';
import api from '../../services/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const eventId = computed(() => route.params.eventId);
const organizationSlug = computed(() => route.params.organizationSlug);

const resolving = ref(false);
const error = ref('');
const token = ref('');
const roomName = ref('');
const isHost = ref(false);

async function resolveAndRedirect() {
  const eid = eventId.value;
  if (!eid) {
    error.value = 'Invalid event';
    return;
  }
  resolving.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/team-meetings/join-info/${eid}`, { skipAuthRedirect: true });
    const data = resp?.data || {};
    const slug = data.orgSlug;
    if (slug) {
      router.replace(`/${slug}/join/team-meeting/${eid}`);
      return;
    }
    error.value = 'Meeting not found';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Meeting not found';
  } finally {
    resolving.value = false;
  }
}

async function fetchTokenAndJoin() {
  const eid = eventId.value;
  if (!eid) {
    error.value = 'Invalid event';
    return;
  }
  error.value = '';
  try {
    const resp = await api.get(`/team-meetings/${eid}/video-token`);
    const data = resp?.data || {};
    token.value = data.token || '';
    roomName.value = data.roomName || `team-meeting-${eid}`;
    isHost.value = !!data.isHost;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
  }
}

function onDisconnected() {
  const slug = organizationSlug.value;
  if (slug) {
    router.push(`/${slug}/dashboard`);
  } else {
    router.push('/dashboard');
  }
}

onMounted(async () => {
  if (!organizationSlug.value) {
    await resolveAndRedirect();
    return;
  }
  if (!authStore.isAuthenticated) {
    const slug = organizationSlug.value;
    router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
    return;
  }
  await fetchTokenAndJoin();
});
</script>

<style scoped>
.join-team-meeting-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: var(--bg-primary, #0f0f0f);
}
.join-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
.join-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b91c1c;
  padding: 24px;
}
.join-video {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
