<template>
  <ClinicalWorkspaceFrame :enabled="clinicalSessionBranding" immersive :tenant-id="session?.agencyId || session?.agency_id" context-label="Counseling session" :back-disabled="phase !== 'pre' && phase !== 'ended'">
  <div class="cs" :class="{ 'cs--provider': participantRole === 'provider', 'cs--activity': inActivityMode }">
    <header v-if="phase !== 'connected'" class="clinical-brand"><img :src="'/assets/auricwell-session-logo.png'" alt="AuricWell" /><div><strong>AuricWell</strong><small>{{ branding?.agencyName || 'Virtual care' }}</small></div></header>
    <ClientRecordingConsentPanel v-if="session && phase !== 'ended'" :base-url="transcriptionBase" :is-provider="participantRole === 'provider'" />
    <ConsentedTranscriptionPanel v-if="phase === 'connected'" ref="transcriptionPanel" :base-url="transcriptionBase" :connected="videoConnected" :is-host="participantRole === 'provider'" :get-stream="getTranscriptionStream" />
    <label v-if="participantRole === 'provider' && phase !== 'joining'" class="cs__note-type">Note type for a recorded session
      <select v-model="noteAidId"><option value="">Use appointment service code</option><option value="psychotherapy">Individual psychotherapy progress note</option><option value="h0004_note">H0004 note</option><option value="h2014_individual">H2014 individual progress note</option><option value="h2014_group">H2014 group progress note</option></select>
    </label>
    <p v-if="noteMessage" role="status">{{ noteMessage }}</p>
    <button v-if="noteRetry" class="cs__btn" @click="createTranscriptNote">Retry creating clinical draft</button>
    <!-- Pre-session -->
    <div v-if="phase === 'pre'" class="cs__pre">
      <h1>{{ session?.title || 'Counseling Session' }}</h1>
      <p class="cs__pre-sub">Check your camera and microphone, then join when ready.</p>
      <div class="cs__pre-preview">
        <video ref="previewVideoEl" class="cs__preview-video" autoplay muted playsinline />
      </div>
      <p v-if="preError" class="cs__error">{{ preError }}</p><a v-if="needsMfa" href="/account-security">Open Account security</a>
      <button type="button" class="cs__btn cs__btn--primary" :disabled="joining" @click="doJoin">
        {{ joining ? 'Connecting…' : 'Join session' }}
      </button>
    </div>

    <!-- Joining -->
    <div v-else-if="phase === 'joining'" class="cs__joining">
      <div class="cs__pulse" aria-hidden="true" />
      <p>Connecting to your session…</p>
    </div>

    <section v-else-if="phase === 'waiting'" class="cs-waiting">
      <SupervisionWaitingRoomStage :meeting-title="`AuricWell · ${branding?.agencyName || session?.title || 'Virtual care'}`" host-role-label="Provider" :host-present="session?.status==='active'" :show-preview-hint="false" />
      <button class="waiting-leave cs__btn" @click="confirmEnd">Leave waiting room</button><p v-if="preError" role="alert">{{ preError }}</p>
    </section>
    <template v-else-if="phase === 'connected'">
      <section v-if="participantRole==='provider'" class="client-admission"><strong>Waiting room</strong><p v-if="!visits.some(v=>v.status==='waiting')">No clients waiting.</p><div v-for="visit in visits.filter(v=>v.status==='waiting')" :key="visit.id"><span>{{ visit.displayName || 'Client' }} · {{ visit.ipAddress }}</span><button class="cs__btn cs__btn--primary" :disabled="!videoConnected" @click="admitClient(visit.id)">Admit client</button></div><details><summary>Attendance audit</summary><p v-for="visit in visits" :key="visit.id">{{ visit.actor }} · {{ visit.ipAddress }} · {{ visit.status }} · Admitted: {{ visit.durationSeconds == null ? 'In progress' : `${visit.durationSeconds}s` }} · Video: {{ visit.mediaDurationSeconds == null ? 'Not confirmed' : `${visit.mediaDurationSeconds}s` }}</p></details></section>
      <TherapySessionWorkspace :is-host="participantRole==='provider'" :identified="true" :branding="branding" :request="workspaceRequest" :video-control="()=>videoRoomRef" @leave-request="confirmEnd">
        <template #video>
          <VideoSessionRoom v-if="videoCreds" ref="videoRoomRef" v-bind="videoCreds" :key="`${videoCreds.sessionId}:${String(videoCreds.token || '').slice(-12)}`" :local-name="localName" :hide-controls="true" :server-managed-end="true" :equal-tiles-when-remote="false" :is-host-or-cohost="participantRole==='provider'" :can-recreate-room="false" @connected="videoConnected=true" @disconnected="onClinicalDisconnected" @request-rejoin="rejoinVideo" @request-recreate-room="refreshVideoToken({recreateRoom:true})" @meeting-ended="phase='ended';stopPolling()" @leave-request="confirmEnd" />
          <p v-else class="cs__video">{{ videoRejoinError || 'Connecting video…' }} <button class="cs__btn" @click="rejoinVideo">Retry video</button></p>
        </template>
        <details v-if="participantRole==='provider' || inActivityMode" :open="inActivityMode || undefined" class="clinical-extras"><summary>Therapy activity library</summary><ActivityHost :session-id="sessionId" :role="participantRole" :runtime="activityRuntime" :layout="isMobileLayout ? 'mobile' : 'web'" :provider-label="providerDisplayName" @runtime-updated="onRuntimeUpdated"><template #idle><ActivityLibrary :activities="activities" :loading="activitiesLoading" :can-launch-embedded="participantRole==='provider'" @launch-embedded="launchEmbedded" @launch-standalone="launchStandalone" /></template></ActivityHost></details>
        <details class="clinical-extras"><summary>Session notes</summary><article v-for="n in notes" :key="n.id"><small>{{ visibilityLabel(n.visibility) }}</small><p>{{ n.body }}</p></article><form @submit.prevent="addNote"><select v-model="noteVisibility"><option v-if="participantRole==='provider'" value="provider_private">Provider private</option><option value="shared">Shared note</option><option v-if="participantRole!=='provider'" value="client_journal">My journal</option></select><textarea v-model="noteDraft" maxlength="4000" rows="3" aria-label="Note" /><button class="cs__btn" :disabled="!noteDraft.trim()">Save note</button></form></details>
        <button v-if="participantRole==='provider'" class="cs__btn" @click="copyInviteLink">{{ inviteCopied ? 'Link copied' : 'Copy personal invitation' }}</button>
      </TherapySessionWorkspace>
    </template>

    <div v-else-if="phase === 'ended'" class="cs__ended">
      <h1>{{ disconnection==='ending' ? 'Session ending' : 'Session complete' }}</h1><p v-if="disconnection==='ending'" role="status">Access is closed. The server is finishing disconnection for everyone.</p><button v-if="participantRole==='provider' && disconnection==='ending'" class="cs__btn" :disabled="endBusy" @click="retryEnd">Retry disconnection</button>
      <p>Thank you. You can close this window.</p><SavedSessionArtifacts v-if="participantRole==='provider'" :request="workspaceRequest" />
      <router-link v-if="orgSlug" class="cs__btn cs__btn--primary" :to="`/${orgSlug}`">
        Back to portal
      </router-link>
    </div>
  </div>
  </ClinicalWorkspaceFrame>
</template>

<script setup>
import { practiceCategoryForBusinessType } from '../../config/practiceCategories.js';
import { useAgencyStore } from '../../store/agency';
import { isMentalHealthWorkspace } from '../../utils/clinicalWorkspace.js';
import ClinicalWorkspaceFrame from '../../components/clinicalWorkspace/ClinicalWorkspaceFrame.vue';
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { suspendInactivityTimeout, resumeInactivityTimeout } from '../../utils/activityTracker';
import SavedSessionArtifacts from '../../components/meetings/SavedSessionArtifacts.vue';
import TherapySessionWorkspace from '../../components/meetings/TherapySessionWorkspace.vue';
import SupervisionWaitingRoomStage from '../../components/supervision/SupervisionWaitingRoomStage.vue';
import VideoSessionRoom from '../../components/video/VideoSessionRoom.vue';
import ActivityHost from '../../components/counseling/ActivityHost.vue';
import ActivityLibrary from '../../components/counseling/ActivityLibrary.vue';
import * as counselingApi from '../../services/counselingApi.js';
import api from '../../services/api';
import {finishMeetingTranscription} from '../../utils/finishMeetingTranscription';
import { counselingAccessFor } from '../../utils/counselingInvitationAccess';
import ClientRecordingConsentPanel from '../../components/video/ClientRecordingConsentPanel.vue';
import ConsentedTranscriptionPanel from '../../components/video/ConsentedTranscriptionPanel.vue';
import { launchActivity } from '../../services/launchActivity.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const sessionId = computed(() => route.params.sessionId);
const orgSlug = computed(() => route.params.organizationSlug || null);

const videoRoomRef = ref(null), transcriptionPanel = ref(null), videoConnected = ref(false);
const noteAidId = ref(''), noteMessage = ref(''), noteRetry = ref(false);
const transcriptionBase = computed(() => `/counseling/sessions/${sessionId.value}`);
const getTranscriptionStream = () => videoRoomRef.value?.getTranscriptionStream?.();
const phase = ref('pre');
const branding=ref(null),visits=ref([]);
const workspaceRequest=(_path,{method='GET',body}={})=>api({url:`/counseling/sessions/${sessionId.value}/workspace${_path}`,method,data:body,skipGlobalLoading:true}).then(r=>r.data);
async function refreshVisits(){try{const {data}=await api.get(`/counseling/sessions/${sessionId.value}/visits`,{skipGlobalLoading:true});visits.value=data.visits||[];if(data.visit?.status==='ended'&&phase.value==='connected'){stopPolling();phase.value='ended';videoCreds.value=null;}return data.visit;}catch(error){if(participantRole.value==='client'&&[401,403,410].includes(error.response?.status)){stopPolling();phase.value='ended';videoCreds.value=null;}throw error;}}
async function admitClient(id){try{await api.post(`/counseling/sessions/${sessionId.value}/visits/${id}/admit`);await refreshVisits();}catch(e){noteMessage.value=e.response?.data?.error?.message||e.message;}}
let admissionTimer;
function waitForAdmission(){clearInterval(admissionTimer);admissionTimer=setInterval(async()=>{try{const visit=await refreshVisits();if(visit?.status==='admitted'){clearInterval(admissionTimer);await enterConnected();}else if(visit?.status==='ended'){clearInterval(admissionTimer);phase.value='ended';}}catch(e){preError.value=e.response?.data?.error?.message||e.message;if([401,403,410].includes(e.response?.status)){clearInterval(admissionTimer);phase.value='ended';}}},3000);}
async function enterConnected(){await loadSessionMeta();try{await refreshVideoToken();}catch(e){videoRejoinError.value=e.response?.data?.error?.message||e.message;}startedAtMs.value=Date.now();phase.value='connected';await Promise.allSettled([refreshNotes(),loadActivities()]);startPolling();}
const joining = ref(false);
const preError = ref('');
const session = ref(null);
const clinicalAgencyStore = useAgencyStore();
const clinicalSessionBranding = computed(() => {
  if (!session.value) return false;
  const agencyId = Number(session.value.agencyId);
  const tenant = [clinicalAgencyStore.currentAgency, ...(clinicalAgencyStore.userAgencies || [])].find(a => Number(a?.id) === agencyId);
  // A booked tutoring/coaching call retains its tenant shell. Unbooked calls
  // use explicit tenant context, never the viewer's provider role.
  return isMentalHealthWorkspace({
    practiceCategory: practiceCategoryForBusinessType(session.value.businessType), tenant
  });
});
const participantRole = ref('client');
const needsMfa=ref(false),endBusy=ref(false),disconnection=ref('ended');let closureTimer;
const videoCreds = ref(null);
const videoConfigured = ref(null);
const activityRuntime = ref(null);
const activities = ref([]);
const activitiesLoading = ref(false);
const chatMessages = ref([]);
const chatDraft = ref('');
const notes = ref([]);
const noteDraft = ref('');
const noteVisibility = ref('shared');
const activePanel = ref('session');
const sideTab = ref('chat');
const sideOpen = ref(false);
const startedAtMs = ref(null);
const nowMs = ref(Date.now());
const previewVideoEl = ref(null);
const inviteCopied = ref(false);
let previewStream = null;
let pollTimer = null;
let clockTimer = null;

const localName = computed(() => counselingAccessFor(sessionId.value)?.displayName || auth.user?.name || auth.user?.email || 'You');
const providerDisplayName = computed(() => 'Your provider');

const isMobileLayout = ref(
  typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : true
);

const providerTabs = [
  { id: 'session', label: 'Session' },
  { id: 'activity', label: 'Activities' },
  { id: 'notes', label: 'Notes' }
];

const inActivityMode = computed(() => {
  const s = activityRuntime.value?.status;
  return s && !['INACTIVE', 'COMPLETED', 'RETURNING'].includes(s);
});

const durationLabel = computed(() => {
  if (!startedAtMs.value) return '00:00';
  const sec = Math.max(0, Math.floor((nowMs.value - startedAtMs.value) / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
});

function visibilityLabel(v) {
  if (v === 'provider_private') return 'Private';
  if (v === 'client_journal') return 'Journal';
  if (v === 'activity_reflection') return 'Activity';
  return 'Shared';
}

async function startPreview() {
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (previewVideoEl.value) {
      previewVideoEl.value.srcObject = previewStream;
    }
  } catch {
    preError.value = 'Camera or microphone permission is needed to preview. You can still try joining.';
  }
}

function stopPreview() {
  if (previewStream) {
    previewStream.getTracks().forEach((t) => t.stop());
    previewStream = null;
  }
}

async function loadSessionMeta() {
  const data = await counselingApi.getCounselingSession(sessionId.value);
  session.value = data.session;
  branding.value=data.branding;
  participantRole.value = data.participantRole || 'client';
  activityRuntime.value = data.activityRuntime;
  videoConfigured.value = data.videoConfigured;
  noteVisibility.value = participantRole.value === 'provider' ? 'provider_private' : 'shared';
  // Prefer opaque UUID in the address bar (not sequential DB ids).
  const pub = data.session?.publicId;
  const current = String(sessionId.value || '');
  if (pub && current !== pub && /^\d+$/.test(current)) {
    const path = orgSlug.value
      ? `/${orgSlug.value}/counseling/session/${pub}`
      : `/counseling/session/${pub}`;
    await router.replace(path);
  }
}

const videoRejoinError = ref('');
function onClinicalDisconnected(){videoConnected.value=false;if(endBusy.value)return;if(participantRole.value==='client'){stopPolling();phase.value='ended';videoCreds.value=null;void api.post(`/counseling/sessions/${sessionId.value}/leave`).catch(()=>{});}}
async function rejoinVideo() {
  videoRejoinError.value = '';
  try { await refreshVideoToken(); }
  catch (error) {
    videoRejoinError.value = error?.response?.data?.error?.message || 'Unable to rejoin. Please try again.';
    if (error?.response?.status === 410) { stopPolling(); phase.value = 'ended'; }
  }
}
async function refreshVideoToken({ recreateRoom = false } = {}) {
  const tok = await counselingApi.getCounselingVideoToken(sessionId.value, { recreateRoom });
  const projectId = tok.applicationId || tok.apiKey || '';
  videoCreds.value = {
    applicationId: projectId,
    // Keep apiKey as the same project id for older bindings — never use account API key.
    apiKey: projectId,
    sessionId: tok.sessionId,
    token: tok.token,
    diagnostics: tok.diagnostics || null
  };
  videoConfigured.value = true;
}

async function doJoin() {
  joining.value = true;
  preError.value = '';
  phase.value = 'joining';
  stopPreview();
  try {
    const joined=await counselingApi.joinCounselingSession(sessionId.value);
    if(participantRole.value==='client' && joined.visit?.status!=='admitted'){phase.value='waiting';waitForAdmission();}
    else await enterConnected();
  } catch (err) {
    phase.value = 'pre';
    preError.value = err?.response?.data?.error?.message || err?.message || 'Could not join session.';
    await startPreview();
  } finally {
    joining.value = false;
  }
}

async function loadActivities() {
  if (participantRole.value !== 'provider') return;
  activitiesLoading.value = true;
  try {
    const agencyId = session.value?.agencyId || auth.user?.agencyId;
    activities.value = await counselingApi.listActivities({
      agencyId,
      platform: isMobileLayout.value ? 'mobile' : 'web'
    });
  } finally {
    activitiesLoading.value = false;
  }
}

async function refreshChat() {
  try {
    const afterId = chatMessages.value.length
      ? chatMessages.value[chatMessages.value.length - 1].id
      : 0;
    const msgs = await counselingApi.listCounselingChat(sessionId.value, afterId);
    if (msgs.length) chatMessages.value = [...chatMessages.value, ...msgs];
    else if (!chatMessages.value.length) {
      chatMessages.value = await counselingApi.listCounselingChat(sessionId.value, 0);
    }
  } catch (err) {
    console.warn('[counseling] chat refresh failed', err);
  }
}

async function refreshNotes() {
  try {
    notes.value = await counselingApi.listCounselingNotes(sessionId.value);
  } catch (err) {
    console.warn('[counseling] notes refresh failed', err);
  }
}

async function refreshRuntime() {
  try {
    activityRuntime.value = await counselingApi.getActivityRuntime(sessionId.value);
  } catch (err) {
    console.warn('[counseling] activity refresh failed', err);
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      await Promise.all([refreshRuntime(),refreshVisits()]);
    } catch {
      /* ignore transient */
    }
  }, 2500);
  clockTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  pollTimer = null;
  clockTimer = null;
}

async function sendChat() {
  const body = chatDraft.value.trim();
  if (!body) return;
  const msg = await counselingApi.postCounselingChat(sessionId.value, body);
  chatDraft.value = '';
  if (msg) chatMessages.value = [...chatMessages.value, msg];
}

async function addNote() {
  const body = noteDraft.value.trim();
  if (!body) return;
  await counselingApi.createCounselingNote(sessionId.value, {
    body,
    visibility: noteVisibility.value
  });
  noteDraft.value = '';
  await refreshNotes();
}

async function launchEmbedded(activity) {
  const runtime = await counselingApi.inviteActivity(sessionId.value, activity.id);
  activityRuntime.value = runtime;
  activePanel.value = 'activity';
}

function launchStandalone(activity) {
  launchActivity(activity, { mode: 'standalone' });
}

function onRuntimeUpdated(runtime) {
  activityRuntime.value = runtime;
  if (!runtime || runtime.status === 'INACTIVE') {
    /* returned to counseling */
  }
}

async function copyInviteLink() {
  try {
    const data = await counselingApi.getCounselingShareLink(sessionId.value);
    const slug = orgSlug.value;
    const path = data?.sharePath || '';
    const url =
      slug && path.startsWith('/counseling/')
        ? `${window.location.origin}/${slug}${path}`
        : `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    inviteCopied.value = true;
    setTimeout(() => {
      inviteCopied.value = false;
    }, 2000);
  } catch (err) {
    console.warn('[counseling] share link failed', err);
    preError.value = err?.response?.data?.error?.message || 'Could not copy invite link';
  }
}

async function createTranscriptNote() {
  noteRetry.value = false; noteMessage.value = 'Preparing the clinical draft…';
  try {
    const {data} = await api.post(`${transcriptionBase.value}/transcription/note`, {noteAidId:noteAidId.value || undefined});
    noteMessage.value = data.draftId ? 'Clinical draft saved in Documentation Hub. Review and sign it there.' : 'No recorded transcript was available to create a note.';
  } catch(e) { noteMessage.value = e.response?.data?.error?.message || 'The draft could not be created. Your transcript is saved; retry when connected.'; noteRetry.value = true; }
}
async function trackDisconnection() {
  clearInterval(closureTimer);
  const refresh=async()=>{try{disconnection.value=(await api.get(`/counseling/sessions/${sessionId.value}/disconnection`)).data.state;if(disconnection.value==='ended')clearInterval(closureTimer);}catch{noteMessage.value='Unable to confirm disconnection. Retry ending the session.';}};
  await refresh();if(disconnection.value!=='ended')closureTimer=setInterval(refresh,5000);
}
async function retryEnd(){if(endBusy.value)return;endBusy.value=true;try{await counselingApi.endCounselingSession(sessionId.value);await trackDisconnection();}catch(e){noteMessage.value=e.response?.data?.error?.message||'Could not confirm disconnection. Please retry.';}finally{endBusy.value=false;}}
async function confirmEnd() {
  if(endBusy.value)return;
  const provider=participantRole.value==='provider';
  if(!window.confirm(provider?'End this counseling session for everyone?':'Leave this session?'))return;
  endBusy.value=true;
  const recorded=!!transcriptionPanel.value?.getState()?.requested;
  try {
    try {
      if(provider&&recorded)await finishMeetingTranscription(transcriptionBase.value);
      await transcriptionPanel.value?.flush();
      if(recorded)await api.post(`${transcriptionBase.value}/transcription/control`,{action:'drained'});
    }catch {noteMessage.value='Some transcript segments could not be confirmed. Ending the session now.';}
    if(provider)await counselingApi.endCounselingSession(sessionId.value);
    else await api.post(`/counseling/sessions/${sessionId.value}/leave`);
    clearInterval(admissionTimer);stopPolling();videoConnected.value=false;phase.value='ended';
    if(provider)await trackDisconnection();
    if(provider&&recorded)await createTranscriptNote();
  }catch(e){noteMessage.value=e.response?.data?.error?.message||'Could not confirm session ending. Please retry.';}
  finally{endBusy.value=false;}
}

watch(inActivityMode, (v) => {
  if (v) activePanel.value = 'activity';
});

watch(phase, (p, prev) => {
  const active = p === 'joining' || p === 'connected';
  const wasActive = prev === 'joining' || prev === 'connected';
  if (active && !wasActive) suspendInactivityTimeout();
  else if (!active && wasActive) resumeInactivityTimeout();
}, { immediate: true });

let mediaQuery = null;
let onMediaQueryChange = null;

onMounted(async () => {
  mediaQuery = window.matchMedia('(max-width: 768px)');
  onMediaQueryChange = () => {
    isMobileLayout.value = mediaQuery.matches;
  };
  mediaQuery.addEventListener?.('change', onMediaQueryChange);

  try {
    await loadSessionMeta();
    if (session.value?.status === 'ended') {
      phase.value = 'ended';
      if(participantRole.value==='provider')await trackDisconnection();
      return;
    }
    if (participantRole.value==='client') await doJoin();
    else await startPreview();
  } catch (err) {
    needsMfa.value=err?.response?.data?.error?.code==='MFA_REQUIRED';
    preError.value = err?.response?.data?.error?.message || 'Unable to load session.';
  }
});

onBeforeUnmount(() => {
  resumeInactivityTimeout();
  clearInterval(closureTimer);
  if (mediaQuery && onMediaQueryChange) {
    mediaQuery.removeEventListener?.('change', onMediaQueryChange);
  }
  stopPreview();
  stopPolling();
  clearInterval(admissionTimer);
  if(participantRole.value==='client'&&['waiting','connected'].includes(phase.value))void api.post(`/counseling/sessions/${sessionId.value}/leave`).catch(()=>{});
});
</script>

<style scoped>
.clinical-brand{display:flex;align-items:center;gap:14px;padding:20px;background:white}.clinical-brand img{width:54px;height:54px;object-fit:contain}.clinical-brand strong{font-size:22px}.clinical-brand small{display:block;color:#64748b;margin-top:4px}
.cs-waiting{position:relative;min-height:100vh}.waiting-leave{position:absolute;right:24px;top:24px;z-index:4}.client-admission,.clinical-extras{padding:18px;margin:12px;background:white;border:1px solid #e2e8f0;border-radius:14px}.clinical-extras textarea{display:block;width:100%;margin:12px 0}.cs-waiting :deep(.swr__overlay){max-width:640px}.cs-waiting :deep(.swr__sub){white-space:normal}
.cs {
  min-height: 100vh;
  background: #fff;
  color: #0f172a;
  display: flex;
  flex-direction: column;
}
.cs__pre,
.cs__joining,
.cs__ended {
  max-width: 420px;
  margin: 0 auto;
  padding: 2rem 1.25rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
  justify-content: center;
}
.cs__pre-sub {
  color: #475569;
  margin: 0;
}
.cs__preview-video {
  width: 100%;
  max-height: 280px;
  border-radius: 12px;
  background: #0f172a;
  object-fit: cover;
}
.cs__error {
  color: #b91c1c;
  font-size: 0.9rem;
}
.cs__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  font-weight: 600;
  cursor: pointer;
  padding: 0.55rem 1rem;
  text-decoration: none;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cs__btn--primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.cs__btn--danger {
  background: #fee2e2;
  border-color: #fecaca;
  color: #991b1b;
}
.cs__pulse {
  width: 40px;
  height: 40px;
  margin: 0 auto;
  border-radius: 50%;
  border: 3px solid #2563eb;
  border-top-color: transparent;
  animation: cs-spin 0.9s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .cs__pulse {
    animation: none;
    border-top-color: #2563eb;
  }
}
@keyframes cs-spin {
  to {
    transform: rotate(360deg);
  }
}
.cs__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.9rem;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
}
.cs__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.cs__secure {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #14532d;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  flex-shrink: 0;
}
.cs__title {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs__header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.cs__timer {
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  opacity: 0.85;
}
.cs__body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.cs__nav {
  width: 140px;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  display: none;
  flex-direction: column;
  padding: 0.5rem;
  gap: 0.25rem;
}
.cs--provider .cs__nav {
  display: flex;
}
.cs__nav-item {
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  min-height: 44px;
  cursor: pointer;
  font-weight: 600;
  color: #334155;
}
.cs__nav-item--active {
  background: #dbeafe;
  color: #1d4ed8;
}
.cs__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.65rem;
  min-width: 0;
}
.cs__video {
  min-height: 28vh;
  color: #f8fafc;
}
.cs--activity .cs__video {
  min-height: 18vh;
}
.cs__video--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  color: #cbd5e1;
  border-radius: 10px;
  padding: 1.5rem;
  text-align: center;
}
.cs__activity,
.cs__session-home {
  background: #fff;
  border-radius: 12px;
  padding: 0.85rem;
  border: 1px solid #e2e8f0;
  flex: 1;
}
.cs__side {
  width: 100%;
  max-width: 320px;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}
.cs__side-tabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
}
.cs__side-tab {
  flex: 1;
  min-height: 44px;
  border: none;
  background: transparent;
  font-weight: 600;
  cursor: pointer;
}
.cs__side-tab--active {
  box-shadow: inset 0 -2px 0 #2563eb;
  color: #2563eb;
}
.cs__side-body {
  flex: 1;
  overflow: auto;
  padding: 0.65rem;
}
.cs__chat-list,
.cs__notes-list {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 40vh;
  overflow: auto;
}
.cs__chat-msg {
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  background: #f1f5f9;
  font-size: 0.9rem;
}
.cs__chat-msg--provider {
  background: #e0e7ff;
}
.cs__chat-role {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 0.15rem;
}
.cs__chat-form,
.cs__note-form {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.cs__chat-form input,
.cs__note-form textarea,
.cs__note-form select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}
.cs__note-vis {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #64748b;
}
.cs__note p {
  margin: 0.2rem 0 0;
  font-size: 0.9rem;
}
.cs__bottom-nav {
  display: flex;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}
.cs__bottom-nav button {
  flex: 1;
  min-height: 52px;
  border: none;
  background: transparent;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 768px) {
  .cs--provider .cs__nav {
    display: none;
  }
  .cs--provider .cs__side,
  .cs__side {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 52px;
    max-width: none;
    max-height: 45vh;
    border-left: none;
    border-top: 1px solid #e2e8f0;
    z-index: 20;
  }
  .cs__side:not(.cs__side--open) .cs__side-body {
    display: none;
  }
  .cs__body {
    flex-direction: column;
  }
}

@media (min-width: 769px) {
  .cs__bottom-nav {
    display: none;
  }
  .cs__side {
    display: flex !important;
  }
}
</style>
