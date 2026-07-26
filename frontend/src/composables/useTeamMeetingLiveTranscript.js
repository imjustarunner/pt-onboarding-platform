/**
 * Browser speech-to-text capture for team meetings / huddles.
 * Mirrors supervision live transcript: each participant flushes labeled chunks.
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

export function useTeamMeetingLiveTranscript({
  eventId,
  enabled,
  displayName
} = {}) {
  const authStore = useAuthStore();
  const liveChunks = ref([]);
  const transcriptHint = ref('');
  const capturing = ref(false);
  let speechRecognition = null;
  let flushTimer = null;

  const eid = computed(() => Number(eventId?.value ?? eventId ?? 0) || 0);
  const isEnabled = computed(() => !!(enabled?.value ?? enabled));

  function speakerLabel() {
    const fromProp = String(displayName?.value ?? displayName ?? '').trim();
    if (fromProp) return fromProp;
    const u = authStore.user || {};
    return `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim()
      || u.email
      || 'Participant';
  }

  async function flush({ final = false } = {}) {
    const chunks = (liveChunks.value || []).map((t) => String(t || '').trim()).filter(Boolean);
    if (!chunks.length || !eid.value) return;
    const transcript = chunks.join(' ').trim();
    if (!transcript) return;
    liveChunks.value = [];
    try {
      await api.post(
        `/team-meetings/${encodeURIComponent(eid.value)}/client-transcript`,
        {
          transcript,
          speakerLabel: speakerLabel(),
          replace: false
        },
        { skipGlobalLoading: true, skipAuthRedirect: true }
      );
      if (final) transcriptHint.value = 'Transcript saved for this meeting.';
    } catch (e) {
      liveChunks.value = [...chunks, ...liveChunks.value];
      if (final) {
        transcriptHint.value = e?.response?.data?.error?.message || 'Could not save live transcript.';
      }
    }
  }

  function stop() {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    try {
      speechRecognition?.stop?.();
    } catch {
      /* ignore */
    }
    speechRecognition = null;
    capturing.value = false;
  }

  function start() {
    if (!isEnabled.value || !eid.value || speechRecognition) return;
    const SR = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    if (!SR) {
      transcriptHint.value = 'Live transcript needs Chrome/Safari speech recognition (mic permission).';
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
          if (text) liveChunks.value.push(text);
        } catch {
          /* ignore */
        }
      };
      speechRecognition.onerror = () => {};
      speechRecognition.onend = () => {
        if (!speechRecognition || !isEnabled.value) return;
        try {
          speechRecognition.start();
        } catch {
          /* ignore */
        }
      };
      speechRecognition.start();
      capturing.value = true;
      transcriptHint.value = 'Listening for live transcript…';
      flushTimer = setInterval(() => {
        void flush({ final: false });
      }, 20000);
    } catch {
      transcriptHint.value = 'Could not start live transcript capture.';
      speechRecognition = null;
      capturing.value = false;
    }
  }

  async function stopAndFlush() {
    stop();
    await flush({ final: true });
  }

  watch(
    () => [isEnabled.value, eid.value],
    ([on, id]) => {
      if (on && id) start();
      else {
        void stopAndFlush();
      }
    },
    { immediate: true }
  );

  onUnmounted(() => {
    void stopAndFlush();
  });

  return {
    capturing,
    transcriptHint,
    livePreview: computed(() =>
      (liveChunks.value || []).map((t) => String(t || '').trim()).filter(Boolean).join(' ')
    ),
    start,
    stop,
    flush,
    stopAndFlush
  };
}
