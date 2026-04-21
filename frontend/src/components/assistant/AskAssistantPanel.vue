<template>
  <div v-if="open" class="aap-root" role="dialog" aria-label="Ask assistant">
    <div class="aap-backdrop" @click="close" />
    <aside class="aap-drawer" @click.stop>
      <div class="aap-accent" aria-hidden="true" />

      <header class="aap-head">
        <div class="aap-head-main">
          <div class="aap-head-icon" aria-hidden="true">
            <svg class="aap-head-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 3c-4.97 0-9 3.58-9 8 0 1.42.38 2.76 1.05 3.95L3 21l6.02-1.64A8.9 8.9 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <circle cx="9" cy="11" r="1" fill="currentColor" />
              <circle cx="12" cy="11" r="1" fill="currentColor" />
              <circle cx="15" cy="11" r="1" fill="currentColor" />
            </svg>
          </div>
          <div class="aap-head-text">
            <div class="aap-title">Assistant</div>
            <div class="aap-sub">{{ subtitle }}</div>
          </div>
        </div>
        <div class="aap-head-actions">
          <button
            v-if="turns.length > 0"
            type="button"
            class="aap-clear"
            title="Clear conversation"
            @click="clearChat"
          >
            Clear
          </button>
          <button type="button" class="aap-close" @click="close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div ref="turnsRef" class="aap-body">
        <div v-if="turns.length === 0" class="aap-empty">
          <div class="aap-empty-visual" aria-hidden="true">
            <div class="aap-empty-orbit" />
            <div class="aap-empty-core" />
          </div>
          <h3 class="aap-empty-title">What can I help with?</h3>
          <p class="aap-empty-desc">Ask in plain language, or try one of these.</p>
          <div class="aap-suggestions">
            <button
              v-for="(s, i) in suggestions"
              :key="i"
              type="button"
              class="aap-chip"
              @click="applySuggestion(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>
        <ul v-else class="aap-turns">
          <li v-for="(t, idx) in turns" :key="idx" :class="['aap-msg', `is-${t.role}`]">
            <div class="aap-msg-avatar" aria-hidden="true">
              <span v-if="t.role === 'user'" class="aap-avatar-user">You</span>
              <svg v-else class="aap-avatar-bot" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M9.5 9.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0Z"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <path
                  d="M5 19.5c.8-3.2 3.6-5.5 7-5.5s6.2 2.3 7 5.5"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <div class="aap-msg-col">
              <span class="aap-msg-meta">{{ t.role === 'user' ? 'You' : 'Assistant' }}</span>
              <div class="aap-msg-bubble">
                <div class="aap-msg-text">{{ t.text }}</div>
                <ul v-if="t.navs && t.navs.length" class="aap-navlist">
                  <li v-for="(nav, i) in t.navs" :key="i" class="aap-nav-item">
                    <span class="aap-nav-ic" aria-hidden="true">↗</span>
                    <span class="aap-nav-path">{{ nav }}</span>
                  </li>
                </ul>
                <div v-if="t.cards && t.cards.length" class="aap-cards">
                  <div v-for="(c, i) in t.cards" :key="i" class="aap-card">
                    <div class="aap-card-head">
                      <div class="aap-card-title">{{ c.title }}</div>
                      <div v-if="c.subtitle" class="aap-card-sub">{{ c.subtitle }}</div>
                    </div>
                    <div v-if="c.details" class="aap-card-details">
                      <div v-if="c.details.portalPath" class="aap-card-detail">
                        <span class="aap-card-k">Portal</span>
                        <span class="aap-card-v mono">{{ c.details.portalPath }}</span>
                      </div>
                      <div v-if="c.details.slug" class="aap-card-detail">
                        <span class="aap-card-k">Slug</span>
                        <span class="aap-card-v mono">{{ c.details.slug }}</span>
                      </div>
                      <div v-if="c.details.email" class="aap-card-detail">
                        <span class="aap-card-k">Email</span>
                        <span class="aap-card-v">{{ c.details.email }}</span>
                      </div>
                      <div v-if="c.details.role" class="aap-card-detail">
                        <span class="aap-card-k">Role</span>
                        <span class="aap-card-v mono">{{ c.details.role }}</span>
                      </div>
                      <div v-if="c.details.phone" class="aap-card-detail">
                        <span class="aap-card-k">Phone</span>
                        <span class="aap-card-v">{{ c.details.phone }}</span>
                      </div>
                      <div v-if="c.details.website" class="aap-card-detail">
                        <span class="aap-card-k">Website</span>
                        <span class="aap-card-v mono">{{ c.details.website }}</span>
                      </div>
                      <div v-if="c.details.startsAtIso" class="aap-card-detail">
                        <span class="aap-card-k">Starts</span>
                        <span class="aap-card-v">{{ formatIso(c.details.startsAtIso, c.details.timezone) }}</span>
                      </div>
                      <div v-if="c.details.endsAtIso" class="aap-card-detail">
                        <span class="aap-card-k">Ends</span>
                        <span class="aap-card-v">{{ formatIso(c.details.endsAtIso, c.details.timezone) }}</span>
                      </div>
                    </div>
                    <div v-if="c.actions && c.actions.length" class="aap-card-actions">
                      <button
                        v-for="(a, j) in c.actions"
                        :key="j"
                        type="button"
                        class="aap-card-btn"
                        :disabled="busy"
                        @click="handleActionClick(a)"
                      >
                        {{ a.label }}
                      </button>
                    </div>
                  </div>
                </div>
                <div v-if="t.actions && t.actions.length" class="aap-actions">
                  <button
                    v-for="(a, i) in t.actions"
                    :key="i"
                    type="button"
                    class="aap-action"
                    :disabled="busy"
                    @click="handleActionClick(a)"
                  >
                    {{ a.label }}
                  </button>
                </div>
              </div>
            </div>
          </li>
          <li v-if="busy" class="aap-msg is-assistant aap-msg--typing">
            <div class="aap-msg-avatar" aria-hidden="true">
              <svg class="aap-avatar-bot" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M9.5 9.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0Z"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <path
                  d="M5 19.5c.8-3.2 3.6-5.5 7-5.5s6.2 2.3 7 5.5"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <div class="aap-msg-col">
              <span class="aap-msg-meta">Assistant</span>
              <div class="aap-msg-bubble aap-typing-bubble">
                <span class="aap-dot" /><span class="aap-dot" /><span class="aap-dot" />
              </div>
            </div>
          </li>
        </ul>
        <div v-if="error" class="aap-error" role="alert">{{ error }}</div>
      </div>

      <footer class="aap-foot">
        <div class="aap-composer">
          <textarea
            v-model="prompt"
            ref="textareaRef"
            rows="1"
            class="aap-input"
            placeholder="Ask anything…"
            @keydown.enter.exact.prevent="submit"
            @input="autoGrow"
          />
          <div class="aap-composer-actions">
            <button
              v-if="sttSupported"
              type="button"
              :class="['aap-mic', { 'is-listening': isListening }]"
              :aria-pressed="isListening"
              :title="isListening ? 'Stop dictation' : 'Dictate'"
              @click="toggleMic"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path
                  d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zM11 19h2v2h-2v-2z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="aap-send"
              :disabled="busy || !prompt.trim()"
              :title="busy ? 'Sending…' : 'Send'"
              @click="submit"
            >
              <span v-if="busy" class="aap-send-spinner" aria-hidden="true" />
              <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="aap-send-sr">{{ busy ? 'Sending' : 'Send' }}</span>
            </button>
          </div>
        </div>
        <p class="aap-foot-hint"><kbd>Enter</kbd> send · <kbd>Esc</kbd> close</p>
      </footer>
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase().trim());
const isSuperAdmin = computed(() => roleNorm.value === 'super_admin' || roleNorm.value === 'superadmin');
const isAdminLike = computed(() => ['admin', 'support', 'staff'].includes(roleNorm.value) || isSuperAdmin.value);
const isProviderLike = computed(() =>
  ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant', 'supervisor'].includes(roleNorm.value)
);

const subtitle = computed(() => {
  if (isAdminLike.value) return 'Navigate · schools & events · referrals · audit activity';
  if (isProviderLike.value) return 'Navigate · schedule · referrals · recent activity';
  return 'Navigate · referrals · recent activity';
});

const suggestions = computed(() => {
  const s = [];
  const rn = String(route?.name || '').toLowerCase();

  // Provider-first defaults
  if (isProviderLike.value) {
    s.push('Take me to my schedule');
    s.push('I need a few pediatrics or psychiatry referrals for my client');
    s.push('Show me what I did today');
    s.push('When did I last log in?');
  } else {
    // Everyone else still gets safe, personal prompts
    s.push('Show me what I did today');
    s.push('When did I last log in?');
    s.push('I need a few pediatrics or psychiatry referrals for my client');
  }

  // Route/context boosts (still safe)
  if (rn.includes('skillbuilders') || rn.includes('program') || String(route?.path || '').includes('/program-events')) {
    s.unshift('Find the program event called "Orientation"');
  }
  if (String(route?.path || '').includes('/referral-directory')) {
    s.unshift('Find pediatric psychiatry referrals');
  }

  // Admin-only prompts
  if (isAdminLike.value) {
    s.push('What activity happened in my agency this week?');
    if (isSuperAdmin.value) {
      s.push('Who sent password reset links in the last 7 days?');
    }
  }

  // Keep it short + stable
  return Array.from(new Set(s)).slice(0, 6);
});

const prompt = ref('');
const busy = ref(false);
const error = ref('');
const turns = ref([]);
const textareaRef = ref(null);
const turnsRef = ref(null);

const { isListening, isSupported: sttSupported, startListening, stopListening } = useSpeechToText({
  onFinal: (text) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    prompt.value = prompt.value ? `${prompt.value.trim()} ${clean}`.trim() : clean;
    autoGrow();
  }
});

function scrollTurnsToBottom() {
  nextTick(() => {
    const el = turnsRef.value;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  });
}

watch(
  () => turns.value.length,
  () => scrollTurnsToBottom()
);
watch(
  () => busy.value,
  () => scrollTurnsToBottom()
);

function autoGrow() {
  const ta = textareaRef.value;
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}

function applySuggestion(s) {
  prompt.value = s;
  nextTick(() => {
    textareaRef.value?.focus?.();
    autoGrow();
  });
}

function close() {
  if (isListening.value) stopListening();
  emit('close');
}

/** Nothing is written to disk; this clears in-memory transcript and draft (also runs when the drawer closes). */
function clearChat() {
  turns.value = [];
  error.value = '';
  prompt.value = '';
  if (isListening.value) stopListening();
  nextTick(() => {
    const ta = textareaRef.value;
    if (ta) ta.style.height = 'auto';
    autoGrow();
    textareaRef.value?.focus?.();
  });
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
          el.style.outline = '3px solid rgba(13, 148, 136, 0.65)';
          setTimeout(() => {
            try {
              el.style.outline = prev || '';
            } catch {
              /* noop */
            }
          }, 2200);
        }
      } catch {
        /* noop */
      }
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
  nextTick(() => {
    autoGrow();
    scrollTurnsToBottom();
  });
  try {
    const resp = await api.post('/agents/assist', { prompt: q, context: buildContextPayload() }, { skipGlobalLoading: true });
    const data = resp?.data || {};
    const navs = await executeUiCommands(data.uiCommands);
    turns.value.push({
      role: 'assistant',
      text: String(data.assistantText || '').trim() || '(No response)',
      navs,
      actions: Array.isArray(data.nextActions) ? data.nextActions : [],
      cards: Array.isArray(data.nextCards) ? data.nextCards : []
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Assistant request failed';
  } finally {
    busy.value = false;
    await nextTick();
    scrollTurnsToBottom();
    try {
      textareaRef.value?.focus?.();
    } catch {
      /* noop */
    }
  }
}

function buildContextPayload() {
  return {
    routeName: route?.name ? String(route.name) : '',
    placementKey: 'ask_assistant',
    agencyId: agencyStore.currentAgency?.id || authStore.user?.agencyId || null
  };
}

function prefillActionText(a) {
  const t = a?.prefillText == null ? '' : String(a.prefillText);
  return t.trim();
}

function handleActionClick(a) {
  const type = String(a?.type || '').trim() || (a?.toolCall ? 'tool' : a?.prefillText ? 'prefill' : '');
  if (type === 'prefill') {
    const txt = prefillActionText(a);
    if (!txt) return;
    prompt.value = txt;
    nextTick(() => {
      textareaRef.value?.focus?.();
      autoGrow();
    });
    return;
  }
  runNextAction(a);
}

async function runNextAction(a) {
  if (!a || busy.value) return;
  const label = String(a.label || '').trim() || 'Run action';
  const toolCall = a.toolCall && typeof a.toolCall === 'object' ? a.toolCall : null;
  if (!toolCall) return;

  busy.value = true;
  error.value = '';
  turns.value.push({ role: 'user', text: label });
  nextTick(() => scrollTurnsToBottom());

  try {
    const resp = await api.post(
      '/agents/assist',
      {
        prompt: '',
        clientAction: { toolCall },
        context: buildContextPayload()
      },
      { skipGlobalLoading: true }
    );
    const data = resp?.data || {};
    const navs = await executeUiCommands(data.uiCommands);
    turns.value.push({
      role: 'assistant',
      text: String(data.assistantText || '').trim() || '(No response)',
      navs,
      actions: Array.isArray(data.nextActions) ? data.nextActions : [],
      cards: Array.isArray(data.nextCards) ? data.nextCards : []
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Action failed';
  } finally {
    busy.value = false;
    await nextTick();
    scrollTurnsToBottom();
    try {
      textareaRef.value?.focus?.();
    } catch {
      /* noop */
    }
  }
}

function formatIso(iso, timezone) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  try {
    // We display in the user's local timezone; the event timezone is shown in the string if provided.
    const fmt = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    const base = fmt.format(d);
    const tz = String(timezone || '').trim();
    return tz ? `${base} (${tz})` : base;
  } catch {
    return d.toLocaleString();
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape' && props.open) close();
}

watch(
  () => props.open,
  (v) => {
    if (!v) {
      clearChat();
      return;
    }
    nextTick(() => {
      textareaRef.value?.focus?.();
      autoGrow();
      scrollTurnsToBottom();
    });
  }
);

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
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: auto;
  animation: aap-backdrop-in 0.22s ease-out;
}

@keyframes aap-backdrop-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.aap-drawer {
  --aap-teal: #0d9488;
  --aap-teal-d: #0f766e;
  --aap-slate: #0f172a;
  --aap-muted: #64748b;
  --aap-line: rgba(148, 163, 184, 0.35);
  --aap-glow: rgba(13, 148, 136, 0.22);

  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 100vw - 12px);
  margin: 10px 10px 10px 0;
  border-radius: 20px;
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 48%, #f1f5f9 100%);
  color: var(--aap-slate);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.7) inset,
    -32px 0 64px -16px rgba(15, 23, 42, 0.18),
    0 24px 48px -12px rgba(15, 23, 42, 0.12);
  pointer-events: auto;
  animation: aap-drawer-in 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes aap-drawer-in {
  from {
    opacity: 0;
    transform: translateX(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.aap-accent {
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, var(--aap-teal-d), #2dd4bf, #6366f1);
  flex-shrink: 0;
}

.aap-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--aap-line);
}

.aap-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.aap-clear {
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--aap-muted);
  background: rgba(148, 163, 184, 0.12);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.aap-clear:hover {
  background: rgba(13, 148, 136, 0.12);
  color: var(--aap-teal-d);
}

.aap-head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.aap-head-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(145deg, #ccfbf1, #e0e7ff);
  color: var(--aap-teal-d);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 14px var(--aap-glow);
}

.aap-head-svg {
  width: 24px;
  height: 24px;
}

.aap-head-text {
  min-width: 0;
}

.aap-title {
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.aap-sub {
  font-size: 12px;
  color: var(--aap-muted);
  margin-top: 3px;
  line-height: 1.35;
}

.aap-close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--aap-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.aap-close:hover {
  background: rgba(148, 163, 184, 0.15);
  color: var(--aap-slate);
}

.aap-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 18px;
  scroll-behavior: smooth;
}

.aap-body::-webkit-scrollbar {
  width: 6px;
}
.aap-body::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.45);
  border-radius: 99px;
}

/* Empty */
.aap-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 12px 4px 8px;
}

.aap-empty-visual {
  position: relative;
  width: 72px;
  height: 72px;
  margin-bottom: 18px;
}

.aap-empty-orbit {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px dashed rgba(13, 148, 136, 0.25);
  animation: aap-orbit 14s linear infinite;
}

@keyframes aap-orbit {
  to {
    transform: rotate(360deg);
  }
}

.aap-empty-core {
  position: absolute;
  inset: 14px;
  border-radius: 50%;
  background: linear-gradient(145deg, #5eead4, #99f6e4);
  opacity: 0.9;
  box-shadow: 0 8px 24px rgba(13, 148, 136, 0.25);
}

.aap-empty-title {
  margin: 0 0 6px;
  font-size: 1.125rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--aap-slate);
}

.aap-empty-desc {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--aap-muted);
  line-height: 1.5;
  max-width: 280px;
}

.aap-suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 100%;
}

.aap-chip {
  text-align: left;
  width: 100%;
  padding: 11px 14px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--aap-slate);
  background: #fff;
  border: 1px solid var(--aap-line);
  border-radius: 14px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
}

.aap-chip:hover {
  border-color: rgba(13, 148, 136, 0.45);
  box-shadow: 0 4px 16px rgba(13, 148, 136, 0.12);
  transform: translateY(-1px);
}

/* Messages */
.aap-turns {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.aap-msg {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  animation: aap-msg-in 0.25s ease-out;
}

@keyframes aap-msg-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.aap-msg.is-user {
  flex-direction: row-reverse;
}

.aap-msg-avatar {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.aap-msg.is-user .aap-msg-avatar {
  background: linear-gradient(145deg, #6366f1, #818cf8);
  color: #fff;
}

.aap-msg.is-assistant .aap-msg-avatar {
  background: linear-gradient(145deg, #f1f5f9, #e2e8f0);
  color: var(--aap-teal-d);
}

.aap-avatar-user {
  font-size: 8px;
}

.aap-avatar-bot {
  width: 18px;
  height: 18px;
}

.aap-msg-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: calc(100% - 44px);
}

.aap-msg.is-user .aap-msg-col {
  align-items: flex-end;
}

.aap-msg-meta {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--aap-muted);
  padding: 0 2px;
}

.aap-msg-bubble {
  border-radius: 16px;
  padding: 11px 14px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.aap-msg.is-user .aap-msg-bubble {
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  color: #fff;
  border-bottom-right-radius: 5px;
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.28);
}

.aap-msg.is-assistant .aap-msg-bubble {
  background: #fff;
  border: 1px solid var(--aap-line);
  border-bottom-left-radius: 5px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
}

.aap-msg-text {
  margin: 0;
}

.aap-navlist {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.aap-msg.is-user .aap-navlist {
  opacity: 0.95;
}

.aap-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
}

.aap-msg.is-assistant .aap-nav-item {
  background: rgba(13, 148, 136, 0.06);
  color: var(--aap-teal-d);
}

.aap-nav-ic {
  font-size: 11px;
  opacity: 0.85;
}

.aap-nav-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  word-break: break-all;
}

.aap-msg.is-user .aap-nav-item {
  background: rgba(255, 255, 255, 0.15);
  color: #e0e7ff;
}

.aap-actions {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aap-action {
  text-align: left;
  width: 100%;
  padding: 9px 12px;
  font-size: 12.5px;
  line-height: 1.35;
  color: var(--aap-slate);
  background: linear-gradient(180deg, rgba(13, 148, 136, 0.08), rgba(13, 148, 136, 0.03));
  border: 1px solid rgba(13, 148, 136, 0.25);
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.aap-action:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(13, 148, 136, 0.4);
  box-shadow: 0 6px 18px rgba(13, 148, 136, 0.12);
}

.aap-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.aap-cards {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.aap-card {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.9), rgba(255, 255, 255, 1));
  padding: 10px 12px;
}

.aap-card-title {
  font-weight: 850;
  font-size: 13px;
  line-height: 1.25;
  color: var(--aap-slate);
}

.aap-card-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--aap-muted);
  line-height: 1.25;
}

.aap-card-details {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aap-card-detail {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  line-height: 1.3;
}

.aap-card-k {
  min-width: 52px;
  font-weight: 800;
  color: var(--aap-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 10px;
}

.aap-card-v {
  color: var(--aap-slate);
  word-break: break-word;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.aap-card-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.aap-card-btn {
  border: 1px solid rgba(13, 148, 136, 0.25);
  background: rgba(13, 148, 136, 0.06);
  color: var(--aap-teal-d);
  border-radius: 999px;
  padding: 7px 10px;
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
}

.aap-card-btn:hover:not(:disabled) {
  background: rgba(13, 148, 136, 0.12);
  border-color: rgba(13, 148, 136, 0.4);
  transform: translateY(-1px);
}

.aap-card-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* Typing */
.aap-typing-bubble {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 14px 18px;
  min-height: 44px;
}

.aap-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--aap-muted);
  animation: aap-bounce 1.1s ease-in-out infinite;
}
.aap-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.aap-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes aap-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-5px);
    opacity: 1;
  }
}

.aap-error {
  margin-top: 12px;
  padding: 11px 14px;
  font-size: 13px;
  line-height: 1.45;
  color: #991b1b;
  background: linear-gradient(135deg, #fef2f2, #fff7ed);
  border: 1px solid #fecaca;
  border-radius: 12px;
}

/* Footer */
.aap-foot {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--aap-line);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(10px);
}

.aap-composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--aap-line);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
}

.aap-input {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  resize: none;
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font: inherit;
  font-size: 14px;
  line-height: 1.45;
  background: transparent;
  color: var(--aap-slate);
}

.aap-input::placeholder {
  color: #94a3b8;
}

.aap-input:focus {
  outline: none;
}

.aap-composer:focus-within {
  border-color: rgba(13, 148, 136, 0.45);
  box-shadow: 0 0 0 3px var(--aap-glow), 0 4px 20px rgba(15, 23, 42, 0.06);
}

.aap-composer-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 0 6px 6px;
}

.aap-mic {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: #f1f5f9;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
}

.aap-mic:hover {
  background: #e2e8f0;
  color: var(--aap-slate);
}

.aap-mic.is-listening {
  background: #fef2f2;
  color: #dc2626;
  animation: aap-mic-glow 1.2s ease-in-out infinite;
}

@keyframes aap-mic-glow {
  50% {
    box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.15);
  }
}

.aap-send {
  position: relative;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(145deg, var(--aap-teal-d), var(--aap-teal));
  box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35);
  transition: transform 0.12s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.aap-send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(13, 148, 136, 0.4);
}

.aap-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.aap-send-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: aap-spin 0.65s linear infinite;
}

@keyframes aap-spin {
  to {
    transform: rotate(360deg);
  }
}

.aap-send-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.aap-foot-hint {
  margin: 10px 4px 0;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}

.aap-foot-hint kbd {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 4px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
</style>
