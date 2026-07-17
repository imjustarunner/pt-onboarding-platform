import { reactive } from 'vue';
import { useIndirectTimeSessionStore } from '../store/indirectTimeSession';

const DECLINED_KEY = 'itl-note-aid-declined-clockin';

/** Shared prompt UI state — NoteAidClockInPromptModal reads this. */
const promptState = reactive({
  open: false
});

let promptResolver = null;

function setDeclined(declined) {
  try {
    if (declined) sessionStorage.setItem(DECLINED_KEY, '1');
    else sessionStorage.removeItem(DECLINED_KEY);
  } catch {
    /* ignore */
  }
}

function wasDeclined() {
  try {
    return sessionStorage.getItem(DECLINED_KEY) === '1';
  } catch {
    return false;
  }
}

export function getNoteAidClockInPromptState() {
  return promptState;
}

/**
 * Resolve the open clock-in prompt (called by the modal).
 * @param {{ clockIn: boolean, started?: boolean }} choice
 */
export function resolveNoteAidClockInPrompt(choice) {
  if (!promptResolver) {
    promptState.open = false;
    return;
  }
  const resolve = promptResolver;
  promptResolver = null;
  promptState.open = false;
  resolve({
    clockIn: !!choice?.clockIn,
    started: !!choice?.started
  });
}

function askClockInViaModal() {
  if (promptResolver) {
    // Previous prompt abandoned — treat as continue without.
    resolveNoteAidClockInPrompt({ clockIn: false });
  }
  promptState.open = true;
  return new Promise((resolve) => {
    promptResolver = resolve;
  });
}

/**
 * For hourly workers opening Note Aid without a Log Time clock-in:
 * offer a modal to start a session so documentation can count on the clock.
 *
 * @param {{ skipPrompt?: boolean }} [opts]
 * @returns {Promise<{ fromIndirectSession: boolean, started: boolean }>}
 */
export async function ensureHourlySessionForNoteAid(opts = {}) {
  const skipPrompt = !!opts.skipPrompt;
  const store = useIndirectTimeSessionStore();

  if (!store.isHourlyWorker) {
    return { fromIndirectSession: false, started: false };
  }

  if (!store.isClockedIn && store.agencyId) {
    try {
      await store.refresh({ force: true });
    } catch {
      /* continue with local state */
    }
  }

  if (store.isClockedIn) {
    setDeclined(false);
    store.markNoteAidOpened();
    return { fromIndirectSession: true, started: false };
  }

  if (skipPrompt || wasDeclined()) {
    return { fromIndirectSession: false, started: false };
  }

  const choice = await askClockInViaModal();

  if (!choice?.clockIn) {
    setDeclined(true);
    return { fromIndirectSession: false, started: false };
  }

  // Modal already clocked in on success; mark session link.
  setDeclined(false);
  if (store.isClockedIn) {
    store.markNoteAidOpened();
  }
  return {
    fromIndirectSession: store.isClockedIn,
    started: !!choice.started
  };
}
