<template>
  <div v-if="open" class="aap-root" role="dialog" aria-label="Ask assistant">
    <div class="aap-backdrop" @click="close" />
    <aside class="aap-drawer" @click.stop>
      <header class="aap-head">
        <div>
          <div class="aap-title">Ask anything</div>
          <div class="aap-sub">Open pages, find a school, event, or teammate.</div>
        </div>
        <button type="button" class="aap-icon-btn" @click="close" aria-label="Close">✕</button>
      </header>

      <div class="aap-body">
        <div v-if="turns.length === 0" class="aap-empty">
          Try: <em>"open the school portal for Valley Elementary"</em>,
          <em>"find the spring recital event"</em>, or
          <em>"take me to my schedule"</em>.
        </div>
        <ul v-else class="aap-turns">
          <li v-for="(t, idx) in turns" :key="idx" :class="['aap-turn', `is-${t.role}`]">
            <div class="aap-turn-role">{{ t.role === 'user' ? 'You' : 'Assistant' }}</div>
            <div class="aap-turn-body">
              <div>{{ t.text }}</div>
              <ul v-if="t.navs && t.navs.length" class="aap-navlist">
                <li v-for="(nav, i) in t.navs" :key="i">→ {{ nav }}</li>
              </ul>
            </div>
          </li>
        </ul>
        <div v-if="error" class="aap-error">{{ error }}</div>
      </div>

      <footer class="aap-foot">
        <textarea
          v-model="prompt"
          ref="textareaRef"
          rows="2"
          placeholder="Ask a question or say what to open…"
          @keydown.enter.exact.prevent="submit"
        />
        <div class="aap-foot-actions">
          <button
            v-if="sttSupported"
            type="button"
            :class="['aap-mic-btn', { 'is-listening': isListening }]"
            :aria-pressed="isListening"
            :title="isListening ? 'Stop dictation' : 'Start dictation'"
            @click="toggleMic"
          >
            <span class="aap-mic-dot" />
            {{ isListening ? 'Listening…' : 'Mic' }}
          </button>
          <button
            type="button"
            class="aap-send-btn"
            :disabled="busy || !prompt.trim()"
            @click="submit"
          >
            {{ busy ? 'Asking…' : 'Send' }}
          </button>
        </div>
      </footer>
    </aside>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useSpeechToText } from '../../composables/useSpeechToText';

const props = defineProps({
  open: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const prompt = ref('');
const busy = ref(false);
const error = ref('');
const turns = ref([]);
const textareaRef = ref(null);

const { isListening, isSupported: sttSupported, startListening, stopListening } = useSpeechToText({
  onFinal: (text) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    prompt.value = prompt.value ? `${prompt.value.trim()} ${clean}`.trim() : clean;
  }
});

function close() {
  if (isListening.value) stopListening();
  emit('close');
}

function toggleMic() {
  if (!sttSupported) return;
  if (isListening.value) stopListening();
  else startListening();
}

async function executeUiCommands(commands) {
  const arr = Array.isArray(commands) ? commands : [];
  const navs = [];
  for (const cmd of arr) {
    const type = String(cmd?.type || '').trim();
    if (type === 'navigate') {
      const to = String(cmd?.to || '').trim();
      if (!to) continue;
      navs.push(to);
      try {
        await router.push(to);
        // First successful navigation fulfills the ask — close the drawer so
        // the user can see the destination page.
        close();
      } catch (e) {
        console.warn('[AskAssistantPanel] navigation failed', e?.message);
      }
    } else if (type === 'highlight') {
      const sel = String(cmd?.selector || '').trim();
      if (!sel) continue;
      try {
        const el = document.querySelector(sel);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const prev = el.style.outline;
          el.style.outline = '3px solid rgba(99, 102, 241, 0.8)';
          setTimeout(() => { try { el.style.outline = prev || ''; } catch { /* noop */ } }, 2200);
        }
      } catch { /* noop */ }
    }
  }
  return navs;
}

async function submit() {
  const q = prompt.value.trim();
  if (!q || busy.value) return;
  busy.value = true;
  error.value = '';
  turns.value.push({ role: 'user', text: q });
  prompt.value = '';
  try {
    const resp = await api.post(
      '/agents/assist',
      {
        prompt: q,
        context: {
          routeName: route?.name ? String(route.name) : '',
          placementKey: 'ask_assistant',
          agencyId: agencyStore.currentAgency?.id || authStore.user?.agencyId || null
        }
      },
      { skipGlobalLoading: true }
    );
    const data = resp?.data || {};
    const navs = await executeUiCommands(data.uiCommands);
    turns.value.push({
      role: 'assistant',
      text: String(data.assistantText || '').trim() || '(No response)',
      navs
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Assistant request failed';
  } finally {
    busy.value = false;
    await nextTick();
    try { textareaRef.value?.focus?.(); } catch { /* noop */ }
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape' && props.open) close();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (isListening.value) stopListening();
});
</script>

<style scoped>
.aap-root {
  position: fixed;
  inset: 0;
  z-index: 19000;
  pointer-events: none;
}
.aap-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.25);
  pointer-events: auto;
  animation: aap-fade-in 0.15s ease-out;
}
.aap-drawer {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: min(420px, 100%);
  background: var(--card-bg, #fff);
  color: var(--text, #111);
  display: flex;
  flex-direction: column;
  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
  animation: aap-slide-in 0.2s ease-out;
}
@keyframes aap-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes aap-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
.aap-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.aap-title { font-weight: 700; font-size: 15px; }
.aap-sub { font-size: 12px; color: var(--muted, #6b7280); margin-top: 2px; }
.aap-icon-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--muted, #6b7280);
}
.aap-body {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
}
.aap-empty { font-size: 13px; color: var(--muted, #6b7280); line-height: 1.5; }
.aap-empty em { font-style: italic; color: inherit; }
.aap-turns { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.aap-turn-role { font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--muted, #6b7280); letter-spacing: 0.04em; }
.aap-turn.is-user .aap-turn-body { background: #eef2ff; color: #1e293b; }
.aap-turn.is-assistant .aap-turn-body { background: #f3f4f6; color: inherit; }
.aap-turn-body { padding: 8px 10px; border-radius: 8px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
.aap-navlist { margin: 6px 0 0; padding-left: 0; list-style: none; font-size: 12px; color: var(--muted, #6b7280); }
.aap-error { color: #b91c1c; font-size: 13px; padding: 8px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; margin-top: 10px; }
.aap-foot {
  border-top: 1px solid var(--border, #e5e7eb);
  padding: 10px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.aap-foot textarea {
  width: 100%;
  resize: none;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  background: var(--input-bg, #fff);
  color: inherit;
}
.aap-foot-actions { display: flex; justify-content: space-between; gap: 8px; }
.aap-mic-btn {
  background: transparent;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: inherit;
}
.aap-mic-btn.is-listening {
  border-color: #b91c1c;
  color: #b91c1c;
  background: #fef2f2;
}
.aap-mic-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: currentColor; opacity: 0.4;
}
.aap-mic-btn.is-listening .aap-mic-dot {
  opacity: 1;
  animation: aap-mic-pulse 1.2s ease-in-out infinite;
}
@keyframes aap-mic-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.6; }
}
.aap-send-btn {
  background: var(--primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.aap-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
