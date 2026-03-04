<template>
  <div class="join-supervision-view">
    <div v-if="resolving" class="join-placeholder">Resolving session…</div>
    <div v-else-if="error" class="join-error">{{ error }}</div>
    <div v-else-if="token && roomName" class="join-video">
      <SupervisionTwilioVideoRoom
        :token="token"
        :room-name="roomName"
        :session-id="sessionId"
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

const sessionId = computed(() => route.params.sessionId);
const organizationSlug = computed(() => route.params.organizationSlug);

const resolving = ref(false);
const error = ref('');
const token = ref('');
const roomName = ref('');

async function resolveAndRedirect() {
  const sid = sessionId.value;
  if (!sid) {
    error.value = 'Invalid session';
    return;
  }
  resolving.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/supervision/join-info/${sid}`, { skipAuthRedirect: true });
    const data = resp?.data || {};
    const slug = data.orgSlug;
    if (slug) {
      router.replace(`/${slug}/join/supervision/${sid}`);
      return;
    }
    error.value = 'Session not found';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Session not found';
  } finally {
    resolving.value = false;
  }
}

async function fetchTokenAndJoin() {
  const sid = sessionId.value;
  if (!sid) {
    error.value = 'Invalid session';
    return;
  }
  error.value = '';
  try {
    const resp = await api.get(`/supervision/sessions/${sid}/video-token`);
    const data = resp?.data || {};
    const tok = (data.token || data.data?.token || data.result?.token || '').trim();
    const rn = data.roomName || data.room_name || data.data?.roomName || `supervision-${sid}`;
    if (!tok) {
      console.warn('[JoinSupervisionView] video-token empty:', { status: resp?.status, data });
      const errMsg = data?.error?.message || data?.error || '';
      error.value = errMsg || 'Video token was empty. Check Network tab: GET /api/supervision/sessions/' + sid + '/video-token.';
      return;
    }
    token.value = tok;
    roomName.value = rn;
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
.join-supervision-view {
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
