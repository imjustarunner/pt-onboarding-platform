<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="nac-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nac-title"
      @keydown.escape.prevent="chooseContinueWithout"
    >
      <div class="nac-modal" @click.stop>
        <header class="nac-head">
          <div class="nac-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <div class="nac-head-text">
            <h2 id="nac-title">Start a Log Time session?</h2>
            <p class="nac-sub">You’re hourly and not clocked in yet.</p>
          </div>
          <button
            type="button"
            class="nac-close"
            aria-label="Close"
            :disabled="busy"
            @click="chooseContinueWithout"
          >
            ×
          </button>
        </header>

        <p class="nac-body">
          Clock in now so Note Aid documentation counts on your Log Time session.
          Your timer keeps running while you write notes — no separate tracker.
        </p>

        <p v-if="error" class="nac-error" role="alert">{{ error }}</p>

        <footer class="nac-foot">
          <button
            type="button"
            class="nac-btn nac-btn-ghost"
            :disabled="busy"
            @click="chooseContinueWithout"
          >
            Open without clocking in
          </button>
          <button
            type="button"
            class="nac-btn nac-btn-primary"
            :disabled="busy"
            @click="chooseClockIn"
          >
            {{ busy ? 'Clocking in…' : 'Clock in & open Note Aid' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useIndirectTimeSessionStore } from '../store/indirectTimeSession';
import {
  getNoteAidClockInPromptState,
  resolveNoteAidClockInPrompt
} from '../utils/noteAidIndirectSession.js';

const store = useIndirectTimeSessionStore();
const promptState = getNoteAidClockInPromptState();
const open = computed(() => !!promptState.open);
const busy = ref(false);
const error = ref('');

watch(open, (isOpen) => {
  if (isOpen) {
    busy.value = false;
    error.value = '';
  }
});

function chooseContinueWithout() {
  if (busy.value) return;
  resolveNoteAidClockInPrompt({ clockIn: false });
}

async function chooseClockIn() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await store.clockIn();
    store.markNoteAidOpened();
    resolveNoteAidClockInPrompt({ clockIn: true, started: true });
  } catch (e) {
    error.value =
      e?.response?.data?.error?.message ||
      e?.message ||
      'Could not clock in. You can still open Note Aid without a session.';
    busy.value = false;
  }
}
</script>

<style scoped>
.nac-overlay {
  position: fixed;
  inset: 0;
  z-index: 12050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
}
.nac-modal {
  width: min(440px, 100%);
  background: #fff;
  border-radius: 16px;
  padding: 22px 22px 18px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  border: 1px solid #e5e7eb;
}
.nac-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.nac-icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #ecfdf5;
  color: #166534;
}
.nac-head-text {
  flex: 1;
  min-width: 0;
}
.nac-head h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 750;
  color: #14532d;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.nac-sub {
  margin: 4px 0 0;
  font-size: 0.88rem;
  color: #6b7280;
}
.nac-close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  color: #9ca3af;
  cursor: pointer;
  padding: 0 2px;
}
.nac-close:hover:not(:disabled) { color: #374151; }
.nac-close:disabled { opacity: 0.5; cursor: not-allowed; }
.nac-body {
  margin: 0 0 16px;
  font-size: 0.92rem;
  color: #374151;
  line-height: 1.5;
}
.nac-error {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.4;
}
.nac-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
.nac-btn {
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.9rem;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid transparent;
}
.nac-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.nac-btn-ghost {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}
.nac-btn-ghost:hover:not(:disabled) { background: #f9fafb; }
.nac-btn-primary {
  background: #166534;
  border-color: #166534;
  color: #fff;
}
.nac-btn-primary:hover:not(:disabled) { background: #14532d; }
@media (max-width: 480px) {
  .nac-foot { flex-direction: column-reverse; }
  .nac-btn { width: 100%; }
}
</style>
