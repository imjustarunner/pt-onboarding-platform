<template>
  <div class="group-room">
    <div class="group-room-header">
      <div>
        <h2>{{ session?.title || 'Group class session' }}</h2>
        <p class="hint">{{ session?.status || 'scheduled' }} · {{ actorRoleLabel }}</p>
      </div>
      <div class="group-room-actions">
        <button v-if="canModerate && session?.status !== 'live'" class="btn btn-primary btn-sm" :disabled="busy" @click="startSession">
          Start live
        </button>
        <button v-if="canModerate && session?.status === 'live'" class="btn btn-secondary btn-sm" :disabled="busy" @click="endSession">
          End session
        </button>
        <button class="btn btn-secondary btn-sm" :disabled="busy" @click="refreshAll">Refresh</button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="group-room-layout">
      <section class="document-pane">
        <h3>Document</h3>
        <div v-if="presentationState?.linked_document_url" class="doc-frame-wrap">
          <iframe :src="presentationState.linked_document_url" class="doc-frame" title="Linked class document" />
        </div>
        <div v-else class="placeholder">No linked document for this slide yet.</div>
        <div v-if="canModerate" class="doc-controls">
          <input v-model.trim="linkedDocumentInput" type="url" class="form-input" placeholder="https://... linked document URL" />
          <button class="btn btn-sm btn-primary" :disabled="!linkedDocumentInput" @click="syncDocument">Sync doc</button>
        </div>
      </section>

      <section class="slide-pane">
        <div class="slide-head">
          <h3>Slide</h3>
          <div v-if="canModerate" class="slide-nav">
            <button class="btn btn-sm btn-secondary" :disabled="!slides.length" @click="prevSlide">Prev</button>
            <button class="btn btn-sm btn-secondary" :disabled="!slides.length" @click="nextSlide">Next</button>
          </div>
        </div>
        <article class="slide-card">
          <h4>{{ currentSlide?.title || 'No active slide' }}</h4>
          <p v-if="currentSlide?.body_text">{{ currentSlide.body_text }}</p>
          <a v-if="currentSlide?.media_url" :href="currentSlide.media_url" target="_blank" rel="noopener noreferrer">Open slide media</a>
          <div v-if="!currentSlide" class="placeholder">Create slides in the workspace to present them live.</div>
        </article>
        <div v-if="canModerate" class="slide-create">
          <input v-model.trim="newSlide.title" class="form-input" placeholder="Slide title" />
          <textarea v-model.trim="newSlide.bodyText" class="form-input" rows="2" placeholder="Slide content" />
          <div class="slide-create-row">
            <input v-model.trim="newSlide.mediaUrl" class="form-input" placeholder="Optional media URL" />
            <button class="btn btn-sm btn-primary" :disabled="!newSlide.title" @click="createSlide">Add slide</button>
          </div>
        </div>
      </section>

      <section class="activity-pane">
        <div class="activity-tabs">
          <button type="button" :class="{ active: activityTab === 'chat' }" @click="activityTab = 'chat'">Chat</button>
          <button type="button" :class="{ active: activityTab === 'polls' }" @click="activityTab = 'polls'">Polls</button>
          <button type="button" :class="{ active: activityTab === 'qa' }" @click="activityTab = 'qa'">Q&A</button>
        </div>
        <div v-if="activityTab === 'chat'" class="tab-pane">
          <div class="messages">
            <div v-for="m in chatMessages" :key="m.id" class="msg">
              <strong>{{ m.participant_identity || 'participant' }}:</strong> {{ m.payload_json?.text || '' }}
            </div>
          </div>
          <form class="composer" @submit.prevent="sendChat">
            <input v-model.trim="chatInput" class="form-input" placeholder="Type message" />
            <button class="btn btn-sm btn-primary" :disabled="!chatInput">Send</button>
          </form>
        </div>
        <div v-else-if="activityTab === 'polls'" class="tab-pane">
          <div v-if="canModerate" class="poll-create">
            <input v-model.trim="pollQuestion" class="form-input" placeholder="Poll question" />
            <input v-model.trim="pollOptions" class="form-input" placeholder="Options comma-separated" />
            <button class="btn btn-sm btn-primary" :disabled="!pollQuestion || !pollOptions" @click="createPoll">Post poll</button>
          </div>
          <div class="messages">
            <div v-for="p in pollActivities" :key="p.id" class="poll-item">
              <strong>{{ p.payload_json?.question }}</strong>
              <div class="muted">{{ (p.payload_json?.options || []).join(' · ') }}</div>
            </div>
          </div>
        </div>
        <div v-else class="tab-pane">
          <div class="messages">
            <div v-for="q in qaQuestions" :key="q.id" class="qa-item">
              <div><strong>Q:</strong> {{ q.payload_json?.text }}</div>
              <div v-if="qaAnswerByQuestionId[q.id]"><strong>A:</strong> {{ qaAnswerByQuestionId[q.id] }}</div>
            </div>
          </div>
          <form class="composer" @submit.prevent="submitQuestion">
            <input v-model.trim="questionInput" class="form-input" placeholder="Ask question" />
            <button class="btn btn-sm btn-primary" :disabled="!questionInput">Ask</button>
          </form>
        </div>
      </section>

      <section class="presenter-overlay">
        <div class="overlay-title">Presenter video</div>
        <div v-if="presenterVideoTrack" ref="presenterVideoEl" class="presenter-video" />
        <div v-else class="placeholder">Presenter camera will appear here.</div>
      </section>
    </div>

    <div class="participant-controls">
      <button class="btn btn-sm btn-secondary" :disabled="!roomConnected" @click="toggleMic">
        {{ micOn ? 'Mute' : 'Unmute' }}
      </button>
      <button class="btn btn-sm btn-secondary" :disabled="!roomConnected" @click="toggleCamera">
        {{ cameraOn ? 'Camera off' : 'Camera on' }}
      </button>
      <button class="btn btn-sm btn-primary" :disabled="!roomConnected || raiseHandBusy" @click="raiseHand">
        {{ raiseHandBusy ? 'Raising…' : 'Raise hand' }}
      </button>
    </div>

    <div v-if="canModerate" class="moderation-panel">
      <h3>Raise hand queue</h3>
      <div v-if="!openHandRaises.length" class="hint">No active raised hands.</div>
      <div v-for="hr in openHandRaises" :key="hr.id" class="queue-row">
        <div>{{ hr.first_name }} {{ hr.last_name }} <span class="muted">· {{ hr.note || 'No note' }}</span></div>
        <div class="queue-actions">
          <button class="btn btn-sm btn-primary" @click="approveHandRaise(hr, true)">Grant mic</button>
          <button class="btn btn-sm btn-secondary" @click="approveHandRaise(hr, false)">Dismiss</button>
        </div>
      </div>
    </div>

    <div v-if="canModerate" class="scoring-panel">
      <h3>Live scoring</h3>
      <div class="scoring-grid">
        <input v-model.number="scoreForm.clientId" class="form-input" type="number" placeholder="Client ID" />
        <input v-model.number="scoreForm.domainId" class="form-input" type="number" placeholder="Domain ID" />
        <input v-model.number="scoreForm.skillId" class="form-input" type="number" placeholder="Skill ID" />
        <input v-model.number="scoreForm.scoreValue" class="form-input" type="number" placeholder="Score" />
      </div>
      <button class="btn btn-sm btn-primary" :disabled="scoreBusy" @click="submitScore">
        {{ scoreBusy ? 'Saving…' : 'Save evidence' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
// Video provider not configured — twilio-video removed
import api from '../../services/api';

const props = defineProps({
  sessionId: { type: [String, Number], required: true }
});

const session = ref(null);
const actorRole = ref('participant');
const canModerate = ref(false);
const slides = ref([]);
const presentationState = ref(null);
const handRaises = ref([]);
const activity = ref([]);
const busy = ref(false);
const error = ref('');
const activityTab = ref('chat');
const linkedDocumentInput = ref('');
const newSlide = ref({ title: '', bodyText: '', mediaUrl: '' });
const chatInput = ref('');
const pollQuestion = ref('');
const pollOptions = ref('');
const questionInput = ref('');
const raiseHandBusy = ref(false);
const scoreBusy = ref(false);
const scoreForm = ref({ clientId: null, domainId: null, skillId: null, scoreValue: null });

let pollTimer = null;

const room = ref(null);
const localAudioTrack = ref(null);
const localVideoTrack = ref(null);
const presenterVideoTrack = ref(null);
const presenterVideoEl = ref(null);
const roomConnected = computed(() => !!room.value);
const micOn = ref(false);
const cameraOn = ref(false);

const actorRoleLabel = computed(() => String(actorRole.value || 'participant').replace('_', ' '));
const currentSlide = computed(() => {
  if (!slides.value.length) return null;
  const activeId = Number(presentationState.value?.current_slide_id || 0);
  if (activeId > 0) return slides.value.find((s) => Number(s.id) === activeId) || slides.value[0];
  const order = Number(presentationState.value?.current_slide_order || 0);
  return slides.value.find((s) => Number(s.slide_order || 0) === order) || slides.value[0];
});
const chatMessages = computed(() => activity.value.filter((a) => a.activity_type === 'chat'));
const pollActivities = computed(() => activity.value.filter((a) => a.activity_type === 'poll'));
const qaQuestions = computed(() => activity.value.filter((a) => a.activity_type === 'question'));
const qaAnswerByQuestionId = computed(() => {
  const map = {};
  for (const item of activity.value.filter((a) => a.activity_type === 'answer')) {
    const qid = Number(item.payload_json?.questionId || 0);
    if (qid > 0) map[qid] = String(item.payload_json?.text || '');
  }
  return map;
});
const openHandRaises = computed(() => handRaises.value.filter((h) => String(h.status) === 'raised'));

async function refreshAll() {
  error.value = '';
  try {
    const [sessionRes, slidesRes, activityRes] = await Promise.all([
      api.get(`/learning-class-sessions/sessions/${props.sessionId}`, { skipGlobalLoading: true }),
      api.get(`/learning-class-sessions/sessions/${props.sessionId}/slides`, { skipGlobalLoading: true }),
      api.get(`/learning-class-sessions/sessions/${props.sessionId}/activity`, { skipGlobalLoading: true })
    ]);
    session.value = sessionRes.data?.session || null;
    actorRole.value = sessionRes.data?.actorRole || 'participant';
    canModerate.value = !!sessionRes.data?.canModerate;
    handRaises.value = Array.isArray(sessionRes.data?.handRaises) ? sessionRes.data.handRaises : [];
    slides.value = Array.isArray(slidesRes.data?.slides) ? slidesRes.data.slides : [];
    presentationState.value = slidesRes.data?.state || null;
    linkedDocumentInput.value = presentationState.value?.linked_document_url || '';
    activity.value = Array.isArray(activityRes.data?.activity) ? activityRes.data.activity : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load session';
  }
}

async function ensureConnected() {
  // Video provider not configured — skipping connection
}

function bindParticipant() {
  // Video provider not configured
}

async function startSession() {
  busy.value = true;
  try {
    await api.post(`/learning-class-sessions/sessions/${props.sessionId}/start`, {}, { skipGlobalLoading: true });
    await refreshAll();
    await ensureConnected();
  } finally {
    busy.value = false;
  }
}

async function endSession() {
  busy.value = true;
  try {
    await api.post(`/learning-class-sessions/sessions/${props.sessionId}/end`, {}, { skipGlobalLoading: true });
    await refreshAll();
  } finally {
    busy.value = false;
  }
}

async function syncDocument() {
  await api.put(`/learning-class-sessions/sessions/${props.sessionId}/state`, {
    currentSlideId: currentSlide.value?.id || null,
    currentSlideOrder: currentSlide.value?.slide_order || 0,
    linkedDocumentUrl: linkedDocumentInput.value || null
  }, { skipGlobalLoading: true });
  await refreshAll();
}

async function createSlide() {
  await api.post(`/learning-class-sessions/sessions/${props.sessionId}/slides`, {
    title: newSlide.value.title,
    bodyText: newSlide.value.bodyText,
    mediaUrl: newSlide.value.mediaUrl,
    slideOrder: slides.value.length + 1
  }, { skipGlobalLoading: true });
  newSlide.value = { title: '', bodyText: '', mediaUrl: '' };
  await refreshAll();
}

async function prevSlide() {
  if (!slides.value.length) return;
  const idx = Math.max(slides.value.findIndex((s) => Number(s.id) === Number(currentSlide.value?.id)) - 1, 0);
  const next = slides.value[idx];
  await api.put(`/learning-class-sessions/sessions/${props.sessionId}/state`, {
    currentSlideId: next.id,
    currentSlideOrder: next.slide_order,
    linkedDocumentUrl: presentationState.value?.linked_document_url || null
  }, { skipGlobalLoading: true });
  await refreshAll();
}

async function nextSlide() {
  if (!slides.value.length) return;
  const currentIdx = slides.value.findIndex((s) => Number(s.id) === Number(currentSlide.value?.id));
  const idx = Math.min(currentIdx + 1, slides.value.length - 1);
  const next = slides.value[idx];
  await api.put(`/learning-class-sessions/sessions/${props.sessionId}/state`, {
    currentSlideId: next.id,
    currentSlideOrder: next.slide_order,
    linkedDocumentUrl: presentationState.value?.linked_document_url || null
  }, { skipGlobalLoading: true });
  await refreshAll();
}

async function sendChat() {
  await api.post(`/learning-class-sessions/sessions/${props.sessionId}/activity`, {
    activityType: 'chat',
    payload: { text: chatInput.value }
  }, { skipGlobalLoading: true });
  chatInput.value = '';
  await refreshAll();
}

async function createPoll() {
  await api.post(`/learning-class-sessions/sessions/${props.sessionId}/activity`, {
    activityType: 'poll',
    payload: { question: pollQuestion.value, options: pollOptions.value.split(',').map((s) => s.trim()).filter(Boolean) }
  }, { skipGlobalLoading: true });
  pollQuestion.value = '';
  pollOptions.value = '';
  await refreshAll();
}

async function submitQuestion() {
  await api.post(`/learning-class-sessions/sessions/${props.sessionId}/activity`, {
    activityType: 'question',
    payload: { text: questionInput.value }
  }, { skipGlobalLoading: true });
  questionInput.value = '';
  await refreshAll();
}

async function raiseHand() {
  raiseHandBusy.value = true;
  try {
    await api.post(`/learning-class-sessions/sessions/${props.sessionId}/hand-raises`, { requestedCamera: false }, { skipGlobalLoading: true });
    await refreshAll();
  } finally {
    raiseHandBusy.value = false;
  }
}

async function approveHandRaise(hr, approved) {
  await api.patch(`/learning-class-sessions/sessions/${props.sessionId}/hand-raises/${hr.id}`, {
    status: approved ? 'approved' : 'dismissed',
    approvedAudio: approved,
    approvedVideo: false
  }, { skipGlobalLoading: true });
  await refreshAll();
}

async function submitScore() {
  scoreBusy.value = true;
  try {
    await api.post(`/learning-class-sessions/sessions/${props.sessionId}/score-evidence`, {
      clientId: scoreForm.value.clientId,
      domainId: scoreForm.value.domainId,
      skillId: scoreForm.value.skillId,
      scoreValue: scoreForm.value.scoreValue,
      slideId: currentSlide.value?.id || null,
      slideOrder: currentSlide.value?.slide_order || null,
      linkedDocumentUrl: presentationState.value?.linked_document_url || null,
      systemScore: false
    }, { skipGlobalLoading: true });
  } finally {
    scoreBusy.value = false;
  }
}

function toggleMic() {
  if (!localAudioTrack.value) return;
  if (localAudioTrack.value.isEnabled) {
    localAudioTrack.value.disable();
    micOn.value = false;
  } else {
    localAudioTrack.value.enable();
    micOn.value = true;
  }
}

function toggleCamera() {
  if (!localVideoTrack.value) return;
  if (localVideoTrack.value.isEnabled) {
    localVideoTrack.value.disable();
    cameraOn.value = false;
  } else {
    localVideoTrack.value.enable();
    cameraOn.value = true;
  }
}

onMounted(async () => {
  await refreshAll();
  await ensureConnected();
  pollTimer = window.setInterval(async () => {
    await refreshAll();
    await ensureConnected();
  }, 8000);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<style scoped>
.group-room-header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:10px; }
.group-room-actions { display:flex; gap:8px; }
.group-room-layout { display:grid; grid-template-columns: 1.1fr 1fr; grid-template-rows: minmax(220px,auto) minmax(220px,auto); gap:12px; position:relative; }
.document-pane { grid-row:1 / span 2; grid-column:1; border:1px solid var(--border-color,#d4d8de); border-radius:12px; padding:10px; background:var(--surface-card,#fff); }
.slide-pane { grid-row:1; grid-column:2; border:1px solid var(--border-color,#d4d8de); border-radius:12px; padding:10px; background:var(--surface-card,#fff); }
.activity-pane { grid-row:2; grid-column:2; border:1px solid var(--border-color,#d4d8de); border-radius:12px; padding:10px; background:var(--surface-card,#fff); }
.presenter-overlay { position:absolute; left:56%; top:6px; transform:translateX(-50%); width:220px; min-height:130px; z-index:2; border:1px solid var(--border-color,#d4d8de); border-radius:12px; background:#0c1220; color:#fff; padding:8px; }
.overlay-title { font-size:12px; opacity:0.85; margin-bottom:6px; }
.presenter-video { width:100%; min-height:96px; border-radius:8px; overflow:hidden; }
.doc-frame-wrap { width:100%; height:calc(100% - 60px); min-height:340px; }
.doc-frame { width:100%; height:100%; border:none; border-radius:8px; background:#fff; }
.slide-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.slide-nav { display:flex; gap:6px; }
.slide-card { border:1px solid var(--border-color,#d4d8de); border-radius:10px; padding:10px; min-height:120px; background:var(--surface-subtle,#f8fafc); }
.slide-create { margin-top:8px; display:grid; gap:6px; }
.slide-create-row { display:grid; grid-template-columns:1fr auto; gap:6px; }
.doc-controls { margin-top:8px; display:grid; grid-template-columns:1fr auto; gap:6px; }
.activity-tabs { display:flex; gap:6px; margin-bottom:8px; }
.activity-tabs button { border:1px solid var(--border-color,#d4d8de); background:#fff; padding:4px 8px; border-radius:8px; }
.activity-tabs button.active { background:#e8f1ff; border-color:#7aa2ff; }
.messages { max-height:180px; overflow:auto; display:grid; gap:6px; }
.composer { margin-top:8px; display:grid; grid-template-columns:1fr auto; gap:6px; }
.participant-controls { margin-top:12px; display:flex; gap:8px; }
.moderation-panel, .scoring-panel { margin-top:12px; border:1px solid var(--border-color,#d4d8de); border-radius:10px; padding:10px; background:var(--surface-card,#fff); }
.queue-row { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0; border-top:1px solid var(--border-color,#e6e8ec); }
.queue-actions { display:flex; gap:6px; }
.scoring-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin-bottom:8px; }
.placeholder { color:var(--text-muted,#6c7785); }
@media (max-width: 1024px) {
  .group-room-layout { grid-template-columns:1fr; grid-template-rows:auto; }
  .document-pane, .slide-pane, .activity-pane { grid-column:1; grid-row:auto; }
  .presenter-overlay { position:static; transform:none; width:auto; margin-bottom:8px; }
}
</style>
