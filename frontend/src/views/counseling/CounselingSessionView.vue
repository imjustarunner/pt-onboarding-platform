<template>
  <div class="cs" :class="{ 'cs--provider': participantRole === 'provider', 'cs--activity': inActivityMode }">
    <!-- Pre-session -->
    <div v-if="phase === 'pre'" class="cs__pre">
      <h1>{{ session?.title || 'Counseling Session' }}</h1>
      <p class="cs__pre-sub">Check your camera and microphone, then join when ready.</p>
      <div class="cs__pre-preview">
        <video ref="previewVideoEl" class="cs__preview-video" autoplay muted playsinline />
      </div>
      <p v-if="preError" class="cs__error">{{ preError }}</p>
      <button type="button" class="cs__btn cs__btn--primary" :disabled="joining" @click="doJoin">
        {{ joining ? 'Connecting…' : 'Join session' }}
      </button>
    </div>

    <!-- Joining -->
    <div v-else-if="phase === 'joining'" class="cs__joining">
      <div class="cs__pulse" aria-hidden="true" />
      <p>Connecting to your session…</p>
    </div>

    <!-- Connected -->
    <template v-else-if="phase === 'connected'">
      <header class="cs__header">
        <div class="cs__brand">
          <span class="cs__secure" title="Secure session">Secure</span>
          <span class="cs__title">{{ session?.title || 'Counseling Session' }}</span>
        </div>
        <div class="cs__header-actions">
          <span class="cs__timer">{{ durationLabel }}</span>
          <button
            v-if="participantRole === 'provider'"
            type="button"
            class="cs__btn"
            @click="copyInviteLink"
          >
            {{ inviteCopied ? 'Link copied' : 'Copy invite link' }}
          </button>
          <button type="button" class="cs__btn cs__btn--danger" @click="confirmEnd">End Session</button>
        </div>
      </header>

      <div class="cs__body">
        <nav v-if="participantRole === 'provider'" class="cs__nav" aria-label="Session navigation">
          <button
            v-for="tab in providerTabs"
            :key="tab.id"
            type="button"
            class="cs__nav-item"
            :class="{ 'cs__nav-item--active': activePanel === tab.id }"
            @click="activePanel = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <main class="cs__main">
          <VideoSessionRoom
            v-if="videoCreds"
            :key="`${videoCreds.sessionId}:${String(videoCreds.token || '').slice(-12)}`"
            :application-id="videoCreds.applicationId"
            :api-key="videoCreds.apiKey"
            :session-id="videoCreds.sessionId"
            :token="videoCreds.token"
            :diagnostics="videoCreds.diagnostics"
            :can-recreate-room="true"
            :local-name="localName"
            :layout="inActivityMode ? 'strip' : 'standard'"
            :compact="inActivityMode"
            class="cs__video"
            @request-recreate-room="refreshVideoToken({ recreateRoom: true })"
          />
          <div v-else class="cs__video cs__video--placeholder">
            <p>{{ videoConfigured === false ? 'Video is not configured for this environment.' : 'Loading video…' }}</p>
          </div>

          <section v-if="inActivityMode || activePanel === 'activity'" class="cs__activity">
            <ActivityHost
              :session-id="sessionId"
              :role="participantRole"
              :runtime="activityRuntime"
              :layout="isMobileLayout ? 'mobile' : 'web'"
              :provider-label="providerDisplayName"
              @runtime-updated="onRuntimeUpdated"
            >
              <template #idle>
                <ActivityLibrary
                  :activities="activities"
                  :loading="activitiesLoading"
                  :can-launch-embedded="participantRole === 'provider'"
                  @launch-embedded="launchEmbedded"
                  @launch-standalone="launchStandalone"
                />
              </template>
            </ActivityHost>
          </section>

          <section v-else-if="activePanel === 'session'" class="cs__session-home">
            <p>You are connected. Use Activities when you want a shared check-in or tool.</p>
            <button
              v-if="participantRole === 'provider'"
              type="button"
              class="cs__btn cs__btn--primary"
              @click="activePanel = 'activity'"
            >
              Open activities
            </button>
          </section>
        </main>

        <aside class="cs__side" :class="{ 'cs__side--open': sideOpen }">
          <div class="cs__side-tabs">
            <button
              type="button"
              class="cs__side-tab"
              :class="{ 'cs__side-tab--active': sideTab === 'chat' }"
              @click="sideTab = 'chat'; sideOpen = true"
            >
              Chat
            </button>
            <button
              type="button"
              class="cs__side-tab"
              :class="{ 'cs__side-tab--active': sideTab === 'notes' }"
              @click="sideTab = 'notes'; sideOpen = true"
            >
              Notes
            </button>
            <button
              v-if="isMobileLayout"
              type="button"
              class="cs__side-tab"
              @click="activePanel = 'activity'"
            >
              Activity
            </button>
          </div>

          <div v-show="sideOpen || !isMobileLayout" class="cs__side-body">
            <div v-if="sideTab === 'chat'" class="cs__chat">
              <ul class="cs__chat-list">
                <li v-for="m in chatMessages" :key="m.id" class="cs__chat-msg" :class="`cs__chat-msg--${m.senderRole}`">
                  <span class="cs__chat-role">{{ m.senderRole }}</span>
                  <span>{{ m.body }}</span>
                </li>
              </ul>
              <form class="cs__chat-form" @submit.prevent="sendChat">
                <input v-model="chatDraft" type="text" placeholder="Message…" maxlength="1000" />
                <button type="submit" class="cs__btn cs__btn--primary" :disabled="!chatDraft.trim()">Send</button>
              </form>
            </div>

            <div v-else class="cs__notes">
              <ul class="cs__notes-list">
                <li v-for="n in notes" :key="n.id" class="cs__note">
                  <span class="cs__note-vis">{{ visibilityLabel(n.visibility) }}</span>
                  <p>{{ n.body }}</p>
                </li>
              </ul>
              <form class="cs__note-form" @submit.prevent="addNote">
                <select v-if="participantRole === 'provider'" v-model="noteVisibility">
                  <option value="provider_private">Private (provider only)</option>
                  <option value="shared">Shared</option>
                </select>
                <select v-else v-model="noteVisibility">
                  <option value="shared">Shared note</option>
                  <option value="client_journal">My journal</option>
                </select>
                <textarea v-model="noteDraft" rows="3" placeholder="Write a note…" maxlength="4000" />
                <button type="submit" class="cs__btn cs__btn--primary" :disabled="!noteDraft.trim()">
                  Save note
                </button>
              </form>
            </div>
          </div>
        </aside>
      </div>

      <nav v-if="isMobileLayout" class="cs__bottom-nav" aria-label="Mobile session navigation">
        <button type="button" @click="activePanel = 'session'">Session</button>
        <button type="button" @click="activePanel = 'activity'">Activity</button>
        <button type="button" @click="sideTab = 'chat'; sideOpen = true">Chat</button>
        <button type="button" @click="sideTab = 'notes'; sideOpen = true">Notes</button>
      </nav>
    </template>

    <div v-else-if="phase === 'ended'" class="cs__ended">
      <h1>Session complete</h1>
      <p>Thank you. You can close this window.</p>
      <router-link v-if="orgSlug" class="cs__btn cs__btn--primary" :to="`/${orgSlug}`">
        Back to portal
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import VideoSessionRoom from '../../components/video/VideoSessionRoom.vue';
import ActivityHost from '../../components/counseling/ActivityHost.vue';
import ActivityLibrary from '../../components/counseling/ActivityLibrary.vue';
import * as counselingApi from '../../services/counselingApi.js';
import { launchActivity } from '../../services/launchActivity.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const sessionId = computed(() => route.params.sessionId);
const orgSlug = computed(() => route.params.organizationSlug || null);

const phase = ref('pre');
const joining = ref(false);
const preError = ref('');
const session = ref(null);
const participantRole = ref('client');
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

const localName = computed(() => auth.user?.name || auth.user?.email || 'You');
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
    await counselingApi.joinCounselingSession(sessionId.value);
    await loadSessionMeta();
    try {
      await refreshVideoToken();
      videoConfigured.value = true;
    } catch (e) {
      videoConfigured.value = false;
      console.warn('[counseling] video token unavailable', e);
    }
    startedAtMs.value = Date.now();
    phase.value = 'connected';
    // Side panels must not bounce the user back to pre-join if they fail.
    await Promise.allSettled([refreshChat(), refreshNotes(), loadActivities()]);
    startPolling();
  } catch (err) {
    phase.value = 'pre';
    preError.value = err?.response?.data?.error?.message || err?.message || 'Could not join session.';
    await startPreview();
  } finally {
    joining.value = false;
  }
}

async function loadActivities() {
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
      await Promise.all([refreshChat(), refreshRuntime()]);
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

async function confirmEnd() {
  if (!window.confirm('End this counseling session for everyone?')) return;
  await counselingApi.endCounselingSession(sessionId.value);
  stopPolling();
  phase.value = 'ended';
}

watch(inActivityMode, (v) => {
  if (v) activePanel.value = 'activity';
});

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
      return;
    }
    await startPreview();
  } catch (err) {
    preError.value = err?.response?.data?.error?.message || 'Unable to load session.';
  }
});

onBeforeUnmount(() => {
  if (mediaQuery && onMediaQueryChange) {
    mediaQuery.removeEventListener?.('change', onMediaQueryChange);
  }
  stopPreview();
  stopPolling();
});
</script>

<style scoped>
.cs {
  min-height: 100vh;
  background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 40%, #f1f5f9 100%);
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
