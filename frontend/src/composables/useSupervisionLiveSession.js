/**
 * Shared supervision live-session plumbing (lifecycle, activity, transcript).
 * Room shells (individual vs group) own their own layout and UX.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { suspendInactivityTimeout, resumeInactivityTimeout } from '../utils/activityTracker';

export function useSupervisionLiveSession(props, emit, { enablePresentation = false, enableActivityFeed = true } = {}) {
  const authStore = useAuthStore();

  const sideTab = ref('discussion');
  const discussionSubTab = ref('agenda');
  const topicDraft = ref('');
  const chatDraft = ref('');
  const discussionError = ref('');
  const topicBusy = ref(false);
  const chatBusy = ref(false);
  const personalNotes = ref('');
  const presentation = ref(null);
  const slides = ref([]);
  const currentSlide = ref(null);
  const myPresentation = ref(null);
  const activity = ref([]);
  const pollTimer = ref(null);
  const lifecyclePosted = ref(false);
  const liveTranscriptChunks = ref([]);
  const sessionTranscriptText = ref('');
  const transcriptHint = ref('');
  const transcriptCapturing = ref(false);
  const prioritizeSelfView = ref(false);
  const viewAsAttendee = ref(false);
  let speechRecognition = null;
  let transcriptFlushTimer = null;

  const numericSessionId = computed(() => {
    const n = Number(props.supervisionSessionId || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });

  const showLobbyPanel = computed(() => (
    props.isSupervisor
    && props.lobbyEnabledForSession !== false
  ));
  const showWaitingRoomStage = computed(() => props.isInLobby && !props.isSupervisor);

  const liveTranscriptPreview = computed(() =>
    (liveTranscriptChunks.value || []).map((t) => String(t || '').trim()).filter(Boolean).join(' ')
  );
  const sessionTranscriptPreview = computed(() => String(sessionTranscriptText.value || '').trim());

  function authorDisplayName() {
    return String(props.localDisplayName || '').trim()
      || `${authStore.user?.firstName || authStore.user?.first_name || ''} ${authStore.user?.lastName || authStore.user?.last_name || ''}`.trim()
      || 'Participant';
  }

  function mapActivityRows(type) {
    return (activity.value || [])
      .filter((a) => String(a.activity_type || a.activityType || '') === type)
      .map((a) => {
        let payload = a.payload || a.payload_json || {};
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload || '{}'); } catch { payload = {}; }
        }
        const created = a.created_at || a.createdAt;
        return {
          id: a.id,
          text: payload.text || payload.question || '',
          author: payload.authorName || 'Participant',
          timeLabel: created ? new Date(created).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
          upvotes: Number(payload.upvotes || 0),
          pinned: !!payload.pinned
        };
      })
      .filter((row) => row.text);
  }

  const topics = computed(() => mapActivityRows('question').reverse());
  const chatMessages = computed(() => mapActivityRows('chat'));

  const canControlSlides = computed(() =>
    enablePresentation
    && !viewAsAttendee.value
    && (props.isSupervisor || props.isPresenter)
    && slides.value.length > 0
  );
  const showPresenterNotes = computed(() =>
    enablePresentation
    && !viewAsAttendee.value
    && (props.isPresenter || props.isSupervisor)
  );
  const isMyDeckActive = computed(() => (
    !!myPresentation.value?.id
    && Number(presentation.value?.id) === Number(myPresentation.value.id)
  ));
  const canPresentMyDeck = computed(() => (
    enablePresentation
    && !viewAsAttendee.value
    && props.isPresenter
    && !!myPresentation.value?.id
    && !isMyDeckActive.value
  ));
  const canStopPresenting = computed(() => (
    enablePresentation
    && !viewAsAttendee.value
    && props.isPresenter
    && isMyDeckActive.value
  ));
  /** Only the assigned presenter may edit their own slide, and only while it's the live deck. */
  const canEditCurrentSlide = computed(() => (
    enablePresentation
    && !viewAsAttendee.value
    && props.isPresenter
    && isMyDeckActive.value
    && !!currentSlide.value
  ));
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

  function onSelfStageClick(event) {
    if (!showWaitingRoomStage.value || prioritizeSelfView.value) return;
    if (event?.target?.closest?.('.vsr__controls, button, a, input, textarea, select')) return;
    prioritizeSelfView.value = true;
  }

  async function postLifecycle(eventType) {
    const sid = numericSessionId.value || props.supervisionSessionId;
    if (!sid) return;
    if (!authStore.isAuthenticated && !authStore.user?.id) return;
    try {
      await api.post(`/supervision/sessions/${sid}/meeting-lifecycle`, {
        eventType,
        clientSessionKey: `web-${sid}-${authStore.user?.id || 0}-${props.joinIdentity || 'auth'}`
      }, { skipGlobalLoading: true, skipAuthRedirect: true });
    } catch {
      /* best-effort */
    }
  }

  function speakerLabelForTranscript() {
    const role = String(props.localRoleLabel || '').trim();
    const name = String(props.localDisplayName || '').trim();
    if (props.isSupervisor) return name ? `Supervisor · ${name}` : 'Supervisor';
    if (role && name && role.toLowerCase() !== name.toLowerCase()) return `${role} · ${name}`;
    return role || name || 'Participant';
  }

  async function loadSessionTranscript() {
    const sid = numericSessionId.value;
    if (!sid || !authStore.isAuthenticated) return;
    try {
    const { data } = await api.get(`/supervision/sessions/${sid}/artifacts`, {
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    const artifact = data?.artifact || data || {};
    sessionTranscriptText.value = String(
      artifact.transcriptText || artifact.transcript_text || data?.transcriptText || data?.transcript_text || ''
    ).trim();
    } catch {
      /* optional */
    }
  }

  async function flushLiveTranscript({ final = false } = {}) {
    const chunks = (liveTranscriptChunks.value || []).map((t) => String(t || '').trim()).filter(Boolean);
    if (!chunks.length) return;
    const transcript = chunks.join(' ').trim();
    if (!transcript) return;
    liveTranscriptChunks.value = [];
    const sid = numericSessionId.value || props.supervisionSessionId;
    const joinToken = String(props.joinToken || '').trim();
    try {
      if (authStore.isAuthenticated && sid) {
        await api.post(
          `/supervision/sessions/${encodeURIComponent(sid)}/client-transcript`,
          { transcript, speakerLabel: speakerLabelForTranscript(), replace: false },
          { skipGlobalLoading: true, skipAuthRedirect: true }
        );
      } else if (joinToken) {
        await api.post(
          `/supervision/guest-transcript/${encodeURIComponent(joinToken)}`,
          { transcript, speakerLabel: speakerLabelForTranscript() },
          { skipGlobalLoading: true, skipAuthRedirect: true }
        );
      }
      const stamped = `[${speakerLabelForTranscript()}] ${transcript}`;
      const prev = String(sessionTranscriptText.value || '').trim();
      if (!prev) sessionTranscriptText.value = stamped;
      else if (!prev.includes(stamped)) sessionTranscriptText.value = `${prev}\n${stamped}`;
      if (final) transcriptHint.value = 'Transcript saved for this session.';
    } catch (e) {
      liveTranscriptChunks.value = [...chunks, ...liveTranscriptChunks.value];
      if (final) {
        transcriptHint.value = e?.response?.data?.error?.message || 'Could not save live transcript.';
      }
    }
  }

  const transcriptPaused = ref(false);
  const transcriptRoomStopped = ref(false);
  const transcriptStopMeta = ref(null);

  function stopLiveTranscriptCapture() {
    if (transcriptFlushTimer) {
      clearInterval(transcriptFlushTimer);
      transcriptFlushTimer = null;
    }
    try {
      speechRecognition?.stop?.();
    } catch {
      /* ignore */
    }
    speechRecognition = null;
    transcriptCapturing.value = false;
  }

  function startLiveTranscriptCapture() {
    if (transcriptPaused.value || transcriptRoomStopped.value) return;
    const SR = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    if (!SR || speechRecognition) {
      if (!SR) {
        transcriptHint.value = 'Live transcript needs Chrome/Safari speech recognition (mic permission).';
      }
      transcriptCapturing.value = false;
      return;
    }
    try {
      speechRecognition = new SR();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = false;
      speechRecognition.lang = 'en-US';
      speechRecognition.onresult = (event) => {
        try {
          const result = event?.results?.[event.resultIndex];
          const text = String(result?.[0]?.transcript || '').trim();
          if (text) liveTranscriptChunks.value.push(text);
        } catch {
          /* ignore */
        }
      };
      speechRecognition.onerror = () => {
        transcriptCapturing.value = false;
      };
      speechRecognition.onend = () => {
        if (!speechRecognition || transcriptPaused.value || transcriptRoomStopped.value) return;
        transcriptCapturing.value = true;
        try {
          speechRecognition.start();
        } catch {
          transcriptCapturing.value = false;
        }
      };
      speechRecognition.start();
      transcriptCapturing.value = true;
      transcriptHint.value = 'Listening for live transcript…';
      transcriptFlushTimer = setInterval(() => {
        void flushLiveTranscript({ final: false });
      }, 20000);
    } catch {
      transcriptHint.value = 'Could not start live transcript capture.';
      speechRecognition = null;
      transcriptCapturing.value = false;
    }
  }

  async function pauseLiveTranscript() {
    if (transcriptRoomStopped.value) return;
    transcriptPaused.value = true;
    stopLiveTranscriptCapture();
    await flushLiveTranscript({ final: false });
    transcriptHint.value = 'Transcript paused';
  }

  async function resumeLiveTranscript() {
    if (transcriptRoomStopped.value) return;
    transcriptPaused.value = false;
    transcriptHint.value = 'Transcript resumed';
    startLiveTranscriptCapture();
  }

  async function applyTranscriptRoomStop(meta = null) {
    transcriptRoomStopped.value = true;
    transcriptPaused.value = false;
    transcriptStopMeta.value = meta || transcriptStopMeta.value;
    stopLiveTranscriptCapture();
    await flushLiveTranscript({ final: true });
    const who = transcriptStopMeta.value?.stoppedByName || 'Supervisor';
    const when = transcriptStopMeta.value?.stoppedAt
      ? new Date(transcriptStopMeta.value.stoppedAt).toLocaleString()
      : 'now';
    transcriptHint.value = `Transcription stopped by ${who} at ${when}`;
  }

  function onVideoConnected() {
    if (!lifecyclePosted.value) {
      lifecyclePosted.value = true;
      postLifecycle('joined');
    }
    // The lobby already has a live Vonage publisher. Starting Web Speech there opens a
    // second microphone pipeline and can lock up Chrome/iPad during admission handoff.
    if (!props.isInLobby) startLiveTranscriptCapture();
    emit('connected');
  }

  async function refreshPresentation() {
    if (!enablePresentation) return;
    const sid = props.supervisionSessionId;
    if (!sid || props.isInLobby) return;
    try {
      const { data } = await api.get(`/supervision/sessions/${sid}/presentation-state`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      });
      presentation.value = data.presentation || null;
      slides.value = data.presentation?.slides || [];
      currentSlide.value = data.currentSlide || slides.value[0] || null;
    } catch {
      /* ignore until presentation exists */
    }
  }

  /** Load (or lazily create) the current user's own presenter deck, separate from
   *  whichever deck is currently live on everyone's screen. */
  async function refreshMyPresentation() {
    if (!enablePresentation || !props.isPresenter) return;
    const sid = props.supervisionSessionId;
    if (!sid || props.isInLobby) return;
    try {
      const { data } = await api.get(`/supervision/sessions/${sid}/presentations/mine`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      });
      myPresentation.value = data?.presentation || null;
    } catch {
      /* presenter may not be assigned yet */
    }
  }

  /** Make my own deck the one everyone sees, starting from its first slide. */
  async function presentMyDeck() {
    if (!myPresentation.value?.id) return;
    const firstSlide = (myPresentation.value.slides || [])[0] || null;
    try {
      await api.put(`/supervision/sessions/${props.supervisionSessionId}/presentation-state`, {
        activePresentationId: myPresentation.value.id,
        currentSlideId: firstSlide?.id || null,
        currentSlideOrder: 0
      }, { skipGlobalLoading: true });
      await refreshPresentation();
    } catch {
      /* ignore */
    }
  }

  /** Clear the shared stage so another presenter can take over. */
  async function stopPresenting() {
    try {
      await api.put(`/supervision/sessions/${props.supervisionSessionId}/presentation-state`, {
        activePresentationId: null,
        currentSlideId: null,
        currentSlideOrder: 0
      }, { skipGlobalLoading: true });
      await refreshPresentation();
    } catch {
      /* ignore */
    }
  }

  /** Save the currently-displayed slide's content in place (presenter editing their own live deck). */
  async function saveCurrentSlideContent({ bodyHtml, presenterNotes } = {}) {
    const slide = currentSlide.value;
    if (!slide || !canEditCurrentSlide.value) return false;
    try {
      const { data } = await api.patch(`/supervision/presentation-slides/${slide.id}`, {
        title: slide.title,
        bodyHtml,
        presenterNotes,
        layout: slide.layout || 'text',
        background: slide.background || null
      });
      const updated = data?.slide || {};
      const merged = { ...slide, ...updated, body_html: bodyHtml, presenter_notes: presenterNotes };
      currentSlide.value = merged;
      slides.value = slides.value.map((s) => (Number(s.id) === Number(slide.id) ? merged : s));
      if (myPresentation.value?.slides) {
        myPresentation.value = {
          ...myPresentation.value,
          slides: myPresentation.value.slides.map((s) => (Number(s.id) === Number(slide.id) ? merged : s))
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  async function refreshActivity() {
    if (!enableActivityFeed) return;
    const sid = numericSessionId.value || props.supervisionSessionId;
    if (!sid) return;
    try {
      const joinTok = String(props.joinToken || '').trim();
      const isGuest = String(props.joinIdentity || '').startsWith('guest-');
      const { data } = (isGuest && joinTok)
        ? await api.get(`/supervision/guest-activity/${encodeURIComponent(joinTok)}`, {
          skipGlobalLoading: true,
          skipAuthRedirect: true
        })
        : await api.get(`/supervision/sessions/${encodeURIComponent(sid)}/activity`, {
          skipGlobalLoading: true,
          skipAuthRedirect: true
        });
      const rows = data?.activity || data?.items || data || [];
      activity.value = Array.isArray(rows) ? rows : [];
    } catch (e) {
      if (!activity.value?.length) activity.value = [];
      console.warn('[useSupervisionLiveSession] activity refresh failed', e?.response?.status || e?.message);
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
      /* ignore */
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

  async function postActivity(activityType, text) {
    const authorName = authorDisplayName();
    const sid = numericSessionId.value || props.supervisionSessionId;
    const joinTok = String(props.joinToken || '').trim();
    const isGuest = String(props.joinIdentity || '').startsWith('guest-');
    if (isGuest && joinTok) {
      await api.post(`/supervision/guest-activity/${encodeURIComponent(joinTok)}`, {
        activityType,
        joinIdentity: props.joinIdentity,
        displayName: authorName,
        payload: { text, authorName, upvotes: 0 }
      }, { skipAuthRedirect: true });
    } else {
      if (!sid) throw new Error('Session id missing — rejoin the session and try again.');
      await api.post(`/supervision/sessions/${encodeURIComponent(sid)}/activity`, {
        activityType,
        payload: { text, authorName, upvotes: 0 }
      });
    }
    activity.value = [
      ...(activity.value || []),
      {
        id: `local-${Date.now()}`,
        activityType,
        activity_type: activityType,
        payload: { text, authorName, upvotes: 0 },
        createdAt: new Date().toISOString()
      }
    ];
    await refreshActivity();
  }

  async function postTopic() {
    const text = topicDraft.value.trim();
    if (!text || topicBusy.value) return;
    topicBusy.value = true;
    discussionError.value = '';
    try {
      await postActivity('question', text);
      topicDraft.value = '';
    } catch (e) {
      discussionError.value = e?.response?.data?.error?.message || e?.message || 'Could not add your discussion point.';
    } finally {
      topicBusy.value = false;
    }
  }

  async function postChat() {
    const text = chatDraft.value.trim();
    if (!text || chatBusy.value) return;
    chatBusy.value = true;
    discussionError.value = '';
    try {
      await postActivity('chat', text);
      chatDraft.value = '';
    } catch (e) {
      discussionError.value = e?.response?.data?.error?.message || e?.message || 'Could not send your message.';
    } finally {
      chatBusy.value = false;
    }
  }

  async function upvote(item) {
    discussionError.value = '';
    try {
      const joinTok = String(props.joinToken || '').trim();
      const isGuest = String(props.joinIdentity || '').startsWith('guest-');
      if (isGuest && joinTok) {
        await api.post(`/supervision/guest-activity/${encodeURIComponent(joinTok)}`, {
          activityType: 'question',
          joinIdentity: props.joinIdentity,
          displayName: props.localDisplayName || 'Guest',
          payload: {
            text: item.text,
            authorName: item.author,
            upvotes: (item.upvotes || 0) + 1,
            replyToId: item.id
          }
        }, { skipAuthRedirect: true });
      } else {
        const sid = numericSessionId.value || props.supervisionSessionId;
        await api.post(`/supervision/sessions/${encodeURIComponent(sid)}/activity`, {
          activityType: 'question',
          payload: {
            text: item.text,
            authorName: item.author,
            upvotes: (item.upvotes || 0) + 1,
            replyToId: item.id
          }
        });
      }
      await refreshActivity();
    } catch (e) {
      discussionError.value = e?.response?.data?.error?.message || e?.message || 'Could not upvote.';
    }
  }

  watch(() => props.isInLobby, (inLobby) => {
    if (!inLobby) prioritizeSelfView.value = false;
    if (inLobby) stopLiveTranscriptCapture();
    refreshActivity();
    loadSessionTranscript();
    if (!inLobby) {
      refreshPresentation();
      refreshMyPresentation();
    }
  });

  onMounted(async () => {
    suspendInactivityTimeout();
    await refreshPresentation();
    await refreshMyPresentation();
    if (enableActivityFeed) await refreshActivity();
    await loadSessionTranscript();
    pollTimer.value = setInterval(() => {
      refreshPresentation();
      if (enableActivityFeed) refreshActivity();
      loadSessionTranscript();
    }, 5000);
  });

  onUnmounted(() => {
    resumeInactivityTimeout();
    if (pollTimer.value) clearInterval(pollTimer.value);
    stopLiveTranscriptCapture();
    void flushLiveTranscript({ final: true });
    if (lifecyclePosted.value) postLifecycle('left');
  });

  return {
    numericSessionId,
    showLobbyPanel,
    showWaitingRoomStage,
    prioritizeSelfView,
    onSelfStageClick,
    viewAsAttendee,
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
    transcriptRoomStopped,
    transcriptStopMeta,
    pauseLiveTranscript,
    resumeLiveTranscript,
    applyTranscriptRoomStop,
    liveTranscriptPreview,
    sessionTranscriptPreview,
    presentation,
    slides,
    currentSlide,
    myPresentation,
    canControlSlides,
    showPresenterNotes,
    isMyDeckActive,
    canPresentMyDeck,
    canStopPresenting,
    canEditCurrentSlide,
    presentMyDeck,
    stopPresenting,
    saveCurrentSlideContent,
    caseSummary,
    slidePositionLabel,
    slideBodyHtml,
    externalEmbedUrl,
    onVideoConnected,
    prevSlide,
    nextSlide,
    postTopic,
    postChat,
    upvote
  };
}

export const supervisionLiveRoomProps = {
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
  localRoleLabel: { type: String, default: '' },
  localProfilePhotoUrl: { type: String, default: '' },
  joinToken: { type: String, default: '' },
  hostPresent: { type: Boolean, default: false },
  hostRoleLabel: { type: String, default: 'Supervisor' },
  hostStatusLabel: { type: String, default: '' },
  waitingGoals: { type: Array, default: () => [] },
  waitingAgenda: { type: Array, default: () => [] },
  waitingActionItems: { type: Array, default: () => [] }
};

export function isIndividualSupervisionType(sessionMetaOrType) {
  const t = String(sessionMetaOrType || '').trim().toLowerCase();
  return !t || t === 'individual' || t === '1:1' || t === 'one_on_one' || t === 'one-on-one';
}
