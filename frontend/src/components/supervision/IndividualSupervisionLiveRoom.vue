<template>
  <div class="isl" :class="{ 'isl--lobby': showWaitingRoomStage, 'isl--video-fs': videoFullscreen }">
    <header v-if="!videoFullscreen" class="isl__header">
      <div class="isl__header-left">
        <BrandingLogo size="small" />
        <div>
          <h1>{{ sessionTitle || 'Individual Supervision' }}</h1>
          <p class="isl__meta">
            <span>{{ scheduleLabel }}</span>
            <span class="isl__live">● Live</span>
          </p>
        </div>
      </div>
      <div class="isl__header-right">
        <span v-if="workspaceSaving" class="isl__save-pill">Saving…</span>
        <span v-else-if="workspaceError" class="isl__save-pill isl__save-pill--err" :title="workspaceError">Save issue</span>
        <div class="isl__menu-wrap">
          <button type="button" class="isl__ghost" :aria-expanded="viewOptionsOpen" @click="viewOptionsOpen = !viewOptionsOpen">
            {{ videoFocusLabel }}
          </button>
          <div v-if="viewOptionsOpen" class="isl__menu" role="menu">
            <button type="button" class="isl__menu-item" :class="{ on: tileFocus === 'equal' && !videoFullscreen }" role="menuitem" @click="applyViewOption('equal')">Equal tiles</button>
            <button type="button" class="isl__menu-item" :class="{ on: tileFocus === 'speaker' }" role="menuitem" @click="applyViewOption('speaker')">Speaker only</button>
            <button type="button" class="isl__menu-item" :class="{ on: tileFocus === 'remote' }" role="menuitem" @click="applyViewOption('remote')">Focus: peer</button>
            <button type="button" class="isl__menu-item" :class="{ on: tileFocus === 'local' }" role="menuitem" @click="applyViewOption('local')">Focus: you</button>
            <button type="button" class="isl__menu-item" :class="{ on: !!videoFullscreen }" role="menuitem" @click="applyViewOption('fullscreen')">Full screen videos</button>
          </div>
        </div>
        <div v-if="isSupervisor" class="isl__menu-wrap">
          <button type="button" class="isl__ghost" :class="{ on: attendanceOpen }" @click="toggleAttendance">
            Attendance
          </button>
          <div v-if="attendanceOpen" class="isl__menu isl__menu--wide" role="dialog" aria-label="Attendance">
            <MeetingAttendancePanel
              ref="attendancePanelRef"
              meeting-kind="supervision"
              :event-id="numericSessionId || supervisionSessionId"
              :live-poll="true"
              :raised-hands="raisedHandCount"
              :raised-hand-names="raisedHandNames"
              :muted-names="mutedParticipantNames"
            />
          </div>
        </div>
        <button type="button" class="isl__ghost" :class="{ on: transcriptOpen }" @click="toggleTranscript">
          Transcript
        </button>
        <span class="isl__count" title="Participants">{{ participantHint || '2' }}</span>
        <button type="button" class="btn btn-danger btn-sm" @click="$emit('leave', { endForAll: isSupervisor })">End session</button>
      </div>
    </header>

    <div
      v-if="showTranscriptionNotice"
      class="isl__transcript-banner"
      role="status"
    >
      <span class="isl__transcript-dot" aria-hidden="true" />
      <p>This session is being transcribed. Live speech may be captured and summarized for participants with access.</p>
      <button
        type="button"
        class="isl__transcript-x"
        aria-label="Dismiss transcription notice"
        @click="transcriptionNoticeDismissed = true"
      >×</button>
    </div>

    <SupervisionVideoLobbyPanel
      v-if="showLobbyPanel"
      :session-id="numericSessionId"
      :is-supervisor="isSupervisor"
    />

    <!-- Waiting room takeover -->
    <div v-if="showWaitingRoomStage" class="isl__lobby-stage">
      <SupervisionWaitingRoomStage
        :pip="prioritizeSelfView"
        :meeting-title="sessionTitle || focusTitle || 'Supervision'"
        :host-present="hostPresent"
        :host-role-label="hostRoleLabel"
        :host-status-label="hostStatusLabel"
        :goals="waitingRoomGoals"
        :agenda="waitingRoomAgenda"
        @show-waiting-room="prioritizeSelfView = false"
      />
      <aside
        v-if="!prioritizeSelfView"
        class="isl__lobby-rail"
        aria-label="Session preview"
      >
        <div
          class="isl__self isl__self--pip"
          @click="onSelfStageClick"
        >
          <SupervisionVideoRoom
            v-if="token && vonageSessionId && applicationId"
            :token="token"
            :vonage-session-id="vonageSessionId"
            :room-sid="vonageSessionId"
            :application-id="applicationId"
            :api-key="applicationId"
            :session-id="supervisionSessionId"
            :is-host="isSupervisor"
            :diagnostics="diagnostics"
            :local-display-name="localDisplayName"
            :local-role-label="localRoleLabel"
            :local-profile-photo-url="localProfilePhotoUrl"
            layout="standard"
            :promote-local-when-alone="true"
            @disconnected="$emit('disconnected')"
            @connected="onVideoConnected"
            @meeting-ended="$emit('meeting-ended', $event)"
          />
          <span class="isl__pip-label">You · tap to enlarge</span>
        </div>
      </aside>
      <div
        v-else
        class="isl__self isl__self--featured"
        @click="onSelfStageClick"
      >
        <SupervisionVideoRoom
          v-if="token && vonageSessionId && applicationId"
          :token="token"
          :vonage-session-id="vonageSessionId"
          :room-sid="vonageSessionId"
          :application-id="applicationId"
          :api-key="applicationId"
          :session-id="supervisionSessionId"
          :is-host="isSupervisor"
          :diagnostics="diagnostics"
          :local-display-name="localDisplayName"
          :local-role-label="localRoleLabel"
          :local-profile-photo-url="localProfilePhotoUrl"
          layout="standard"
          @disconnected="$emit('disconnected')"
          @connected="onVideoConnected"
          @meeting-ended="$emit('meeting-ended', $event)"
        />
      </div>
    </div>

    <!-- Admitted session workspace -->
    <div v-else class="isl__workspace">
      <section
        class="isl__card isl__card--video"
        :class="{
          'isl__card--collapsed': sectionState.video === 'collapsed',
          'isl__card--expanded': sectionState.video === 'expanded'
        }"
      >
        <div class="isl__card-head">
          <h2>Video</h2>
          <div class="isl__card-actions">
            <button type="button" class="isl__ghost" @click="setVideoFocus('equal')">Equal</button>
            <button type="button" class="isl__ghost" @click="toggleSection('video')">
              {{ sectionState.video === 'collapsed' ? 'Expand' : sectionState.video === 'expanded' ? 'Shrink' : 'Collapse' }}
            </button>
          </div>
        </div>
        <div v-show="sectionState.video !== 'collapsed'" class="isl__video-body">
          <SupervisionVideoRoom
            v-if="token && vonageSessionId && applicationId"
            ref="videoRoomRef"
            :token="token"
            :vonage-session-id="vonageSessionId"
            :room-sid="vonageSessionId"
            :application-id="applicationId"
            :api-key="applicationId"
            :session-id="supervisionSessionId"
            :is-host="isSupervisor"
            :is-host-or-cohost="isSupervisor"
            mute-others-mode="host"
            :diagnostics="diagnostics"
            :local-display-name="localDisplayName"
            :local-role-label="localRoleLabel"
            :local-profile-photo-url="localProfilePhotoUrl"
            layout="standard"
            allow-tile-focus
            show-layout-controls
            v-model:tile-focus="tileFocus"
            v-model:video-fullscreen="videoFullscreen"
            :activity-notice="videoFullscreenActivityNotice"
            :raised-hands-notice="videoFullscreenHandsNotice"
            @disconnected="$emit('disconnected')"
            @connected="onVideoConnected"
            @hands-map-change="onHandsMapChange"
            @audio-map-change="onAudioMapChange"
            @participant-left="onParticipantLeft"
            @meeting-ended="$emit('meeting-ended', $event)"
            @activity-notice-click="onFullscreenActivityClick"
          />
        </div>
      </section>

      <div
        v-show="!videoFullscreen"
        class="isl__main-grid"
        :class="{
          'isl__main-grid--video-only': !sessionDetailsOpen && !discussionOpen,
          'isl__main-grid--single': (sessionDetailsOpen && !discussionOpen) || (!sessionDetailsOpen && discussionOpen)
        }"
      >
        <section
          v-if="sessionDetailsOpen"
          class="isl__card isl__card--focus"
        >
          <div class="isl__card-head">
            <h2>Session Focus</h2>
            <div class="isl__card-actions">
              <button type="button" class="isl__ghost" @click="editingGoals = !editingGoals">
                {{ editingGoals ? 'Done' : 'Edit goals' }}
              </button>
              <button type="button" class="isl__ghost" @click="sessionDetailsOpen = false">
                Collapse
              </button>
            </div>
          </div>
          <div class="isl__card-body">
            <input
              v-if="editingGoals"
              v-model="focusTitle"
              class="isl__title-input"
              type="text"
              placeholder="Session focus title"
              @change="persistWorkspace"
            />
            <h3 v-else>{{ focusTitle || 'Case Consultation & Clinical Support' }}</h3>
            <div class="isl__focus-split">
              <div class="isl__focus-col">
                <p class="isl__label">Goals for today</p>
                <ul class="isl__checklist">
                  <li v-for="goal in goals" :key="goal.id">
                    <label>
                      <input v-model="goal.done" type="checkbox" @change="persistWorkspace" />
                  <input
                    v-if="editingGoals"
                    v-model="goal.text"
                    class="isl__inline-input"
                    type="text"
                    placeholder="Goal"
                    @input="persistWorkspace"
                    @change="persistWorkspace"
                  />
                  <span v-else :class="{ 'isl__done': goal.done }">{{ goal.text || 'Untitled goal' }}</span>
                    </label>
                    <button v-if="editingGoals" type="button" class="isl__icon-btn" @click="removeGoal(goal.id)">×</button>
                  </li>
                </ul>
                <button v-if="editingGoals" type="button" class="isl__link" @click="addGoal">+ Add goal</button>
              </div>
              <div class="isl__focus-col isl__focus-col--agenda">
                <p class="isl__label">Agenda</p>
                <MeetingAgendaPanel
                  v-if="numericSessionId || supervisionSessionId"
                  meeting-type="supervision_session"
                  :meeting-id="numericSessionId || supervisionSessionId"
                  :can-add-item="true"
                  :embedded="true"
                  :live="true"
                  theme="dark"
                />
              </div>
            </div>
          </div>
        </section>

        <SupervisionDiscussionSidebar
          v-if="discussionOpen"
          class="isl__sidebar"
          roomy
          hide-agenda
          hide-transcript
          theme="dark"
          v-model:side-tab="sideTab"
          v-model:discussion-sub-tab="discussionSubTab"
          v-model:topic-draft="topicDraft"
          v-model:chat-draft="chatDraft"
          v-model:personal-notes="sidebarNotes"
          :session-id="numericSessionId || supervisionSessionId"
          :is-supervisor="isSupervisor"
          :can-control-transcript="false"
          :transcript-paused="transcriptPaused"
          :topics="topics"
          :chat-messages="chatMessages"
          :error="discussionError"
          :topic-busy="topicBusy"
          :chat-busy="chatBusy"
          :transcript-hint="transcriptHint"
          :transcript-preview="transcriptCombined"
          @post-topic="postTopic"
          @post-chat="postChat"
          @upvote="upvote"
        />
      </div>
    </div>

    <aside v-if="transcriptOpen && !showWaitingRoomStage" class="isl__transcript-drawer" aria-label="Live transcript">
      <div class="isl__transcript-drawer-head">
        <h2>Transcript</h2>
        <div class="isl__card-actions">
          <template v-if="isSupervisor">
            <button type="button" class="isl__ghost" @click="onTranscriptPauseResume">
              {{ transcriptPaused ? 'Resume' : 'Pause' }}
            </button>
            <button type="button" class="isl__ghost" @click="onTranscriptStop">Stop</button>
          </template>
          <button type="button" class="isl__ghost" @click="transcriptOpen = false">Close</button>
        </div>
      </div>
      <p v-if="transcriptHint" class="isl__label">{{ transcriptHint }}</p>
      <pre v-if="transcriptCombined" class="isl__transcript-pre">{{ transcriptCombined }}</pre>
      <p v-else class="isl__label">Transcript will appear here once speech is detected.</p>
    </aside>

    <footer v-if="!showWaitingRoomStage && !videoFullscreen" class="isl__dock">
      <div class="isl__dock-left">
        <button type="button" class="isl__dock-btn" :class="{ active: discussionOpen }" @click="toggleDiscussion">
          {{ discussionOpen ? 'Hide discussion' : 'Discussion' }}
        </button>
        <button type="button" class="isl__dock-btn" :class="{ active: sessionDetailsOpen }" @click="sessionDetailsOpen = !sessionDetailsOpen">
          {{ sessionDetailsOpen ? 'Hide session details' : 'Session details' }}
        </button>
      </div>
      <div class="isl__dock-right">
        <span v-if="raisedHandCount" class="isl__hands-pill" title="Hands raised">
          ✋ {{ raisedHandCount }}
        </span>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import BrandingLogo from '../BrandingLogo.vue';
import SupervisionVideoRoom from './SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from './SupervisionVideoLobbyPanel.vue';
import SupervisionWaitingRoomStage from './SupervisionWaitingRoomStage.vue';
import SupervisionDiscussionSidebar from './SupervisionDiscussionSidebar.vue';
import MeetingAttendancePanel from '../meetings/MeetingAttendancePanel.vue';
import MeetingAgendaPanel from '../meetings/MeetingAgendaPanel.vue';
import {
  supervisionLiveRoomProps,
  useSupervisionLiveSession
} from '../../composables/useSupervisionLiveSession';

const props = defineProps(supervisionLiveRoomProps);
const emit = defineEmits(['leave', 'connected', 'meeting-ended', 'disconnected']);

const transcriptionNoticeDismissed = ref(false);

const {
  numericSessionId,
  showLobbyPanel,
  showWaitingRoomStage,
  prioritizeSelfView,
  onSelfStageClick,
  sideTab,
  discussionSubTab,
  topicDraft,
  chatDraft,
  discussionError,
  topicBusy,
  chatBusy,
  personalNotes,
  topics,
  chatMessages,
  transcriptHint,
  transcriptCapturing,
  transcriptPaused,
  pauseLiveTranscript,
  resumeLiveTranscript,
  applyTranscriptRoomStop,
  liveTranscriptPreview,
  sessionTranscriptPreview,
  onVideoConnected,
  postTopic,
  postChat,
  upvote
} = useSupervisionLiveSession(props, emit, { enablePresentation: false });

const showTranscriptionNotice = computed(() => (
  !transcriptionNoticeDismissed.value
  && !props.isInLobby
  && !!props.token
  && transcriptCapturing.value
));

const videoRoomRef = ref(null);
const tileFocus = ref('equal');
const videoFullscreen = ref(false);
const videoFullscreenActivityNotice = ref('');
let fullscreenNoticeTimer = null;
const editingGoals = ref(false);
const discussionOpen = ref(true);
const sessionDetailsOpen = ref(true);
const viewOptionsOpen = ref(false);
const attendanceOpen = ref(false);
const transcriptOpen = ref(false);
const raisedHandCount = ref(0);
const raisedHandNames = ref([]);
const mutedParticipantNames = ref([]);
const attendancePanelRef = ref(null);
const sidebarNotes = ref('');

const sectionState = reactive({
  video: 'default',
  focus: 'default'
});

const focusTitle = ref('Case Consultation & Clinical Support');
const goals = ref([]);
const actionItems = ref([]);
const workspaceLoading = ref(false);
const workspaceSaving = ref(false);
const workspaceError = ref('');
const workspaceReady = ref(false);
let workspaceSaveTimer = null;

// Discussion defaults to chat / polls / Q&A (agenda lives in Session Focus).
discussionSubTab.value = 'chat';
sideTab.value = 'discussion';

const transcriptCombined = computed(() => {
  const base = sessionTranscriptPreview.value;
  const live = liveTranscriptPreview.value;
  if (base && live) return `${base}\n${live}`;
  return base || live || '';
});

const waitingAgendaItems = ref([]);

const waitingRoomGoals = computed(() => {
  const fromProps = Array.isArray(props.waitingGoals) ? props.waitingGoals : [];
  if (fromProps.length) return fromProps;
  return goals.value || [];
});
const waitingRoomAgenda = computed(() => {
  const fromProps = Array.isArray(props.waitingAgenda) ? props.waitingAgenda : [];
  if (fromProps.length) return fromProps;
  return waitingAgendaItems.value || [];
});
async function loadWaitingAgenda() {
  const sid = numericSessionId.value || Number(props.supervisionSessionId || 0);
  if (!sid) return;
  try {
    const { data } = await api.get('/meeting-agendas', {
      params: { meetingType: 'supervision_session', meetingId: sid },
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    waitingAgendaItems.value = Array.isArray(data?.items) ? data.items : [];
  } catch {
    waitingAgendaItems.value = [];
  }
}

const scheduleLabel = computed(() => {
  const meta = String(props.sessionMeta || '').trim();
  if (meta && meta.toLowerCase() !== 'individual') return meta;
  return 'Individual supervision';
});

const videoFocusLabel = computed(() => {
  if (videoFullscreen.value) return 'Full screen';
  if (tileFocus.value === 'speaker') return 'Speaker only';
  if (tileFocus.value === 'local') return 'Focus: you';
  if (tileFocus.value === 'remote') return 'Focus: peer';
  if (tileFocus.value === 'collapsed') return 'Videos collapsed';
  return 'View options';
});

function cleanParticipantLabel(raw) {
  const parts = String(raw || '')
    .split(/[·|]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^(you|host|participant|supervisor|supervisee|guest|co-?host)$/i.test(p));
  return parts.length ? parts[parts.length - 1] : String(raw || '').trim();
}

function applyViewOption(opt) {
  viewOptionsOpen.value = false;
  if (opt === 'fullscreen') {
    videoFullscreen.value = true;
    if (tileFocus.value === 'collapsed') tileFocus.value = 'equal';
    return;
  }
  videoFullscreen.value = false;
  setVideoFocus(opt);
}

function toggleAttendance() {
  attendanceOpen.value = !attendanceOpen.value;
  if (attendanceOpen.value) {
    viewOptionsOpen.value = false;
    transcriptOpen.value = false;
    attendancePanelRef.value?.load?.({ quiet: true });
  }
}

function toggleTranscript() {
  transcriptOpen.value = !transcriptOpen.value;
  if (transcriptOpen.value) {
    viewOptionsOpen.value = false;
    attendanceOpen.value = false;
  }
}

const videoFullscreenHandsNotice = computed(() => {
  if (!raisedHandCount.value) return '';
  const names = (raisedHandNames.value || []).filter(Boolean).slice(0, 2).join(', ');
  if (names && raisedHandCount.value <= 2) return names;
  if (names) return `${names} +${raisedHandCount.value - 2}`;
  return `${raisedHandCount.value} hand${raisedHandCount.value === 1 ? '' : 's'} raised`;
});

function onFullscreenActivityClick() {
  videoFullscreen.value = false;
  videoFullscreenActivityNotice.value = '';
}

function onLiveActivityNotice(payload) {
  const text = String(payload?.text || '').trim();
  if (!text || !videoFullscreen.value) return;
  videoFullscreenActivityNotice.value = text;
  if (fullscreenNoticeTimer) clearTimeout(fullscreenNoticeTimer);
  fullscreenNoticeTimer = setTimeout(() => { videoFullscreenActivityNotice.value = ''; }, 8000);
}

function normalizeChecklist(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, idx) => ({
    id: String(item?.id || `item-${idx + 1}`),
    text: String(item?.text || '').trim(),
    done: !!item?.done
  })).filter((item) => item.text);
}

async function loadWorkspace() {
  const sid = numericSessionId.value || Number(props.supervisionSessionId || 0);
  if (!sid) {
    workspaceReady.value = true;
    return;
  }
  workspaceLoading.value = true;
  workspaceError.value = '';
  try {
    const [artifactResp, noteResp] = await Promise.all([
      api.get(`/supervision/sessions/${sid}/artifacts`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      }),
      api.get(`/supervision/sessions/${sid}/personal-note`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      }).catch(() => ({ data: { note: '' } }))
    ]);
    const artifact = artifactResp?.data?.artifact || artifactResp?.data || {};
    if (artifact.focusTitle || artifact.focus_title) {
      focusTitle.value = String(artifact.focusTitle || artifact.focus_title || focusTitle.value);
    }
    goals.value = normalizeChecklist(artifact.goals || artifact.goals_json);
    actionItems.value = normalizeChecklist(artifact.actionItems || artifact.action_items_json);
    personalNotes.value = String(noteResp?.data?.note || '');
  } catch (e) {
    workspaceError.value = e?.response?.data?.error?.message || e?.message || 'Could not load session workspace.';
  } finally {
    workspaceLoading.value = false;
    workspaceReady.value = true;
  }
}

async function saveWorkspaceNow() {
  const sid = numericSessionId.value || Number(props.supervisionSessionId || 0);
  if (!sid || !workspaceReady.value) return;
  const payloadGoals = (goals.value || [])
    .map((g) => ({
      id: String(g?.id || ''),
      text: String(g?.text || '').trim(),
      done: !!g?.done
    }))
    .filter((g) => g.text);
  const emptyGoalDrafts = (goals.value || []).filter((g) => !String(g?.text || '').trim());
  workspaceSaving.value = true;
  workspaceError.value = '';
  try {
    await Promise.all([
      api.post(`/supervision/sessions/${sid}/artifacts`, {
        focusTitle: focusTitle.value || '',
        goals: payloadGoals
      }, { skipGlobalLoading: true, skipAuthRedirect: true }),
      api.put(`/supervision/sessions/${sid}/personal-note`, {
        noteText: personalNotes.value || ''
      }, { skipGlobalLoading: true, skipAuthRedirect: true })
    ]);
    // Keep in-progress empty rows so "+ Add goal" doesn't wipe the draft.
    if (emptyGoalDrafts.length) {
      goals.value = [...payloadGoals, ...emptyGoalDrafts];
    } else {
      goals.value = payloadGoals;
    }
  } catch (e) {
    workspaceError.value = e?.response?.data?.error?.message || e?.message || 'Could not save session workspace.';
  } finally {
    workspaceSaving.value = false;
  }
}

function persistWorkspace() {
  if (!workspaceReady.value) return;
  if (workspaceSaveTimer) clearTimeout(workspaceSaveTimer);
  workspaceSaveTimer = setTimeout(() => {
    void saveWorkspaceNow();
  }, 700);
}

function toggleSection(key) {
  const cur = sectionState[key];
  if (cur === 'collapsed') sectionState[key] = 'default';
  else if (cur === 'expanded') sectionState[key] = 'default';
  else if (key === 'video' && cur === 'default') sectionState[key] = 'expanded';
  else sectionState[key] = 'collapsed';

  if (key === 'video' && sectionState.video === 'collapsed') {
    tileFocus.value = 'collapsed';
  } else if (key === 'video' && tileFocus.value === 'collapsed') {
    tileFocus.value = 'equal';
  }
}

function setVideoFocus(mode) {
  tileFocus.value = mode;
  if (mode === 'collapsed') sectionState.video = 'collapsed';
  else if (sectionState.video === 'collapsed') sectionState.video = 'default';
}

function addGoal() {
  editingGoals.value = true;
  goals.value.push({ id: `g-${Date.now()}`, text: '', done: false });
  // Don't autosave empty drafts — persist when the supervisee types.
}
function removeGoal(id) {
  goals.value = goals.value.filter((g) => g.id !== id);
  persistWorkspace();
}

function toggleDiscussion() {
  discussionOpen.value = !discussionOpen.value;
  if (discussionOpen.value) {
    sideTab.value = 'discussion';
    discussionSubTab.value = 'chat';
  }
}

function onHandsMapChange(payload) {
  const map = payload?.byConnection || payload || {};
  const names = payload?.nameByConnection || {};
  raisedHandCount.value = Object.keys(map).filter((k) => map[k]).length;
  raisedHandNames.value = Object.keys(map)
    .filter((k) => map[k])
    .map((k) => names[k])
    .filter(Boolean);
}

function onAudioMapChange(payload) {
  const map = payload?.mutedByConnection || {};
  const names = payload?.nameByConnection || {};
  mutedParticipantNames.value = Object.keys(map)
    .filter((k) => map[k])
    .map((k) => cleanParticipantLabel(names[k]))
    .filter(Boolean);
}

function onParticipantLeft() {
  attendancePanelRef.value?.load?.({ quiet: true });
}

async function onTranscriptPauseResume() {
  if (transcriptPaused.value) {
    await resumeLiveTranscript();
    videoRoomRef.value?.signalTranscriptControl?.({ action: 'resume' });
    try {
      await api.post(`/supervision/sessions/${numericSessionId.value || props.supervisionSessionId}/transcript-control`, {
        action: 'resume'
      }, { skipGlobalLoading: true });
    } catch { /* ignore */ }
  } else {
    await pauseLiveTranscript();
    videoRoomRef.value?.signalTranscriptControl?.({ action: 'pause' });
    try {
      await api.post(`/supervision/sessions/${numericSessionId.value || props.supervisionSessionId}/transcript-control`, {
        action: 'pause'
      }, { skipGlobalLoading: true });
    } catch { /* ignore */ }
  }
}

async function onTranscriptStop() {
  const meta = {
    stoppedByName: props.localDisplayName || 'Supervisor',
    stoppedAt: new Date().toISOString()
  };
  try {
    const { data } = await api.post(`/supervision/sessions/${numericSessionId.value || props.supervisionSessionId}/transcript-control`, {
      action: 'stop',
      displayName: meta.stoppedByName
    }, { skipGlobalLoading: true });
    if (data?.stoppedByName) meta.stoppedByName = data.stoppedByName;
    if (data?.stoppedAt) meta.stoppedAt = data.stoppedAt;
  } catch { /* ignore */ }
  await applyTranscriptRoomStop(meta);
  videoRoomRef.value?.signalTranscriptControl?.({ action: 'stop', ...meta });
}

watch(personalNotes, () => persistWorkspace());
watch(tileFocus, (v) => {
  if (v === 'collapsed') sectionState.video = 'collapsed';
  else if (sectionState.video === 'collapsed') sectionState.video = 'default';
});

onMounted(() => {
  void loadWorkspace();
  void loadWaitingAgenda();
});

onUnmounted(() => {
  if (workspaceSaveTimer) clearTimeout(workspaceSaveTimer);
  if (fullscreenNoticeTimer) clearTimeout(fullscreenNoticeTimer);
  void saveWorkspaceNow();
});

defineExpose({
  disconnect: (...args) => videoRoomRef.value?.disconnect?.(...args)
});
</script>

<style scoped>
.isl {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  /* Match group supervision: tenant secondary wash → deep base. */
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--agency-secondary-color, #1d2633) 88%, #000),
    #0c1018
  );
  color: #eef2f8;
  padding: 12px 16px 84px;
  box-sizing: border-box;
  font-family: "Segoe UI", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif;
}
.isl--lobby { padding-bottom: 20px; }
.isl--video-fs {
  padding: 0;
  background: #070a10;
}
.isl__transcript-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(6, 95, 70, 0.28);
  border: 1px solid rgba(52, 211, 153, 0.45);
  color: #d1fae5;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.isl__transcript-banner p {
  margin: 0;
  flex: 1;
  line-height: 1.35;
  font-size: 0.88rem;
}
.isl__transcript-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.25);
  flex-shrink: 0;
}
.isl__transcript-x {
  border: 0;
  background: transparent;
  color: #a7f3d0;
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.isl__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.isl__header-left, .isl__header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.isl__header h1 {
  margin: 0;
  font-size: clamp(1.05rem, 2.2vw, 1.35rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: #f4faf6;
}
.isl__meta {
  margin: 2px 0 0;
  color: rgba(220, 245, 230, 0.78);
  font-size: 0.85rem;
  display: flex;
  gap: 10px;
  align-items: center;
}
.isl__live {
  color: color-mix(in srgb, var(--agency-primary-color, #3dce7a) 70%, #3dce7a);
  font-weight: 700;
}
.isl__count {
  opacity: 0.9;
  font-size: 0.9rem;
  min-width: 1.5rem;
  text-align: center;
}
.isl__save-pill {
  font-size: 0.75rem;
  font-weight: 700;
  color: #a7f3d0;
  opacity: 0.9;
}
.isl__save-pill--err { color: #fecaca; }
.isl__ghost {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #dce3f0;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
}
.isl__ghost:hover,
.isl__ghost.on { background: rgba(255, 255, 255, 0.1); }
.isl__menu-wrap { position: relative; }
.isl__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  min-width: 180px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(18, 22, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
  display: grid;
  gap: 2px;
}
.isl__menu--wide {
  min-width: min(520px, calc(100vw - 32px));
  max-height: min(70vh, 520px);
  overflow: auto;
  padding: 10px;
}
.isl__menu-item {
  border: 0;
  background: transparent;
  color: #e2e8f0;
  text-align: left;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
}
.isl__menu-item:hover,
.isl__menu-item.on {
  background: color-mix(in srgb, var(--agency-primary-color, #3dce7a) 28%, transparent);
}

.isl__lobby-stage {
  position: relative;
  flex: 1;
  min-height: min(68vh, 620px);
  border-radius: 16px;
  overflow: hidden;
  background: #0b1210;
}
.isl__lobby-rail {
  position: absolute;
  top: 18px;
  right: 18px;
  bottom: 18px;
  z-index: 5;
  width: min(46%, 420px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  pointer-events: none;
}
.isl__lobby-prep {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.92);
  color: #134e3a;
  border-radius: 18px;
  padding: 12px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  max-height: 42%;
  overflow: auto;
}
.isl__lobby-prep-kicker {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #3f6b58;
}
.isl__lobby-prep-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.isl__lobby-prep-list li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: start;
  font-size: 0.86rem;
  line-height: 1.35;
  color: #134e3a;
}
.isl__lobby-prep-tag {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #166534;
  background: #dcfce7;
  border-radius: 999px;
  padding: 2px 7px;
  margin-top: 1px;
}
.isl__self { position: relative; z-index: 3; height: 100%; }
.isl__self--pip {
  position: relative;
  width: 100%;
  height: min(58vh, 480px);
  min-height: 280px;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.4);
  z-index: 5;
  pointer-events: auto;
  flex: 1 1 auto;
  background: #0f1117;
}
.isl__self--pip :deep(.supervision-video-room),
.isl__self--pip :deep(.vsr) {
  min-height: 0 !important;
  height: 100%;
}
.isl__self--pip :deep(.vsr__viewport),
.isl__self--pip :deep(.vsr__stage),
.isl__self--pip :deep(.vsr__tile),
.isl__self--pip :deep(.vsr__tile--local),
.isl__self--pip :deep(.vsr__tile--solo) {
  min-height: 0 !important;
  height: 100% !important;
  max-height: none !important;
}
.isl__self--pip :deep(.vsr__controls) {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 8;
  width: auto;
  max-width: none;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  background: rgba(10, 14, 22, 0.82);
  border-radius: 12px;
}
.isl__self--pip :deep(.vsr__ctrl),
.isl__self--pip :deep(.vsr__voice-iso),
.isl__self--pip :deep(.vsr__react-btn) {
  font-size: 0.72rem;
  padding: 0.35rem 0.55rem;
}
.isl__self--featured { position: absolute; inset: 0; z-index: 2; }
.isl__pip-label {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 6;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  pointer-events: none;
}
@media (max-width: 900px) {
  .isl__lobby-rail {
    width: min(72%, 320px);
    top: auto;
    bottom: 10px;
    right: 10px;
    max-height: 62%;
  }
  .isl__self--pip {
    height: min(42vh, 320px);
    min-height: 220px;
  }
  .isl__lobby-prep { max-height: 36%; }
}

.isl__workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.isl__card {
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 12px 14px;
  transition: flex 0.2s ease, min-height 0.2s ease, opacity 0.2s ease;
}
.isl__card--collapsed {
  padding-bottom: 8px;
  opacity: 0.88;
}
.isl__card--expanded {
  border-color: color-mix(in srgb, var(--agency-primary-color, #3dce7a) 55%, transparent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
}
.isl__card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.isl__card-head h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}
.isl__card-head small {
  opacity: 0.65;
  font-weight: 500;
}
.isl__card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.isl__card-body h3 {
  margin: 0 0 10px;
  font-size: 1.35rem;
  line-height: 1.2;
}
.isl__label {
  margin: 0 0 8px;
  color: #9aa6bc;
  font-size: 0.8rem;
  font-weight: 650;
}
.isl__card--video { min-height: 0; }
.isl__card--video.isl__card--expanded .isl__video-body {
  min-height: min(58vh, 560px);
}
.isl__card--video:not(.isl__card--collapsed) .isl__video-body {
  min-height: min(34vh, 320px);
}
.isl__video-body {
  border-radius: 12px;
  overflow: hidden;
  background: #0f1117;
}
.isl__video-body :deep(.supervision-video-room),
.isl__video-body :deep(.vsr),
.isl__video-body :deep(.vsr__stage) {
  min-height: inherit;
}

.isl__main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.95fr);
  grid-template-areas: "focus sidebar";
  gap: 12px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.isl__main-grid--video-only {
  display: none;
}
.isl__main-grid--single {
  grid-template-columns: 1fr;
  grid-template-areas: "focus";
}
.isl__main-grid--single .isl__sidebar {
  grid-area: focus;
}
.isl__card--focus { grid-area: focus; }
.isl__sidebar {
  grid-area: sidebar;
  min-height: 320px;
  align-self: stretch;
}
.isl__focus-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.isl__focus-col--agenda :deep(.agenda-item-title),
.isl__focus-col--agenda :deep(.agenda-empty),
.isl__focus-col--agenda :deep(.muted),
.isl__focus-col--agenda :deep(.agenda-section-head h3) {
  color: #e2e8f0 !important;
}
.isl__focus-col--agenda :deep(.agenda-item) {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
}
.isl__transcript-drawer {
  position: fixed;
  top: 72px;
  right: 16px;
  z-index: 55;
  width: min(420px, calc(100vw - 24px));
  max-height: min(70vh, 560px);
  overflow: auto;
  background: rgba(18, 22, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}
.isl__transcript-drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.isl__transcript-drawer-head h2 {
  margin: 0;
  font-size: 0.95rem;
}
.isl__transcript-pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #e2e8f0;
  font-family: inherit;
}

.isl__checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.isl__checklist li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.isl__checklist label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.isl__checklist input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #22c55e;
}
.isl__done { color: #9aa6bc; text-decoration: line-through; }
.isl__inline-input,
.isl__title-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 8px;
  padding: 7px 10px;
}
.isl__title-input {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 10px;
}
.isl__textarea {
  width: 100%;
  min-height: 110px;
  resize: vertical;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.45;
}
.isl__link {
  margin-top: 10px;
  border: 0;
  background: none;
  color: var(--agency-primary-color, #3dce7a);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
}
.isl__icon-btn {
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}

.isl__dock {
  position: fixed;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  width: min(920px, calc(100vw - 24px));
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 18px;
  background: rgba(18, 22, 32, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  z-index: 40;
}
.isl__dock-left, .isl__dock-right, .isl__dock-center {
  display: flex;
  align-items: center;
  gap: 8px;
}
.isl__dock-left { justify-content: flex-start; }
.isl__dock-center { justify-content: center; }
.isl__dock-right { justify-content: flex-end; }
.isl__dock-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #eef2f8;
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.isl__dock-btn.active {
  background: color-mix(in srgb, var(--agency-primary-color, #3dce7a) 28%, transparent);
  border-color: color-mix(in srgb, var(--agency-primary-color, #3dce7a) 55%, transparent);
}
.isl__hands-pill {
  font-size: 0.78rem;
  font-weight: 700;
  background: rgba(234, 179, 8, 0.25);
  color: #fde68a;
  border-radius: 999px;
  padding: 4px 10px;
}
.isl__react {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  font-size: 1rem;
}
.isl__reaction-toast {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  font-size: 1.6rem;
  animation: isl-pop 1.4s ease;
}
@keyframes isl-pop {
  0% { opacity: 0; transform: translate(-50%, 8px) scale(0.8); }
  20% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
  100% { opacity: 0; transform: translate(-50%, -12px) scale(1); }
}

@media (max-width: 1100px) {
  .isl__main-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      "focus"
      "sidebar";
  }
  .isl__focus-split { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .isl { padding-bottom: 120px; }
  .isl__dock {
    grid-template-columns: 1fr;
    width: calc(100vw - 16px);
  }
  .isl__dock-left, .isl__dock-center, .isl__dock-right {
    justify-content: center;
    flex-wrap: wrap;
  }
}
</style>
