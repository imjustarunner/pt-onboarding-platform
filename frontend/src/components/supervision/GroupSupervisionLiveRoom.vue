<template>
  <div class="gsl">
    <header class="gsl__header">
      <div class="gsl__header-left">
        <BrandingLogo size="small" class="gsl__logo" />
        <div>
          <h1>{{ sessionTitle || (isIndividualSession ? 'Supervision' : 'Group Supervision') }}</h1>
          <p class="gsl__meta">
            <span v-if="sessionMeta">{{ sessionMeta }}</span>
            <span class="gsl__live">● Live</span>
          </p>
        </div>
      </div>
      <div class="gsl__header-right">
        <button
          v-if="showPresentationStage && (isSupervisor || isPresenter)"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="viewAsAttendee = !viewAsAttendee"
        >
          {{ viewAsAttendee ? 'Exit attendee view' : 'View as attendee' }}
        </button>
        <span class="gsl__count" title="Participants">{{ participantHint }}</span>
        <button type="button" class="btn btn-danger btn-sm" @click="$emit('leave')">Leave session</button>
      </div>
    </header>

    <SupervisionVideoLobbyPanel
      v-if="showLobbyPanel"
      :session-id="supervisionSessionId"
      :is-supervisor="isSupervisor"
    />

    <div v-if="isInLobby && !isSupervisor" class="gsl__lobby-banner">
      Waiting for the supervisor to admit you…
    </div>

    <!-- Individual: large video + discussion side panel -->
    <div v-if="isIndividualSession" class="gsl__body gsl__body--individual">
      <div class="gsl__video-pane gsl__video-pane--hero">
        <SupervisionVideoRoom
          v-if="token && vonageSessionId && applicationId"
          :token="token"
          :vonage-session-id="vonageSessionId"
          :room-sid="vonageSessionId"
          :application-id="applicationId"
          :api-key="applicationId"
          :session-title="''"
          :session-id="supervisionSessionId"
          :is-host="isSupervisor"
          :diagnostics="diagnostics"
          :local-display-name="localDisplayName"
          :local-role-label="localRoleLabel"
          layout="standard"
          @disconnected="$emit('leave')"
          @connected="onVideoConnected"
        />
      </div>
      <aside class="gsl__sidebar gsl__sidebar--roomy">
        <div class="gsl__tabs">
          <button type="button" :class="{ active: sideTab === 'discussion' }" @click="sideTab = 'discussion'">Discussion</button>
          <button type="button" :class="{ active: sideTab === 'notes' }" @click="sideTab = 'notes'">Notes</button>
        </div>
        <div v-if="sideTab === 'discussion'" class="gsl__discussion">
          <form class="gsl__ask" @submit.prevent="postQuestion">
            <input v-model="questionDraft" type="text" class="input" placeholder="Ask a question…" />
            <button type="submit" class="btn btn-primary btn-sm" :disabled="!questionDraft.trim()">Send</button>
          </form>
          <ul class="gsl__feed">
            <li v-for="item in questions" :key="item.id">
              <button type="button" class="gsl__vote" @click="upvote(item)">{{ item.upvotes || 0 }}</button>
              <div>
                <p>{{ item.text }}</p>
                <small>{{ item.author }} · {{ item.timeLabel }}</small>
                <span v-if="item.pinned" class="gsl__pinned">Pinned by facilitator</span>
              </div>
            </li>
            <li v-if="!questions.length" class="gsl__empty">No questions yet. Be the first to ask.</li>
          </ul>
        </div>
        <div v-else class="gsl__notes-side">
          <textarea v-model="personalNotes" class="input" rows="12" placeholder="Your private session notes…" />
        </div>
      </aside>
    </div>

    <!-- Group: strip video + presentation stage + sidebar -->
    <template v-else>
      <div class="gsl__video-strip">
        <SupervisionVideoRoom
          v-if="token && vonageSessionId && applicationId"
          :token="token"
          :vonage-session-id="vonageSessionId"
          :room-sid="vonageSessionId"
          :application-id="applicationId"
          :api-key="applicationId"
          :session-title="''"
          :session-id="supervisionSessionId"
          :is-host="isSupervisor"
          :diagnostics="diagnostics"
          :local-display-name="localDisplayName"
          :local-role-label="localRoleLabel"
          layout="strip"
          @disconnected="$emit('leave')"
          @connected="onVideoConnected"
        />
      </div>

      <div class="gsl__main">
        <section class="gsl__stage-wrap">
          <div class="gsl__stage">
            <template v-if="externalEmbedUrl">
              <iframe
                class="gsl__embed"
                :src="externalEmbedUrl"
                title="Presentation"
                allowfullscreen
              />
            </template>
            <template v-else-if="currentSlide">
              <div class="gsl__slide">
                <p class="gsl__slide-kicker">{{ currentSlide.section_key || 'Case Presentation' }}</p>
                <h2>{{ currentSlide.title }}</h2>
                <div class="gsl__slide-body" v-html="slideBodyHtml" />
              </div>
            </template>
            <div v-else class="gsl__stage-empty">Presentation will appear here</div>
            <div class="gsl__stage-controls">
              <span>{{ slidePositionLabel }}</span>
              <div v-if="canControlSlides" class="gsl__stage-nav">
                <button type="button" class="btn btn-secondary btn-sm" @click="prevSlide">←</button>
                <button type="button" class="btn btn-secondary btn-sm" @click="nextSlide">→</button>
              </div>
            </div>
          </div>

          <div class="gsl__below">
            <div v-if="showPresenterNotes" class="gsl__card">
              <h3>Presenter notes <small>visible to you</small></h3>
              <p>{{ currentSlide?.presenter_notes || 'No notes for this slide.' }}</p>
            </div>
            <div class="gsl__card">
              <h3>Case at a glance</h3>
              <dl class="gsl__case">
                <div><dt>Client</dt><dd>{{ caseSummary.client || '—' }}</dd></div>
                <div><dt>Presenting concerns</dt><dd>{{ caseSummary.presentingConcerns || '—' }}</dd></div>
                <div><dt>Duration</dt><dd>{{ caseSummary.duration || '—' }}</dd></div>
                <div><dt>Setting</dt><dd>{{ caseSummary.setting || '—' }}</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <aside class="gsl__sidebar">
          <div class="gsl__tabs">
            <button type="button" :class="{ active: sideTab === 'discussion' }" @click="sideTab = 'discussion'">Discussion</button>
            <button type="button" :class="{ active: sideTab === 'notes' }" @click="sideTab = 'notes'">Notes</button>
          </div>
          <div v-if="sideTab === 'discussion'" class="gsl__discussion">
            <form class="gsl__ask" @submit.prevent="postQuestion">
              <input v-model="questionDraft" type="text" class="input" placeholder="Ask a question…" />
              <button type="submit" class="btn btn-primary btn-sm" :disabled="!questionDraft.trim()">Send</button>
            </form>
            <ul class="gsl__feed">
              <li v-for="item in questions" :key="item.id">
                <button type="button" class="gsl__vote" @click="upvote(item)">{{ item.upvotes || 0 }}</button>
                <div>
                  <p>{{ item.text }}</p>
                  <small>{{ item.author }} · {{ item.timeLabel }}</small>
                  <span v-if="item.pinned" class="gsl__pinned">Pinned by facilitator</span>
                </div>
              </li>
              <li v-if="!questions.length" class="gsl__empty">No questions yet. Be the first to ask.</li>
            </ul>
          </div>
          <div v-else class="gsl__notes-side">
            <textarea v-model="personalNotes" class="input" rows="12" placeholder="Your private session notes…" />
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
import BrandingLogo from '../BrandingLogo.vue';
import SupervisionVideoRoom from './SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from './SupervisionVideoLobbyPanel.vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  supervisionSessionId: { type: [Number, String], required: true },
  token: { type: String, default: '' },
  vonageSessionId: { type: String, default: '' },
  applicationId: { type: String, default: '' },
  diagnostics: { type: Object, default: null },
  sessionTitle: { type: String, default: '' },
  sessionMeta: { type: String, default: '' },
  isSupervisor: { type: Boolean, default: false },
  isPresenter: { type: Boolean, default: false },
  isInLobby: { type: Boolean, default: false },
  lobbyEnabledForSession: { type: Boolean, default: false },
  participantHint: { type: String, default: '' },
  joinIdentity: { type: String, default: '' },
  localDisplayName: { type: String, default: '' },
  localRoleLabel: { type: String, default: '' }
});

const emit = defineEmits(['leave', 'connected']);
const authStore = useAuthStore();

const viewAsAttendee = ref(false);
const sideTab = ref('discussion');
const questionDraft = ref('');
const personalNotes = ref('');
const presentation = ref(null);
const slides = ref([]);
const currentSlide = ref(null);
const activity = ref([]);
const pollTimer = ref(null);
const lifecyclePosted = ref(false);

const sessionTypeNorm = computed(() => String(props.sessionMeta || '').trim().toLowerCase());
const isIndividualSession = computed(() => {
  const t = sessionTypeNorm.value;
  return !t || t === 'individual' || t === '1:1' || t === 'one_on_one';
});
const showPresentationStage = computed(() => !isIndividualSession.value);

const showLobbyPanel = computed(() =>
  props.isSupervisor && props.lobbyEnabledForSession && !props.isInLobby
);
const canControlSlides = computed(() =>
  showPresentationStage.value
  && !viewAsAttendee.value
  && (props.isSupervisor || props.isPresenter)
  && slides.value.length > 0
);
const showPresenterNotes = computed(() =>
  showPresentationStage.value
  && !viewAsAttendee.value
  && (props.isPresenter || props.isSupervisor)
);
const caseSummary = computed(() => presentation.value?.caseSummary || {});
const slidePositionLabel = computed(() => {
  if (!slides.value.length) return '0 / 0';
  const idx = slides.value.findIndex((s) => Number(s.id) === Number(currentSlide.value?.id));
  return `${Math.max(idx, 0) + 1} / ${slides.value.length}`;
});
const slideBodyHtml = computed(() => {
  const raw = String(currentSlide.value?.body_html || '');
  if (!raw) return '<p>No content yet.</p>';
  if (raw.includes('<')) return raw;
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${l.replace(/^[-•]\s*/, '• ')}</p>`)
    .join('');
});
const externalEmbedUrl = computed(() => {
  const src = String(presentation.value?.sourceType || '');
  const url = String(presentation.value?.externalUrl || '').trim();
  if (src === 'external_link' && url) {
    if (url.includes('/edit')) return url.replace('/edit', '/preview');
    return url;
  }
  return '';
});
const questions = computed(() => {
  return (activity.value || [])
    .filter((a) => String(a.activity_type || a.activityType || '') === 'question')
    .map((a) => {
      const payload = typeof a.payload_json === 'string'
        ? JSON.parse(a.payload_json || '{}')
        : (a.payload || a.payload_json || {});
      return {
        id: a.id,
        text: payload.text || payload.question || '',
        author: payload.authorName || 'Participant',
        timeLabel: a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
        upvotes: Number(payload.upvotes || 0),
        pinned: !!payload.pinned
      };
    })
    .reverse();
});

async function postLifecycle(eventType) {
  const sid = props.supervisionSessionId;
  if (!sid) return;
  // Guests cannot hit authenticated lifecycle; skip quietly.
  if (!authStore.isAuthenticated && !authStore.user?.id) return;
  try {
    await api.post(`/supervision/sessions/${sid}/meeting-lifecycle`, {
      eventType,
      // Unique per browser visit so join/leave pairs don't collide on the unique key.
      clientSessionKey: `web-${sid}-${authStore.user?.id || 0}-${props.joinIdentity || 'auth'}`
    }, { skipGlobalLoading: true, skipAuthRedirect: true });
  } catch {
    // best-effort
  }
}

function onVideoConnected() {
  if (!lifecyclePosted.value) {
    lifecyclePosted.value = true;
    // Single join event (do not also post "opened" — that left unmatched opens and inflated hours).
    postLifecycle('joined');
  }
  emit('connected');
}

async function refreshPresentation() {
  const sid = props.supervisionSessionId;
  if (!sid || props.isInLobby || isIndividualSession.value) return;
  try {
    const { data } = await api.get(`/supervision/sessions/${sid}/presentation-state`, {
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    presentation.value = data.presentation || null;
    slides.value = data.presentation?.slides || [];
    currentSlide.value = data.currentSlide || slides.value[0] || null;
  } catch {
    // ignore until presentation exists (guests / no slides)
  }
}

async function refreshActivity() {
  const sid = props.supervisionSessionId;
  if (!sid || props.isInLobby) return;
  try {
    const { data } = await api.get(`/supervision/sessions/${sid}/activity`, { skipGlobalLoading: true });
    const rows = data?.activity || data?.items || data || [];
    activity.value = Array.isArray(rows) ? rows : [];
  } catch {
    activity.value = [];
  }
}

async function setSlide(slide) {
  if (!slide || !canControlSlides.value) return;
  currentSlide.value = slide;
  try {
    await api.put(`/supervision/sessions/${props.supervisionSessionId}/presentation-state`, {
      activePresentationId: presentation.value?.id,
      currentSlideId: slide.id,
      currentSlideOrder: slide.slide_order
    }, { skipGlobalLoading: true });
  } catch {
    // ignore
  }
}

function prevSlide() {
  const idx = slides.value.findIndex((s) => Number(s.id) === Number(currentSlide.value?.id));
  if (idx > 0) setSlide(slides.value[idx - 1]);
}

function nextSlide() {
  const idx = slides.value.findIndex((s) => Number(s.id) === Number(currentSlide.value?.id));
  if (idx >= 0 && idx < slides.value.length - 1) setSlide(slides.value[idx + 1]);
}

async function postQuestion() {
  const text = questionDraft.value.trim();
  if (!text) return;
  try {
    await api.post(`/supervision/sessions/${props.supervisionSessionId}/activity`, {
      activityType: 'question',
      payload: {
        text,
        authorName: `${authStore.user?.firstName || ''} ${authStore.user?.lastName || ''}`.trim() || 'Participant',
        upvotes: 0
      }
    });
    questionDraft.value = '';
    await refreshActivity();
  } catch {
    // ignore
  }
}

async function upvote(item) {
  try {
    await api.post(`/supervision/sessions/${props.supervisionSessionId}/activity`, {
      activityType: 'question',
      payload: {
        text: item.text,
        authorName: item.author,
        upvotes: (item.upvotes || 0) + 1,
        replyToId: item.id
      }
    });
    await refreshActivity();
  } catch {
    // ignore
  }
}

watch(() => props.isInLobby, (inLobby) => {
  if (!inLobby) {
    refreshPresentation();
    refreshActivity();
  }
});

onMounted(async () => {
  await refreshPresentation();
  await refreshActivity();
  pollTimer.value = setInterval(() => {
    refreshPresentation();
    refreshActivity();
  }, 5000);
});

onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value);
  if (lifecyclePosted.value) postLifecycle('left');
});
</script>

<style scoped>
.gsl {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, color-mix(in srgb, var(--agency-secondary-color, #1d2633) 88%, #000), #0c1018);
  color: #eef2f8;
  padding: 12px 16px 20px;
}
.gsl__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.gsl__header-left, .gsl__header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gsl__header h1 {
  margin: 0;
  font-size: 1.15rem;
}
.gsl__meta {
  margin: 2px 0 0;
  color: #a8b3c7;
  font-size: 0.85rem;
  display: flex;
  gap: 10px;
  align-items: center;
}
.gsl__live {
  color: #3dce7a;
  font-weight: 600;
}
.gsl__count {
  opacity: 0.85;
  font-size: 0.9rem;
}
.gsl__lobby-banner {
  background: color-mix(in srgb, var(--agency-primary-color, var(--primary)) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--agency-primary-color, var(--primary)) 40%, transparent);
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 10px;
}
.gsl__video-strip {
  min-height: 160px;
  margin-bottom: 12px;
}
.gsl__body--individual {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 16px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.gsl__video-pane--hero {
  min-height: min(62vh, 560px);
  display: flex;
  flex-direction: column;
}
.gsl__video-pane--hero :deep(.vsr) {
  flex: 1;
  min-height: min(62vh, 560px);
}
.gsl__video-pane--hero :deep(.vsr__stage) {
  min-height: min(52vh, 480px);
  grid-template-columns: 1fr;
}
.gsl__video-pane--hero :deep(.vsr__tile) {
  min-height: min(48vh, 440px);
}
/* Alone or 1:1 duo: equal full tiles — never force a tiny corner self-view. */
.gsl__video-pane--hero :deep(.vsr__stage--solo),
.gsl__video-pane--hero :deep(.vsr__stage--duo) {
  grid-template-columns: 1fr;
  min-height: min(52vh, 480px);
}
.gsl__video-pane--hero :deep(.vsr__stage--duo) {
  grid-template-columns: 1fr 1fr;
}
.gsl__video-pane--hero :deep(.vsr__stage--solo .vsr__tile--local),
.gsl__video-pane--hero :deep(.vsr__tile--solo),
.gsl__video-pane--hero :deep(.vsr__stage--duo .vsr__tile--local),
.gsl__video-pane--hero :deep(.vsr__tile--duo),
.gsl__video-pane--hero :deep(.vsr__stage--duo .vsr__tile--remote) {
  position: relative;
  right: auto;
  bottom: auto;
  width: 100%;
  max-width: none;
  min-height: min(48vh, 440px);
  height: 100%;
  box-shadow: none;
}
.gsl__sidebar--roomy {
  min-height: min(62vh, 560px);
}
.gsl__sidebar--roomy .gsl__discussion {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.gsl__sidebar--roomy .gsl__feed {
  min-height: 180px;
}
.gsl__sidebar--roomy .gsl__empty {
  white-space: normal;
  line-height: 1.45;
}
.gsl__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  flex: 1;
  min-height: 0;
}
@media (max-width: 900px) {
  .gsl__body--individual {
    grid-template-columns: 1fr;
  }
  .gsl__video-pane--hero,
  .gsl__video-pane--hero :deep(.vsr) {
    min-height: 42vh;
  }
}
.gsl__stage {
  position: relative;
  background: #121722;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  min-height: 320px;
  padding: 22px;
  overflow: hidden;
}
.gsl__slide-kicker {
  margin: 0 0 6px;
  color: var(--agency-primary-color, var(--primary));
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.75rem;
  font-weight: 700;
}
.gsl__slide h2 {
  margin: 0 0 14px;
  font-size: 1.6rem;
}
.gsl__stage-empty {
  color: #8893a8;
  display: grid;
  place-items: center;
  min-height: 240px;
}
.gsl__embed {
  width: 100%;
  min-height: 360px;
  border: 0;
  border-radius: 8px;
  background: #000;
}
.gsl__stage-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  color: #a8b3c7;
}
.gsl__stage-nav { display: flex; gap: 8px; }
.gsl__below {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
.gsl__card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px;
}
.gsl__card h3 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.gsl__card small {
  opacity: 0.65;
  font-weight: 400;
}
.gsl__case {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
}
.gsl__case dt {
  font-size: 0.75rem;
  color: #93a0b8;
}
.gsl__case dd {
  margin: 2px 0 0;
}
.gsl__sidebar {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.gsl__tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}
.gsl__tabs button {
  background: none;
  border: 0;
  color: #a8b3c7;
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.gsl__tabs button.active {
  color: #fff;
  border-bottom-color: var(--agency-primary-color, var(--primary));
}
.gsl__ask {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.gsl__feed {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gsl__feed li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.15);
}
.gsl__vote {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: inherit;
  border-radius: 8px;
  cursor: pointer;
}
.gsl__pinned {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--agency-primary-color, var(--primary));
}
.gsl__empty { opacity: 0.7; }
.input {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 8px;
  padding: 8px 10px;
}
@media (max-width: 980px) {
  .gsl__main, .gsl__below, .gsl__case {
    grid-template-columns: 1fr;
  }
}
</style>
