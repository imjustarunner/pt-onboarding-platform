<template>
  <div class="twilio-video-room">
    <div class="video-room-header">
      <span class="video-room-title">{{ sessionTitle || roomName || 'Video room' }}</span>
      <button type="button" class="btn btn-danger btn-sm" :disabled="disconnecting" @click="disconnect">
        {{ disconnecting ? 'Leaving…' : (room ? 'Leave' : 'Close') }}
      </button>
    </div>
    <div v-if="error" class="video-room-error">{{ error }}</div>
    <div v-else-if="connecting" class="video-room-placeholder">Connecting…</div>
    <div v-else-if="room" class="video-room-content">
      <div v-if="sharedScreenTrack" class="video-room-screenshare">
        <div ref="screenShareEl" class="video-track video-track-screenshare" />
        <span class="participant-identity">{{ sharedScreenIdentity }}</span>
      </div>
      <div class="video-room-grid" :class="gridSizeClass">
        <div
          class="video-track-wrap video-track-local"
          :class="{ 'dominant-speaker': dominantSpeakerSid === localParticipantSid }"
        >
          <div v-if="localVideoTrack && !cameraMuted" ref="localVideoEl" class="video-track" />
          <div v-else class="video-placeholder">
            <BrandingLogo size="small" class="placeholder-logo" />
            <span>You (camera off)</span>
          </div>
          <span class="participant-identity">You</span>
          <span
            v-if="networkQualityBySid[localParticipantSid] != null"
            class="network-quality-badge"
            :class="networkQualityClass(networkQualityBySid[localParticipantSid])"
            :title="networkQualityLabel(networkQualityBySid[localParticipantSid])"
          >
            {{ networkQualityLabel(networkQualityBySid[localParticipantSid]) }}
          </span>
        </div>
        <div
          v-for="p in sortedRemoteParticipants"
          :key="p.sid"
          class="video-track-wrap"
          :class="{ 'dominant-speaker': dominantSpeakerSid === p.sid }"
        >
          <div ref="(el) => setRemoteVideoEl(p.sid, el)" class="video-track" />
          <span class="participant-identity">{{ p.identity }}</span>
          <span
            v-if="networkQualityBySid[p.sid] != null"
            class="network-quality-badge"
            :class="networkQualityClass(networkQualityBySid[p.sid])"
            :title="networkQualityLabel(networkQualityBySid[p.sid])"
          >
            {{ networkQualityLabel(networkQualityBySid[p.sid]) }}
          </span>
        </div>
        <div v-if="remoteParticipants.length === 0" class="video-track-wrap video-placeholder-wrap">
          <div class="video-placeholder">
            <BrandingLogo size="small" class="placeholder-logo" />
            <span>Waiting for others to join…</span>
          </div>
        </div>
      </div>
      <div class="video-room-controls">
        <button
          type="button"
          class="control-btn"
          :class="{ muted: cameraMuted }"
          :title="cameraMuted ? 'Turn camera on' : 'Turn camera off'"
          @click="toggleCamera"
        >
          <span class="control-icon">📷</span>
          <span>{{ cameraMuted ? 'Camera off' : 'Camera on' }}</span>
        </button>
        <button
          type="button"
          class="control-btn"
          :class="{ muted: micMuted }"
          :title="micMuted ? 'Unmute microphone' : 'Mute microphone'"
          @click="toggleMic"
        >
          <span class="control-icon">{{ micMuted ? '🔇' : '🎤' }}</span>
          <span>{{ micMuted ? 'Mic off' : 'Mic on' }}</span>
        </button>
        <button
          type="button"
          class="control-btn"
          :class="{ active: screenTrack }"
          :title="screenTrack ? 'Stop sharing screen' : 'Share screen'"
          :disabled="!screenShareSupported"
          @click="toggleScreenShare"
        >
          <span class="control-icon">🖥️</span>
          <span>{{ screenTrack ? 'Stop share' : 'Share screen' }}</span>
        </button>
        <button
          v-if="showRecordHostOnlyToggle"
          type="button"
          class="control-btn"
          :class="{ active: recordHostOnly }"
          :title="recordHostOnly ? 'Recording only your screen/audio' : 'Recording all participants'"
          :disabled="recordingRulesLoading"
          @click="toggleRecordHostOnly"
        >
          <span class="control-icon">{{ recordHostOnly ? '📹' : '📽️' }}</span>
          <span>{{ recordingRulesLoading ? 'Updating…' : (recordHostOnly ? 'Host only' : 'Record all') }}</span>
        </button>
        <button
          type="button"
          class="control-btn"
          :class="{ active: chatPanelOpen }"
          title="Chat, polls & Q&A"
          @click="toggleChatPanel"
        >
          <span class="control-icon">💬</span>
          <span>Chat</span>
          <span v-if="chatUnreadCount > 0" class="chat-badge">{{ chatUnreadCount }}</span>
        </button>
        <button
          v-if="agendaAvailable"
          type="button"
          class="control-btn"
          :class="{ active: agendaPanelOpen }"
          title="Agenda – check off items, add new ones"
          @click="toggleAgendaPanel"
        >
          <span class="control-icon">📋</span>
          <span>Agenda</span>
        </button>
      </div>
      <div v-if="room && agendaPanelOpen" class="video-room-agenda-panel">
        <MeetingAgendaPanel
          :meeting-type="agendaMeetingType"
          :meeting-id="agendaMeetingId"
          :can-add-item="true"
          @close="agendaPanelOpen = false"
          @updated="() => {}"
        />
      </div>
      <div v-if="room && chatPanelOpen" class="video-room-chat-panel">
        <div class="chat-panel-tabs">
          <button type="button" class="chat-tab" :class="{ active: chatTab === 'chat' }" @click="chatTab = 'chat'">Chat</button>
          <button type="button" class="chat-tab" :class="{ active: chatTab === 'polls' }" @click="chatTab = 'polls'">Polls</button>
          <button type="button" class="chat-tab" :class="{ active: chatTab === 'qa' }" @click="chatTab = 'qa'">Q&A</button>
        </div>
        <div v-if="chatTab === 'chat'" class="chat-tab-content">
          <div ref="chatMessagesEl" class="chat-messages">
            <div v-for="m in chatMessages" :key="m.id" class="chat-msg" :class="{ 'chat-msg-own': m.isOwn }">
              <span class="chat-msg-sender">{{ m.senderLabel }}</span>
              <span class="chat-msg-text">{{ m.text }}</span>
            </div>
          </div>
          <form class="chat-input-form" @submit.prevent="sendChatMessage">
            <input v-model="chatInput" type="text" placeholder="Type a message…" maxlength="2000" class="chat-input" />
            <button type="submit" class="btn btn-primary btn-sm" :disabled="!chatInput.trim()">Send</button>
          </form>
        </div>
        <div v-if="chatTab === 'polls'" class="chat-tab-content">
          <div v-if="isHost" class="poll-create">
            <input v-model="pollQuestion" type="text" placeholder="Poll question" class="chat-input" />
            <input v-model="pollOptionsText" type="text" placeholder="Options (comma-separated)" class="chat-input" />
            <button type="button" class="btn btn-primary btn-sm" :disabled="!pollQuestion.trim() || !pollOptionsText.trim()" @click="createPoll">Create poll</button>
          </div>
          <div class="chat-messages">
            <div v-for="p in polls" :key="p.id" class="poll-card">
              <div class="poll-question">{{ p.question }}</div>
              <div class="poll-options">
                <button
                  v-for="(opt, idx) in p.options"
                  :key="idx"
                  type="button"
                  class="poll-option-btn"
                  :class="{ selected: p.userVote === idx }"
                  :disabled="p.closed"
                  @click="votePoll(p, idx)"
                >
                  {{ opt }} <span v-if="p.votes && p.votes[idx] != null">({{ p.votes[idx] }})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="chatTab === 'qa'" class="chat-tab-content">
          <div class="chat-messages">
            <div v-for="q in qaItems" :key="q.id" class="qa-item">
              <div class="qa-question"><strong>Q:</strong> {{ q.text }}</div>
              <div v-if="q.answer" class="qa-answer"><strong>A:</strong> {{ q.answer }}</div>
              <div v-else-if="isHost" class="qa-answer-form">
                <input v-model="q.answerDraft" type="text" placeholder="Type answer…" class="chat-input" />
                <button type="button" class="btn btn-primary btn-sm" @click="submitAnswer(q)">Submit</button>
              </div>
            </div>
          </div>
          <form class="chat-input-form" @submit.prevent="submitQuestion">
            <input v-model="questionInput" type="text" placeholder="Ask a question…" maxlength="500" class="chat-input" />
            <button type="submit" class="btn btn-primary btn-sm" :disabled="!questionInput.trim()">Ask</button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch, nextTick, markRaw } from 'vue';
import { connect, LocalVideoTrack, LocalDataTrack, createLocalVideoTrack, createLocalAudioTrack } from 'twilio-video';
import BrandingLogo from '../BrandingLogo.vue';
import MeetingAgendaPanel from '../meetings/MeetingAgendaPanel.vue';
import api from '../../services/api';

const props = defineProps({
  token: { type: String, required: true },
  roomName: { type: String, default: '' },
  sessionTitle: { type: String, default: '' },
  sessionId: { type: [Number, String], default: null },
  eventId: { type: [Number, String], default: null },
  isHost: { type: Boolean, default: false }
});

const emit = defineEmits(['disconnected']);

const room = ref(null);
const localVideoTrack = ref(null);
const localAudioTrack = ref(null);
const cameraMuted = ref(false);
const micMuted = ref(false);
const remoteParticipants = ref([]);
const dominantSpeakerSid = ref(null);
const localParticipantSid = ref(null);
const networkQualityBySid = ref({});
const connecting = ref(true);
const disconnecting = ref(false);
const error = ref('');
const localVideoEl = ref(null);
const remoteVideoEls = ref({});
const transcriptLines = ref([]);
const screenTrack = ref(null);
const screenShareEl = ref(null);
const sharedScreenTrack = ref(null);
const sharedScreenIdentity = ref('');
const recordHostOnly = ref(false);
const recordingRulesLoading = ref(false);
const chatPanelOpen = ref(false);
const agendaPanelOpen = ref(false);
const chatTab = ref('chat');
const chatInput = ref('');
const chatMessages = ref([]);
const chatUnreadCount = ref(0);
const localDataTrack = ref(null);
const pollQuestion = ref('');
const pollOptionsText = ref('');
const polls = ref([]);
const questionInput = ref('');
const qaItems = ref([]);
const chatMessagesEl = ref(null);

const screenShareSupported = computed(() =>
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.getDisplayMedia != null
);

const showRecordHostOnlyToggle = computed(() =>
  Boolean(props.eventId && props.isHost)
);

const agendaMeetingType = computed(() => {
  if (props.sessionId) return 'supervision_session';
  if (props.eventId) return 'provider_schedule_event';
  return null;
});
const agendaMeetingId = computed(() => Number(props.sessionId || props.eventId || 0) || null);
const agendaAvailable = computed(() => !!agendaMeetingType.value && !!agendaMeetingId.value);

const sortedRemoteParticipants = computed(() => {
  const list = [...remoteParticipants.value];
  const dominant = dominantSpeakerSid.value;
  if (!dominant) return list;
  const idx = list.findIndex((p) => p.sid === dominant);
  if (idx <= 0) return list;
  const [speaker] = list.splice(idx, 1);
  return [speaker, ...list];
});

const totalParticipants = computed(() => 1 + remoteParticipants.value.length);
const gridSizeClass = computed(() => {
  const n = totalParticipants.value;
  if (n <= 2) return 'grid-cols-2';
  if (n <= 4) return 'grid-cols-2';
  if (n <= 9) return 'grid-cols-3';
  if (n <= 16) return 'grid-cols-4';
  return 'grid-cols-5';
});

function setRemoteVideoEl(sid, el) {
  if (el) remoteVideoEls.value[sid] = el;
}

function networkQualityLabel(level) {
  if (level == null) return '';
  const labels = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' };
  return labels[level] ?? '';
}

function networkQualityClass(level) {
  if (level == null) return '';
  if (level <= 2) return 'nq-poor';
  if (level <= 3) return 'nq-fair';
  return 'nq-good';
}

function attachTrack(track, container) {
  if (!track || !container) return;
  track.attach(container);
}

function detachTrack(track) {
  if (!track) return;
  try {
    track.detach().forEach((el) => el.remove());
  } catch {
    // ignore
  }
}

async function postTranscriptToBackend(text) {
  if (!text || !String(text).trim()) return;
  const sid = props.sessionId ? Number(props.sessionId) : null;
  const eid = props.eventId ? Number(props.eventId) : null;
  const payload = { transcript: String(text).trim() };
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (eid) {
        await api.post(`/team-meetings/${eid}/client-transcript`, payload);
      } else if (sid) {
        await api.post(`/supervision/sessions/${sid}/client-transcript`, payload);
      }
      return;
    } catch (e) {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.warn('[SupervisionTwilioVideoRoom] Failed to post transcript after retries:', e?.message);
      }
    }
  }
}

function activityApiBase() {
  const sid = props.sessionId ? Number(props.sessionId) : null;
  const eid = props.eventId ? Number(props.eventId) : null;
  if (eid) return `/team-meetings/${eid}/activity`;
  if (sid) return `/supervision/sessions/${sid}/activity`;
  return null;
}

async function persistActivity(activityType, payload) {
  const base = activityApiBase();
  if (!base) return null;
  try {
    const resp = await api.post(base, { activityType, payload });
    return resp?.data?.id ?? null;
  } catch (e) {
    console.warn('[SupervisionTwilioVideoRoom] Failed to persist activity:', e?.message);
    return null;
  }
}

async function loadActivity() {
  const base = activityApiBase();
  if (!base) return;
  try {
    const resp = await api.get(base);
    const list = resp?.data?.activity || [];
    for (const a of list) {
      applyActivity(a, false);
    }
  } catch (e) {
    console.warn('[SupervisionTwilioVideoRoom] Failed to load activity:', e?.message);
  }
}

function applyActivity(a, isOwn) {
  const id = `activity-${a.id}-${Date.now()}`;
  if (a.activityType === 'chat') {
    chatMessages.value.push({
      id,
      text: a.payload?.text || '',
      senderLabel: a.participantIdentity?.replace(/^user-/, 'User ') || 'Unknown',
      isOwn
    });
    if (!chatPanelOpen.value) chatUnreadCount.value++;
  } else if (a.activityType === 'poll') {
    polls.value.push({
      id: a.payload?.id ?? a.id,
      question: a.payload?.question || '',
      options: a.payload?.options || [],
      votes: {},
      userVote: null,
      closed: false
    });
  } else if (a.activityType === 'poll_vote') {
    const p = polls.value.find((x) => String(x.id) === String(a.payload?.pollId));
    if (p && a.payload?.optionIndex != null) {
      p.votes = { ...p.votes, [a.payload.optionIndex]: (p.votes[a.payload.optionIndex] || 0) + 1 };
    }
  } else if (a.activityType === 'question') {
    qaItems.value.push({
      id: a.payload?.id ?? a.id,
      text: a.payload?.text || '',
      answer: null,
      answerDraft: ''
    });
  } else if (a.activityType === 'answer') {
    const q = qaItems.value.find((x) => String(x.id) === String(a.payload?.inReplyToId));
    if (q) q.answer = a.payload?.text || '';
  }
}

function setupDataTrackListeners(room) {
  const handleMessage = (msg, participant) => {
    try {
      const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
      const participantIdentity = participant?.identity || 'unknown';
      applyActivity(
        {
          id: `dt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          participantIdentity,
          activityType: data?.type || 'chat',
          payload: data || {}
        },
        false
      );
    } catch {
      // plain text chat
      applyActivity(
        {
          id: `dt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          participantIdentity: participant?.identity || 'unknown',
          activityType: 'chat',
          payload: { text: String(msg) }
        },
        false
      );
    }
  };

  room.participants.forEach((participant) => {
    participant.dataTracks.forEach((pub) => {
      if (pub.isSubscribed && pub.trackName === 'chat') {
        pub.track.on('message', (msg) => handleMessage(msg, participant));
      }
    });
  });

  room.on('trackSubscribed', (track, publication, participant) => {
    if (track.kind === 'data' && track.name === 'chat') {
      track.on('message', (msg) => handleMessage(msg, participant));
    }
  });
}

function sendChatMessage() {
  const text = String(chatInput.value || '').trim();
  if (!text || !localDataTrack.value) return;
  const payload = { type: 'chat', text };
  localDataTrack.value.send(JSON.stringify(payload));
  chatInput.value = '';
  applyActivity(
    { id: `local-${Date.now()}`, participantIdentity: room.value?.localParticipant?.identity || 'You', activityType: 'chat', payload: { text } },
    true
  );
  persistActivity('chat', { text });
  nextTick(() => {
    if (chatMessagesEl.value) chatMessagesEl.value.scrollTop = chatMessagesEl.value.scrollHeight;
  });
}

async function createPoll() {
  const question = String(pollQuestion.value || '').trim();
  const options = String(pollOptionsText.value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!question || !options.length || !localDataTrack.value) return;
  const id = await persistActivity('poll', { question, options });
  const payload = { type: 'poll', id: id || `poll-${Date.now()}`, question, options };
  localDataTrack.value.send(JSON.stringify(payload));
  pollQuestion.value = '';
  pollOptionsText.value = '';
  polls.value.push({ id: payload.id, question, options, votes: {}, userVote: null, closed: false });
}

function votePoll(poll, optionIndex) {
  if (poll.userVote != null) return;
  const payload = { type: 'poll_vote', pollId: poll.id, optionIndex };
  if (localDataTrack.value) localDataTrack.value.send(JSON.stringify(payload));
  poll.userVote = optionIndex;
  poll.votes = { ...poll.votes, [optionIndex]: (poll.votes[optionIndex] || 0) + 1 };
  persistActivity('poll_vote', { pollId: poll.id, optionIndex });
}

function submitQuestion() {
  const text = String(questionInput.value || '').trim();
  if (!text || !localDataTrack.value) return;
  const id = `q-${Date.now()}`;
  const payload = { type: 'question', id, text };
  localDataTrack.value.send(JSON.stringify(payload));
  questionInput.value = '';
  qaItems.value.push({ id, text, answer: null, answerDraft: '' });
  persistActivity('question', { id, text });
}

async function submitAnswer(q) {
  const text = String(q.answerDraft || '').trim();
  if (!text || !localDataTrack.value) return;
  const payload = { type: 'answer', inReplyToId: q.id, text };
  localDataTrack.value.send(JSON.stringify(payload));
  q.answer = text;
  q.answerDraft = '';
  persistActivity('answer', { inReplyToId: q.id, text });
}

function toggleChatPanel() {
  chatPanelOpen.value = !chatPanelOpen.value;
  if (chatPanelOpen.value) agendaPanelOpen.value = false;
}
function toggleAgendaPanel() {
  agendaPanelOpen.value = !agendaPanelOpen.value;
  if (agendaPanelOpen.value) chatPanelOpen.value = false;
}

watch(chatPanelOpen, (open) => {
  if (open) chatUnreadCount.value = 0;
});

function isValidToken(t) {
  const s = String(t || '').trim();
  return s.length > 50 && !/^(undefined|null)$/i.test(s);
}

async function connectRoom() {
  if (!isValidToken(props.token)) {
    error.value = 'No token provided. The backend may have failed to generate a token. Check the Network tab for GET /api/supervision/sessions/:id/video-token.';
    connecting.value = false;
    return;
  }
  try {
    connecting.value = true;
    error.value = '';
    transcriptLines.value = [];
    chatMessages.value = [];
    polls.value = [];
    qaItems.value = [];

    const chatDataTrack = new LocalDataTrack({ name: 'chat' });
    localDataTrack.value = chatDataTrack;

    const r = await connect(props.token, {
      name: props.roomName,
      audio: true,
      video: true,
      tracks: [chatDataTrack],
      receiveTranscriptions: true,
      dominantSpeaker: true,
      networkQuality: { local: 1, remote: 1 },
      bandwidthProfile: {
        video: {
          mode: 'collaboration',
          trackSwitchOffMode: 'predicted'
        }
      }
    });
    room.value = markRaw(r);
    localParticipantSid.value = r.localParticipant?.sid ?? null;

    r.on('transcription', (ev) => {
      if (ev?.transcription && ev.partial_results === false) {
        transcriptLines.value = [...transcriptLines.value, ev.transcription];
      }
    });

    const syncMutedFromTracks = () => {
      const vt = localVideoTrack.value;
      const at = localAudioTrack.value;
      cameraMuted.value = !vt || !vt.isEnabled;
      micMuted.value = !at || !at.isEnabled;
    };
    const applyLocalTracks = () => {
      r.localParticipant.videoTracks.forEach((pub) => {
        if (pub.track) {
          localVideoTrack.value = pub.track;
          pub.track.on('enabled', syncMutedFromTracks);
          pub.track.on('disabled', syncMutedFromTracks);
        }
      });
      r.localParticipant.audioTracks.forEach((pub) => {
        if (pub.track) {
          localAudioTrack.value = pub.track;
          pub.track.on('enabled', syncMutedFromTracks);
          pub.track.on('disabled', syncMutedFromTracks);
        }
      });
      syncMutedFromTracks();
    };
    applyLocalTracks();
    r.localParticipant.on('trackPublished', (publication) => {
      if (publication.track) {
        if (publication.kind === 'video') {
          localVideoTrack.value = publication.track;
          publication.track.on('enabled', syncMutedFromTracks);
          publication.track.on('disabled', syncMutedFromTracks);
        }
        if (publication.kind === 'audio') {
          localAudioTrack.value = publication.track;
          publication.track.on('enabled', syncMutedFromTracks);
          publication.track.on('disabled', syncMutedFromTracks);
        }
        syncMutedFromTracks();
      }
    });
    r.localParticipant.on('trackUnsubscribed', (track) => {
      if (track.kind === 'video' && localVideoTrack.value === track) localVideoTrack.value = null;
      if (track.kind === 'audio' && localAudioTrack.value === track) localAudioTrack.value = null;
      syncMutedFromTracks();
    });

    const isScreenTrack = (track) =>
      track?.name?.toLowerCase().includes('screen') || track?.mediaStreamTrack?.label?.toLowerCase().includes('screen');

    const addParticipant = (participant) => {
      if (participant.identity === r.localParticipant.identity) return;
      remoteParticipants.value = [
        ...remoteParticipants.value.filter((p) => p.sid !== participant.sid),
        { sid: participant.sid, identity: participant.identity }
      ];
      participant.tracks.forEach((pub) => {
        if (pub.track && pub.kind === 'video') {
          if (isScreenTrack(pub.track)) {
            sharedScreenTrack.value = pub.track;
            sharedScreenIdentity.value = participant.identity;
          } else {
            setTimeout(() => {
              const el = remoteVideoEls.value[participant.sid];
              if (el) attachTrack(pub.track, el);
            }, 100);
          }
        }
      });
      participant.on('trackSubscribed', (track) => {
        if (track.kind === 'video') {
          if (isScreenTrack(track)) {
            sharedScreenTrack.value = track;
            sharedScreenIdentity.value = participant.identity;
          } else {
            setTimeout(() => {
              const el = remoteVideoEls.value[participant.sid];
              if (el) attachTrack(track, el);
            }, 100);
          }
        }
      });
      participant.on('trackUnsubscribed', (track) => {
        if (isScreenTrack(track) && sharedScreenTrack.value === track) {
          sharedScreenTrack.value = null;
          sharedScreenIdentity.value = '';
        }
      });
    };

    r.on('dominantSpeakerChanged', (participant) => {
      dominantSpeakerSid.value = participant?.sid ?? null;
    });

    const updateNetworkQuality = (participant) => {
      const level = participant?.networkQualityLevel ?? null;
      const sid = participant?.sid;
      if (sid != null) {
        networkQualityBySid.value = { ...networkQualityBySid.value, [sid]: level };
      }
    };
    updateNetworkQuality(r.localParticipant);
    r.localParticipant.on('networkQualityLevelChanged', () => updateNetworkQuality(r.localParticipant));
    r.participants.forEach((p) => {
      updateNetworkQuality(p);
      p.on('networkQualityLevelChanged', () => updateNetworkQuality(p));
    });
    r.on('participantConnected', (p) => {
      updateNetworkQuality(p);
      p.on('networkQualityLevelChanged', () => updateNetworkQuality(p));
      addParticipant(p);
    });

    setupDataTrackListeners(r);
    loadActivity();

    r.participants.forEach(addParticipant);
    r.on('participantDisconnected', (participant) => {
      if (dominantSpeakerSid.value === participant.sid) dominantSpeakerSid.value = null;
      networkQualityBySid.value = { ...networkQualityBySid.value };
      delete networkQualityBySid.value[participant.sid];
      participant.tracks.forEach((pub) => {
        if (isScreenTrack(pub.track) && sharedScreenTrack.value === pub.track) {
          sharedScreenTrack.value = null;
          sharedScreenIdentity.value = '';
        }
        detachTrack(pub.track);
      });
      remoteParticipants.value = remoteParticipants.value.filter((p) => p.sid !== participant.sid);
    });

    r.on('disconnected', async () => {
      if (screenTrack.value) {
        try { screenTrack.value.stop(); } catch { /* ignore */ }
        screenTrack.value = null;
      }
      sharedScreenTrack.value = null;
      sharedScreenIdentity.value = '';
      const text = transcriptLines.value.join('\n').trim();
      if (text && (props.sessionId || props.eventId)) {
        await postTranscriptToBackend(text);
      }
      disconnecting.value = false;
      room.value = null;
      localVideoTrack.value = null;
      localAudioTrack.value = null;
      cameraMuted.value = false;
      micMuted.value = false;
      remoteParticipants.value = [];
      transcriptLines.value = [];
      dominantSpeakerSid.value = null;
      localParticipantSid.value = null;
      networkQualityBySid.value = {};
      localDataTrack.value = null;
      chatMessages.value = [];
      polls.value = [];
      qaItems.value = [];
      emit('disconnected');
    });

    connecting.value = false;
  } catch (e) {
    error.value = e?.message || 'Failed to connect';
    connecting.value = false;
  }
}

async function toggleCamera() {
  const track = localVideoTrack.value;
  if (track) {
    if (cameraMuted.value) {
      track.enable();
      cameraMuted.value = false;
    } else {
      track.disable();
      cameraMuted.value = true;
    }
    return;
  }
  if (!room.value) return;
  try {
    error.value = '';
    const newTrack = await createLocalVideoTrack();
    localVideoTrack.value = newTrack;
    await room.value.localParticipant.publishTrack(newTrack);
    cameraMuted.value = false;
    newTrack.on('enabled', () => { cameraMuted.value = false; });
    newTrack.on('disabled', () => { cameraMuted.value = true; });
  } catch (e) {
    if (e?.name !== 'NotAllowedError') {
      error.value = e?.message || 'Could not access camera. Please check permissions.';
    }
  }
}

async function toggleMic() {
  const track = localAudioTrack.value;
  if (track) {
    if (micMuted.value) {
      track.enable();
      micMuted.value = false;
    } else {
      track.disable();
      micMuted.value = true;
    }
    return;
  }
  if (!room.value) return;
  try {
    error.value = '';
    const newTrack = await createLocalAudioTrack();
    localAudioTrack.value = newTrack;
    await room.value.localParticipant.publishTrack(newTrack);
    micMuted.value = false;
    newTrack.on('enabled', () => { micMuted.value = false; });
    newTrack.on('disabled', () => { micMuted.value = true; });
  } catch (e) {
    if (e?.name !== 'NotAllowedError') {
      error.value = e?.message || 'Could not access microphone. Please check permissions.';
    }
  }
}

async function toggleScreenShare() {
  if (!room.value) return;
  if (screenTrack.value) {
    try {
      room.value.localParticipant.unpublishTrack(screenTrack.value);
      screenTrack.value.stop();
    } catch (e) {
      console.warn('[SupervisionTwilioVideoRoom] Stop screen share:', e?.message);
    }
    screenTrack.value = null;
    sharedScreenTrack.value = null;
    sharedScreenIdentity.value = '';
    return;
  }
  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error.value = 'Screen sharing is not supported in this browser';
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('No video track from screen');
    const localScreenTrack = new LocalVideoTrack(track);
    screenTrack.value = localScreenTrack;
    sharedScreenTrack.value = localScreenTrack;
    sharedScreenIdentity.value = 'You';
    await room.value.localParticipant.publishTrack(localScreenTrack);
    track.onended = () => toggleScreenShare();
  } catch (e) {
    if (e?.name !== 'NotAllowedError') {
      error.value = e?.message || 'Failed to share screen';
    }
  }
}

async function toggleRecordHostOnly() {
  const eid = props.eventId ? Number(props.eventId) : null;
  if (!eid || !props.isHost) return;
  recordingRulesLoading.value = true;
  try {
    const next = !recordHostOnly.value;
    await api.post(`/team-meetings/${eid}/recording-rules`, { recordHostOnly: next });
    recordHostOnly.value = next;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update recording rules';
  } finally {
    recordingRulesLoading.value = false;
  }
}

function disconnect() {
  if (disconnecting.value) return;
  if (room.value) {
    disconnecting.value = true;
    room.value.disconnect();
    // Room 'disconnected' handler will POST transcript, clear state, and emit
  } else {
    // Not connected (e.g. error state) – emit so parent can close modal
    emit('disconnected');
  }
}

watch(
  () => [props.token, props.roomName],
  () => {
    if (props.token && props.roomName) connectRoom();
  },
  { immediate: true }
);

watch(localVideoTrack, (track, prev) => {
  if (prev) detachTrack(prev);
  if (track && localVideoEl.value && !cameraMuted.value) attachTrack(track, localVideoEl.value);
}, { flush: 'post' });

watch(cameraMuted, (muted) => {
  const track = localVideoTrack.value;
  const el = localVideoEl.value;
  if (!track || !el) return;
  if (muted) detachTrack(track);
  else attachTrack(track, el);
}, { flush: 'post' });

watch([sharedScreenTrack, screenShareEl], ([track, el], [prevTrack]) => {
  if (prevTrack && prevTrack !== track) detachTrack(prevTrack);
  if (!track || !el) return;
  attachTrack(track, el);
}, { flush: 'post' });

onUnmounted(() => {
  if (screenTrack.value) {
    try { screenTrack.value.stop(); } catch { /* ignore */ }
  }
  if (room.value) room.value.disconnect();
});
</script>

<style scoped>
.twilio-video-room {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 400px;
}
.video-room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.video-room-title {
  font-weight: 600;
}
.video-room-error {
  color: #b91c1c;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
}
.video-room-placeholder {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
.video-room-content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 300px;
}
.video-room-grid {
  display: grid;
  gap: 8px;
  flex: 1;
  min-height: 200px;
  align-content: start;
}
.video-room-grid.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.video-room-grid.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
.video-room-grid.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
.video-room-grid.grid-cols-5 { grid-template-columns: repeat(5, 1fr); }
.video-track-wrap {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: #111;
  position: relative;
  aspect-ratio: 16 / 10;
  min-height: 120px;
  contain: layout style;
}
.video-track-wrap.video-placeholder-wrap {
  grid-column: span 1;
}
.video-room-controls {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.5);
  border-top: 1px solid var(--border);
}
.control-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary, #333);
  color: var(--text-primary, #fff);
  cursor: pointer;
}
.control-btn:hover {
  background: var(--bg-tertiary, #444);
}
.control-btn.muted {
  opacity: 0.7;
  border-color: #b91c1c;
}
.control-btn.active {
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.2);
}
.video-room-screenshare {
  border: 2px solid #2563eb;
  border-radius: 8px;
  overflow: hidden;
  background: #111;
  position: relative;
  min-height: 200px;
}
.video-track-screenshare {
  width: 100%;
  min-height: 300px;
  object-fit: contain;
}
.control-icon {
  font-size: 16px;
}
.video-track {
  width: 100%;
  height: 100%;
  min-height: 200px;
  object-fit: cover;
}
.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #666;
  font-size: 14px;
}
.video-placeholder .placeholder-logo {
  opacity: 0.35;
}
.participant-identity {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.video-track-wrap.dominant-speaker {
  border: 2px solid #2563eb;
  box-shadow: 0 0 12px rgba(37, 99, 235, 0.4);
}
.network-quality-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}
.network-quality-badge.nq-poor {
  background: #b91c1c;
  color: #fff;
}
.network-quality-badge.nq-fair {
  background: #d97706;
  color: #fff;
}
.network-quality-badge.nq-good {
  background: #059669;
  color: #fff;
}

.chat-badge {
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 10px;
  background: #b91c1c;
  color: #fff;
  font-size: 11px;
}

.video-room-agenda-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(400px, 90vw);
  background: var(--bg-card);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  z-index: 10;
}

.video-room-agenda-panel .meeting-agenda-panel {
  margin: 12px;
  max-width: none;
  max-height: none;
}

.video-room-chat-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(320px, 90vw);
  background: var(--bg-card);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.chat-panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.chat-tab {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.chat-tab.active {
  color: var(--primary);
  font-weight: 600;
  border-bottom: 2px solid var(--primary);
}

.chat-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-msg {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-secondary, #2a2a2a);
}

.chat-msg-own {
  background: rgba(37, 99, 235, 0.2);
  margin-left: 24px;
}

.chat-msg-sender {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.chat-msg-text {
  font-size: 14px;
}

.chat-input-form {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
}

.poll-create {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--border);
}

.poll-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.poll-question {
  font-weight: 600;
  margin-bottom: 8px;
}

.poll-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.poll-option-btn {
  padding: 6px 10px;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
}

.poll-option-btn.selected {
  border-color: var(--primary);
  background: rgba(37, 99, 235, 0.15);
}

.qa-item {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.qa-question {
  margin-bottom: 8px;
}

.qa-answer {
  margin-left: 16px;
  color: var(--text-secondary);
}

.qa-answer-form {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
</style>
