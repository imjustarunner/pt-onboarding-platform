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
    <div v-if="isHost && eventId && (token || error)" class="join-activity-section">
      <button
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="activityLoading"
        @click="toggleActivity"
      >
        {{ activityExpanded ? 'Hide' : 'View' }} meeting chat & Q&A
      </button>
      <div v-if="activityExpanded" class="join-activity-content">
        <div v-if="activityLoading" class="muted">Loading…</div>
        <div v-else-if="activityError" class="error-inline">{{ activityError }}</div>
        <div v-else-if="!activityList?.length" class="muted">No chat, polls, or Q&A recorded for this meeting.</div>
        <div v-else class="activity-list">
          <div
            v-for="a in activityList"
            :key="a.id"
            class="activity-item"
            :class="`activity-${a.activityType}`"
          >
            <span class="activity-sender">{{ a.participantIdentity?.replace(/^user-/, 'User ') }}</span>
            <span v-if="a.activityType === 'chat'" class="activity-text">{{ a.payload?.text }}</span>
            <span v-else-if="a.activityType === 'poll'" class="activity-text">Poll: {{ a.payload?.question }} — {{ (a.payload?.options || []).join(', ') }}</span>
            <span v-else-if="a.activityType === 'poll_vote'" class="activity-text">Voted on poll</span>
            <span v-else-if="a.activityType === 'question'" class="activity-text">Q: {{ a.payload?.text }}</span>
            <span v-else-if="a.activityType === 'answer'" class="activity-text">A: {{ a.payload?.text }}</span>
            <span class="activity-time">{{ formatActivityTime(a.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
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
const activityExpanded = ref(false);
const activityLoading = ref(false);
const activityError = ref('');
const activityList = ref([]);

function formatActivityTime(createdAt) {
  if (!createdAt) return '';
  try {
    const d = new Date(createdAt);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function toggleActivity() {
  const eid = eventId.value;
  if (!eid) return;
  const expanded = !activityExpanded.value;
  activityExpanded.value = expanded;
  if (!expanded) return;
  if (activityList.value?.length) return;
  activityLoading.value = true;
  activityError.value = '';
  try {
    const resp = await api.get(`/team-meetings/${eid}/activity`);
    activityList.value = resp?.data?.activity || [];
  } catch (err) {
    activityError.value = err?.response?.data?.error?.message || 'Failed to load chat & Q&A.';
    activityList.value = [];
  } finally {
    activityLoading.value = false;
  }
}

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
.join-activity-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.join-activity-content {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}
.join-activity-content .activity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.join-activity-content .activity-item {
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-secondary, #1a1a1a);
  font-size: 13px;
}
.join-activity-content .activity-sender {
  font-weight: 600;
  margin-right: 6px;
}
.join-activity-content .activity-time {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}
</style>
