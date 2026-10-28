import { ref } from 'vue';

/** Keep the saved enrollment accessible unless the server confirms termination. */
export function useEnrollmentTermination({ getSessionToken, stopSession, onStopped }) {
  const isOpen = ref(false);
  const busy = ref(false);
  const failed = ref(false);
  const stopped = ref(false);
  const open = () => { if (!busy.value && !stopped.value) { failed.value = false; isOpen.value = true; } };
  const cancel = () => { if (!busy.value) isOpen.value = false; };
  const confirm = async () => {
    if (!isOpen.value || busy.value || stopped.value) return;
    busy.value = true;
    failed.value = false;
    try {
      const token = String(getSessionToken() || '').trim();
      if (token) {
        const result = await stopSession(token);
        if (!result?.ok || !result?.sessionEnded || !result?.remindersStopped) throw new Error('Termination was not confirmed');
      }
      onStopped();
      stopped.value = true;
      isOpen.value = false;
    } catch {
      failed.value = true;
    } finally {
      busy.value = false;
    }
  };
  return { isOpen, busy, failed, stopped, open, cancel, confirm };
}
