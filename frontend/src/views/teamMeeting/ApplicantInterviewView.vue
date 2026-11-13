<template>
  <main class="applicant-interview" :class="{ 'applicant-interview--lobby': inLobby }">
    <header class="applicant-header">
      <InterviewRoomBrand :agency-name="agencyName" :logo-url="agencyLogo" />
      <div class="applicant-header__actions"><slot name="header-actions" /></div>
    </header>
    <Teleport to="body">
      <button v-if="credentials" type="button" class="interview-leave leave-meeting" @click="leave()">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        Leave interview
      </button>
    </Teleport>
    <p v-if="error" class="applicant-alert" role="alert">{{ error }}</p>
    <section v-if="ended" class="applicant-exit" role="status">
      <h2>You’re out of the meeting</h2><p>{{ ended }}</p>
      <p>Your camera and microphone are disconnected.</p>
      <button v-if="canRejoin && !leaving" @click="join">Rejoin interview</button>
    </section>
    <p v-else-if="joining" class="applicant-connecting" role="status">Connecting to your interview…</p>
    <template v-else-if="credentials">
      <section class="applicant-meta" aria-label="Interview details">
        <span class="applicant-meta__title">{{ agencyName ? `Interview with ${agencyName}` : 'Your interview' }}</span>
        <span v-if="scheduleLabel" class="applicant-meta__schedule">{{ scheduleLabel }}</span>
        <span class="applicant-meta__status" role="status">{{ inLobby ? 'Waiting for your team' : (transcriptHint || 'Checking transcription…') }}</span>
        <span class="applicant-meta__you">You: {{ credentials.displayName }}</span>
      </section>
      <p v-if="inLobby" class="applicant-waiting" role="status">You’re in the waiting room. Your interviewer will let you in.</p>
      <div class="applicant-live-layout">
        <div class="video-stage">
          <SupervisionVideoRoom ref="videoRoomRef" :token="credentials.token" :vonage-session-id="credentials.sessionId"
            :application-id="credentials.applicationId" :local-display-name="credentials.displayName"
            local-role-label="Applicant" :lobby-mode="inLobby" :start-muted="false"
            :is-host="false" :is-host-or-cohost="false" :can-grant-screen-share="false"
            :can-share-screen="false" :equal-tiles-when-remote="true" :preserve-video-aspect="false"
            :show-layout-controls="false" :allow-tile-focus="false" tile-focus="equal" layout="standard"
            hide-leave-control :controls-target="inLobby ? '' : '#applicant-interview-controls'" v-model:video-fullscreen="videoFullscreen"
            @connected="videoConnected = true" @leave-request="leave()" @disconnected="disconnected" @meeting-ended="finish"
            @interview-guest-ended="finish" />
        </div>
        <div v-if="!inLobby" class="applicant-conversation">
          <div class="applicant-question-panel">
            <InterviewQuestionCard :question="sharedQuestion" variant="panel" />
            <p v-if="questionError" class="applicant-question-error" role="status">{{ questionError }}</p>
          </div>
          <InterviewSharedChat :endpoint="`${base}/chat`" heading="Chat with the team" theme="sage" />
        </div>
      </div>
      <footer v-if="!inLobby" id="applicant-interview-controls" class="applicant-controls" aria-label="Interview controls" />
    </template>
    <button v-else-if="!joining" class="applicant-retry" @click="join">Try joining again</button>
  </main>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import api from '../../services/api';
import SupervisionVideoRoom from '../../components/supervision/SupervisionVideoRoom.vue';
import InterviewSharedChat from '../../components/hiring/InterviewSharedChat.vue';
import InterviewQuestionCard from '../../components/hiring/InterviewQuestionCard.vue';
import InterviewRoomBrand from '../../components/hiring/InterviewRoomBrand.vue';
import '../../styles/interviewRoom.css';
import { useInterviewQuestion } from '../../composables/useInterviewQuestion';
import { useTeamMeetingLiveTranscript } from '../../composables/useTeamMeetingLiveTranscript';
import { suspendInactivityTimeout, resumeInactivityTimeout } from '../../utils/activityTracker';
const props = defineProps({ invitationToken: { type: String, required: true } });
const base = computed(() => `/team-meetings/interview-applicant/${encodeURIComponent(props.invitationToken)}`);
const credentials = ref(null), error = ref(''), joining = ref(false), ended = ref(''), canRejoin = ref(true);
const leaving = ref(false), details = ref(null), videoFullscreen = ref(false);
const agencyName = computed(() => details.value?.agency?.name || credentials.value?.branding?.name || credentials.value?.agencyName || '');
const agencyLogo = computed(() => details.value?.agency?.logoUrl || credentials.value?.branding?.logoUrl || (details.value?.agency?.slug === 'itsco' ? '/assets/plotline/careers/itsco-logo.png' : ''));
const scheduleLabel = computed(() => {
  const meeting = details.value?.meeting;
  if (!meeting?.startsAt || !meeting?.endsAt) return '';
  const utcDate = value => new Date(typeof value === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
  try {
    const start = utcDate(meeting.startsAt), end = utcDate(meeting.endsAt);
    const zone = meeting.timezone || 'America/Denver';
    const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(start);
    const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
    const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(start).find(part => part.type === 'timeZoneName')?.value || zone;
    return `${day} · ${time.format(start)} – ${time.format(end)} ${zoneName}`;
  } catch { return ''; }
});
const inLobby = computed(() => credentials.value?.roomMode === 'lobby');
const videoRoomRef = ref(null), videoConnected = ref(false);
const { transcriptHint, stopAndFlush: stopTranscript } = useTeamMeetingLiveTranscript({
  baseUrl: base, enabled: computed(() => !!credentials.value && videoConnected.value && !inLobby.value),
  getStream: () => videoRoomRef.value?.getTranscriptionStream?.()
});
const { question: sharedQuestion, error: questionError } = useInterviewQuestion({
  endpoint: computed(() => `${base.value}/question`), enabled: computed(() => !!credentials.value && !inLobby.value)
});
const options = { skipAuthRedirect: true, skipGlobalLoading: true, timeout: 20000 };
let pollTimer, presenceTimer, stopped = false, polling = false, generation = 0, suspended = false;
function clearTimers() { clearInterval(pollTimer); clearInterval(presenceTimer); }
function resume() { if (suspended) { resumeInactivityTimeout(); suspended = false; } }
async function presence(action = 'heartbeat', participant = credentials.value) {
  if (!participant) return;
  try { await api.post(`${base.value}/join-presence`, { action, displayName: participant.displayName }, options); }
  catch (e) { if (e.response?.status === 410) finish(); }
}
async function join() {
  if (joining.value || leaving.value || stopped) return;
  const attempt = ++generation;
  joining.value = true; error.value = ''; ended.value = ''; videoConnected.value = false; clearTimers();
  try {
    const { data } = await api.get(`${base.value}/video-token`, options);
    if (stopped || attempt !== generation) return;
    void api.get(`${base.value}/details`, options).then(({ data }) => {
      if (!stopped && attempt === generation) details.value = data;
    }).catch(() => {});
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
    if (inLobby.value && data.admitted && data.token) { videoConnected.value = false; credentials.value = data; }
  } catch (e) { if (!stopped && attempt === generation && [404, 410].includes(e.response?.status)) finish(); }
  finally { polling = false; }
}
async function leave(message = 'You have left the interview.') {
  ++generation; clearTimers();
  if (!credentials.value) { ended.value = message; return; }
  leaving.value = true;
  const participant = credentials.value;
  const room = videoRoomRef.value;
  // Stop capture now; close video immediately, then finish the final captured
  // segment before ending presence. Leaving never ends the interview for others.
  videoFullscreen.value = false;
  const flushed = stopTranscript();
  credentials.value = null; videoConnected.value = false; ended.value = message; resume();
  room?.disconnect?.(false);
  try { await flushed; }
  finally { await presence('leave', participant); leaving.value = false; }
}
function finish() { canRejoin.value = false; leave('Your interview has ended. Thank you for meeting with us.'); }
function disconnected() { if (credentials.value) leave('You were disconnected. You can rejoin your interview.'); }
onMounted(join);
onBeforeUnmount(() => { stopped = true; leave(); });
</script>
<style scoped>
.applicant-interview{height:100dvh;min-height:0;box-sizing:border-box;padding:22px 28px 26px;display:flex;flex-direction:column;gap:14px;overflow:hidden;background:#0b352b url('/assets/plotline/interview/background.png') center/cover;color:#fff8ee;font-family:'Plotline Inter',system-ui,sans-serif;isolation:isolate}
.applicant-header{display:flex;align-items:center;gap:24px;min-height:72px;padding-right:224px;flex-shrink:0}
.applicant-header__actions{margin-left:auto;flex-shrink:0;font-size:.7rem}.applicant-header__actions :deep(a){color:#edf1df;text-underline-offset:4px}
.applicant-meta{display:flex;align-items:center;gap:18px;padding:12px 18px;background:#c6ddc512;border:1px solid #c6ddc51f;border-radius:18px;font-size:.8rem;min-height:52px;flex-shrink:0}
.applicant-meta__title{font-weight:600;font-size:.9rem}.applicant-meta__schedule{border-left:1px solid #d2deca55;padding-left:18px}.applicant-meta__status{margin-left:auto;border:1px solid #d2deca55;border-radius:24px;padding:6px 10px;font-size:.72rem;max-width:40%;overflow-wrap:anywhere}.applicant-meta__you{border-left:1px solid #d2deca55;padding-left:18px;font-size:.76rem}
.applicant-live-layout{display:grid;grid-template-rows:minmax(0,1fr) clamp(185px,27dvh,270px);gap:16px;flex:1;min-height:0;min-width:0}
.applicant-interview--lobby .applicant-live-layout{grid-template-rows:minmax(0,1fr)}
.video-stage{height:100%;min-height:0;min-width:0}.video-stage :deep(.supervision-video-room){height:100%;min-height:0;background:transparent;overflow:hidden;border-radius:20px}.video-stage :deep(.vsr){min-height:0;height:100%;background:transparent}.video-stage :deep(.vsr__viewport){min-height:0;flex:1}.video-stage :deep(.vsr__stage){min-height:0;height:100%;background:transparent}.video-stage :deep(.vsr__tile){border-radius:18px;border:1px solid #b9cbb54d}.video-stage :deep(.vsr__tile--local){border-color:#efb491}
:is(.video-stage,.applicant-controls) :deep(.vsr__controls){justify-content:center;padding:10px 14px;gap:8px;background:#102d25dd;border:1px solid #adc8a62b;border-radius:40px;align-self:center;max-width:100%;flex-wrap:nowrap;overflow-x:auto;flex-shrink:0}:is(.video-stage,.applicant-controls) :deep(.vsr__ctrl){border-radius:24px;background:#284337c9;color:#f7f4e9;border-color:#b0c2a44d;white-space:nowrap;min-height:40px;padding:8px 14px;flex-shrink:0}.video-stage :deep(.vsr__audio-settings){border-radius:12px;background:#0e2a22b3;padding:5px 12px;color:#e9ebdf}:is(.video-stage,.applicant-controls) :deep(.vsr__reactions){flex-shrink:0}.video-stage :deep(.vsr__tile-size-group){display:none}.video-stage :deep(.vsr__grid-toolbar){padding:0;gap:0}.applicant-controls{display:flex;justify-content:center;flex-shrink:0;min-width:0}
.applicant-conversation{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(290px,1fr);gap:18px;min-height:0;min-width:0}.applicant-question-panel{position:relative;min-height:0;min-width:0}.applicant-question-panel :deep(.interview-question){height:100%}.applicant-question-error{position:absolute;bottom:10px;left:20px;right:20px;background:#fff1dd;color:#784b31;font-size:.72rem;margin:0}
.applicant-conversation :deep(.interview-shared-chat){height:100%;flex:auto;min-height:0}.applicant-alert,.applicant-waiting{margin:0;padding:10px 16px;background:#163b30;border:1px solid #bdd1a849;border-radius:12px;flex-shrink:0;font-size:.85rem}.applicant-alert{color:#ffe1c2}
.applicant-exit{align-self:center;margin:auto;padding:36px;max-width:560px;border:1px solid #d5dcca55;border-radius:24px;background:#143b30e8;text-align:center}.applicant-exit h2{font-family:'Plotline Sora',system-ui,sans-serif;color:#fff1df}.applicant-exit button,.applicant-retry{padding:12px 22px;background:#f2b796;color:#153c30;border:1px solid #ffdbba;border-radius:24px;font-weight:600;cursor:pointer}.applicant-connecting{margin:auto;font-size:1.1rem}
@media(max-width:1050px){.applicant-meta{gap:12px;flex-wrap:wrap;padding:10px 14px}.applicant-meta__you{margin-left:auto}.applicant-meta__status{max-width:none}.applicant-meta__schedule{font-size:.72rem}.applicant-header__actions{margin-left:0}.applicant-conversation{grid-template-columns:minmax(0,1.2fr) minmax(280px,1fr)}}
@media(max-width:700px){.applicant-interview{padding:12px;gap:10px}.applicant-header{padding-right:140px;min-height:68px;display:block}.applicant-header__actions{margin:6px 0 0 64px;font-size:.62rem}.applicant-meta{padding:8px 12px;gap:7px;font-size:.7rem}.applicant-meta__title{font-size:.75rem}.applicant-meta__schedule{border:0;padding:0}.applicant-meta__you{display:none}.applicant-meta__status{padding:3px 7px;font-size:.65rem;margin-left:auto;max-width:100%}.applicant-live-layout{grid-template-rows:minmax(120px,1fr) minmax(280px,42dvh);gap:10px}.applicant-conversation{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(80px,.8fr) minmax(150px,1.2fr);gap:10px}.applicant-question-panel :deep(.interview-question){padding:12px 16px;border-radius:16px}.applicant-question-panel :deep(.interview-question p){font-size:1rem;line-height:1.4}.applicant-conversation :deep(.interview-shared-chat){padding:12px 14px;border-radius:16px}:is(.video-stage,.applicant-controls) :deep(.vsr__controls){padding:6px;gap:6px;width:100%;justify-content:flex-start}:is(.video-stage,.applicant-controls) :deep(.vsr__ctrl){min-height:34px;padding:5px 12px;font-size:.75rem}.video-stage :deep(.vsr__audio-settings){font-size:.7rem}.applicant-question-panel :deep(.interview-question__label){font-size:.6rem}}
@media(max-height:650px) and (min-width:701px){.applicant-interview{padding-top:10px;padding-bottom:12px;gap:8px}.applicant-header{min-height:54px}.applicant-meta{min-height:38px;padding:7px 12px}.applicant-live-layout{grid-template-columns:minmax(0,1.35fr) minmax(260px,1fr);grid-template-rows:minmax(0,1fr);gap:12px}.applicant-conversation{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(50px,.65fr) minmax(130px,1.35fr);gap:8px}.applicant-conversation :deep(.interview-shared-chat){padding:10px 12px}.applicant-meta__you{display:none}}
@media(max-height:720px) and (max-width:700px){.applicant-interview{gap:8px}.applicant-live-layout{grid-template-rows:minmax(100px,1fr) 230px;gap:8px}.applicant-conversation{grid-template-rows:minmax(70px,.6fr) minmax(140px,1.4fr);gap:8px}.applicant-conversation :deep(.interview-shared-chat){padding:10px 12px;gap:4px}.applicant-question-panel :deep(.interview-question){padding:10px 14px}}
</style>
