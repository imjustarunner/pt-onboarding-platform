<template>
  <main class="applicant-interview">
    <header><h1>Interview</h1><p v-if="credentials">{{ credentials.displayName }} · Applicant</p></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ended"><p>{{ ended }}</p><button v-if="canRejoin" @click="join">Rejoin interview</button></template>
    <p v-else-if="joining" role="status">Connecting to your interview…</p>
    <template v-else-if="credentials">
      <p v-if="inLobby" role="status">You’re in the waiting room. Your interviewer will let you in.</p>
      <div class="video-stage">
        <SupervisionVideoRoom :token="credentials.token" :vonage-session-id="credentials.sessionId"
          :application-id="credentials.applicationId" :local-display-name="credentials.displayName"
          local-role-label="Applicant" :lobby-mode="inLobby" :start-muted="false"
          :is-host="false" :is-host-or-cohost="false" :can-grant-screen-share="false"
          :can-share-screen="false" :equal-tiles-when-remote="true" :preserve-video-aspect="false"
          :show-layout-controls="false" :allow-tile-focus="false" tile-focus="equal" layout="standard"
          @leave-request="leave()" @disconnected="disconnected" @meeting-ended="finish"
          @interview-guest-ended="finish" />
      </div>
      <InterviewSharedChat v-if="!inLobby" :endpoint="`${base}/chat`" />
    </template>
    <button v-else-if="!joining" @click="join">Try joining again</button>
  </main>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import api from '../../services/api';
import SupervisionVideoRoom from '../../components/supervision/SupervisionVideoRoom.vue';
import InterviewSharedChat from '../../components/hiring/InterviewSharedChat.vue';
import { suspendInactivityTimeout, resumeInactivityTimeout } from '../../utils/activityTracker';
const props = defineProps({ invitationToken: { type: String, required: true } });
const base = computed(() => `/team-meetings/interview-applicant/${encodeURIComponent(props.invitationToken)}`);
const credentials = ref(null), error = ref(''), joining = ref(false), ended = ref(''), canRejoin = ref(true);
const inLobby = computed(() => credentials.value?.roomMode === 'lobby');
const options = { skipAuthRedirect: true, skipGlobalLoading: true, timeout: 20000 };
let pollTimer, presenceTimer, stopped = false, polling = false, generation = 0, suspended = false;
function clearTimers() { clearInterval(pollTimer); clearInterval(presenceTimer); }
function resume() { if (suspended) { resumeInactivityTimeout(); suspended = false; } }
async function presence(action = 'heartbeat') {
  if (!credentials.value) return;
  try { await api.post(`${base.value}/join-presence`, { action, displayName: credentials.value.displayName }, options); }
  catch (e) { if (e.response?.status === 410) finish(); }
}
async function join() {
  if (joining.value || stopped) return;
  const attempt = ++generation;
  joining.value = true; error.value = ''; ended.value = ''; clearTimers();
  try {
    const { data } = await api.get(`${base.value}/video-token`, options);
    if (stopped || attempt !== generation) return;
    if (!data.token || !data.sessionId || !data.applicationId) throw new Error('Video credentials unavailable');
    credentials.value = data;
    if (!suspended) { suspendInactivityTimeout(); suspended = true; }
    pollTimer = setInterval(poll, 4000); presenceTimer = setInterval(presence, 15000);
    void presence();
  } catch (e) {
    if (stopped || attempt !== generation) return;
    if (e.response?.status === 410) finish();
    else error.value = e.response?.data?.error?.message || 'We couldn’t connect. Please try again.';
  } finally { joining.value = false; }
}
async function poll() {
  if (polling || stopped || !credentials.value) return;
  const attempt = generation;
  polling = true;
  try {
    const { data } = await api.get(`${base.value}/admission-status`, options);
    if (stopped || attempt !== generation || !credentials.value) return;
    if (data.meetingCompleted || data.interviewGuestEnded || data.roomMode === 'ended') return finish();
    if (inLobby.value && data.admitted && data.token) credentials.value = data;
  } catch (e) { if (!stopped && attempt === generation && [404, 410].includes(e.response?.status)) finish(); }
  finally { polling = false; }
}
function leave(message = 'You have left the interview.') {
  ++generation; clearTimers(); void presence('leave'); credentials.value = null; ended.value = message; resume();
}
function finish() { canRejoin.value = false; leave('Your interview has ended. Thank you for meeting with us.'); }
function disconnected() { if (credentials.value) leave('You were disconnected. You can rejoin your interview.'); }
onMounted(join);
onBeforeUnmount(() => { stopped = true; leave(); });
</script>
<style scoped>
.applicant-interview{background:#0f1722;color:#f4f7fb;min-height:100dvh;padding:20px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px}h1{font-size:1.3rem;margin:0}.video-stage{height:60dvh;min-height:260px;min-width:0}
.video-stage :deep(.supervision-video-room){height:100%}button{align-self:center;padding:12px 20px;border-radius:8px}[role=alert]{color:#ffbaba}
</style>
