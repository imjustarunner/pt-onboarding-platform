<template>
  <div class="join-team-meeting-view">
    <div v-if="resolving" class="join-placeholder">Resolving meeting…</div>
    <div v-else-if="error && !token" class="join-error">{{ error }}</div>
    <template v-else-if="token && roomName">
      <div class="join-session-layout">
        <div class="join-video">
          <SupervisionVideoRoom
            :token="token"
            :room-name="roomName"
            :event-id="resolvedEventId || eventId"
            :is-host="isHost"
            @disconnected="onDisconnected"
          />
        </div>
        <aside v-if="resolvedEventId" class="join-agenda-aside">
          <MeetingAgendaPanel
            meeting-type="provider_schedule_event"
            :meeting-id="resolvedEventId"
            :can-add-item="true"
            :embedded="true"
            :live="true"
          />
        </aside>
      </div>
    </template>
    <div v-else class="join-placeholder">Loading…</div>

    <div v-if="isHost && resolvedEventId && (token || error)" class="join-activity-section">
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
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import SupervisionVideoRoom from '../../components/supervision/SupervisionVideoRoom.vue';
import MeetingAgendaPanel from '../../components/meetings/MeetingAgendaPanel.vue';
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
const resolvedEventId = ref(0);
const activityExpanded = ref(false);
const activityLoading = ref(false);
const activityError = ref('');
const activityList = ref([]);
const joinAttemptedForPath = ref('');

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
  const eid = resolvedEventId.value || eventId.value;
  if (!eid) return;
  const expanded = !activityExpanded.value;
  activityExpanded.value = expanded;
  if (!expanded) return;
  if (activityList.value?.length) return;
  activityLoading.value = true;
  activityError.value = '';
  try {
    const resp = await api.get(`/team-meetings/${encodeURIComponent(eid)}/activity`);
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
    const resp = await api.get(`/team-meetings/join-info/${encodeURIComponent(eid)}`, { skipAuthRedirect: true });
    const data = resp?.data || {};
    const slug = data.orgSlug;
    if (slug) {
      const joinKey = String(data.joinToken || eid).trim();
      if (Number(data.eventId || 0) > 0) resolvedEventId.value = Number(data.eventId);
      router.replace(`/${slug}/join/team-meeting/${encodeURIComponent(joinKey)}`);
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
    const resp = await api.get(`/team-meetings/${encodeURIComponent(eid)}/video-token`);
    const data = resp?.data || {};
    const tok = String(data.token || data.data?.token || data.result?.token || '').trim();
    const rn = data.roomName || data.room_name || data.data?.roomName || `team-meeting-${eid}`;
    if (!tok) {
      const errMsg = data?.error?.message || data?.error || '';
      error.value = errMsg || `Video token was empty. Check Network tab: GET /api/team-meetings/${eid}/video-token.`;
      return;
    }
    token.value = tok;
    roomName.value = rn;
    isHost.value = !!(data.isHost ?? data.is_host);
    if (Number(data.eventId || 0) > 0) resolvedEventId.value = Number(data.eventId);
    else if (/^\d+$/.test(String(eid))) resolvedEventId.value = Number(eid);
  } catch (e) {
    if (Number(e?.response?.status || 0) === 401) {
      const slug = organizationSlug.value;
      if (slug) {
        router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
        return;
      }
    }
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
  }
}

async function ensureAuthenticatedSession() {
  if (authStore.isAuthenticated) return true;
  try {
    const resp = await api.get('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true });
    const u = resp?.data || null;
    if (u && (u.id || u.email)) {
      authStore.setAuth(null, u, localStorage.getItem('sessionId') || null);
      return true;
    }
  } catch {
    // ignore and route to login below
  }
  const slug = organizationSlug.value;
  if (slug) {
    router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
  } else {
    router.replace('/login');
  }
  return false;
}

function onDisconnected() {
  const slug = organizationSlug.value;
  if (slug) {
    router.push(`/${slug}/dashboard`);
  } else {
    router.push('/dashboard');
  }
}

async function runJoinFlowForCurrentRoute() {
  const pathKey = String(route.fullPath || '');
  if (joinAttemptedForPath.value === pathKey) return;
  joinAttemptedForPath.value = pathKey;

  if (!organizationSlug.value) {
    await resolveAndRedirect();
    return;
  }
  const ok = await ensureAuthenticatedSession();
  if (!ok) return;
  await fetchTokenAndJoin();
}

watch(
  () => [route.fullPath, organizationSlug.value, eventId.value],
  () => {
    void runJoinFlowForCurrentRoute();
  },
  { immediate: true }
);

onMounted(async () => {
  await runJoinFlowForCurrentRoute();
});
</script>

<style scoped>
.join-team-meeting-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--bg-primary, #0f0f0f);
  gap: 12px;
}
.join-session-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 12px;
  min-height: 0;
}
.join-video {
  min-width: 0;
  min-height: 60vh;
}
.join-agenda-aside {
  min-width: 0;
  max-height: calc(100vh - 48px);
  overflow: auto;
  border-radius: 12px;
  background: #fff;
}
.join-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
}
.join-error {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 10px;
  padding: 12px 14px;
}
.join-activity-section {
  border-top: 1px solid rgba(148, 163, 184, 0.25);
  padding-top: 10px;
}
.join-activity-content {
  margin-top: 10px;
  max-height: 220px;
  overflow: auto;
}
.activity-list { display: flex; flex-direction: column; gap: 6px; }
.activity-item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85rem;
  color: #e2e8f0;
}
.activity-sender { font-weight: 700; color: #93c5fd; }
.activity-time { color: #94a3b8; margin-left: auto; }
.muted { color: #94a3b8; }
.error-inline { color: #fecaca; }
@media (max-width: 900px) {
  .join-session-layout {
    grid-template-columns: 1fr;
  }
  .join-agenda-aside {
    max-height: 40vh;
  }
}
</style>
