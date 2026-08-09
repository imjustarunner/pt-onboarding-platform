<template>
  <div class="nsb-root" ref="rootRef">
    <!-- Trigger button -->
    <button
      type="button"
      class="nsb-trigger"
      :class="{ 'is-open': open }"
      aria-label="Search pages and features"
      title="Search pages — ⌘/Ctrl+K"
      @click="openSearch"
    >
      <svg class="nsb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" stroke-linecap="round" />
      </svg>
      <span class="nsb-hint" aria-hidden="true">Search</span>
    </button>

    <!-- Panel -->
    <Transition name="nsb-panel">
      <div
        v-if="open"
        class="nsb-panel"
        @mousedown.prevent
      >
        <!-- Input -->
        <div class="nsb-input-wrap">
          <svg class="nsb-input-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" stroke-linecap="round" />
          </svg>
          <input
            ref="inputRef"
            v-model="query"
            type="search"
            class="nsb-input"
            placeholder="Search or describe what you're trying to do…"
            autocomplete="off"
            spellcheck="false"
            aria-label="Search navigation"
            @keydown="onKeydown"
            @input="onInput"
          />
          <span v-if="aiLoading" class="nsb-ai-spinner" aria-label="AI thinking" />
          <kbd v-else-if="!query" class="nsb-esc-hint">Esc</kbd>
        </div>

        <!-- AI result banner -->
        <Transition name="nsb-ai">
          <div v-if="aiResult" class="nsb-ai-result" @click="navigateAi">
            <div class="nsb-ai-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" aria-hidden="true">
                <path d="M12 3c-4.97 0-9 3.58-9 8 0 1.42.38 2.76 1.05 3.95L3 21l6.02-1.64A8.9 8.9 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" stroke-linejoin="round"/>
                <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke-linecap="round" stroke-width="2.5"/>
              </svg>
              AI
            </div>
            <div class="nsb-ai-body">
              <div class="nsb-ai-title">{{ aiResult.title }}</div>
              <div class="nsb-ai-desc">{{ aiResult.text }}</div>
            </div>
            <svg class="nsb-ai-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </Transition>

        <!-- Empty state / suggestions -->
        <div v-if="!query" class="nsb-suggestions">
          <div class="nsb-suggestions-label">Try searching for</div>
          <div class="nsb-suggestion-chips">
            <button v-for="s in suggestions" :key="s" type="button" class="nsb-chip" @click="query = s; onInput()">
              {{ s }}
            </button>
          </div>
          <div class="nsb-suggestions-label nsb-suggestions-label--or">Or describe what you're trying to do</div>
          <div class="nsb-suggestion-chips">
            <button v-for="d in descSuggestions" :key="d" type="button" class="nsb-chip nsb-chip--desc" @click="query = d; onInput()">
              {{ d }}
            </button>
          </div>
        </div>

        <div v-else-if="results.length === 0 && !aiLoading && !aiResult" class="nsb-empty">
          No results for <strong>"{{ query }}"</strong>
          <div v-if="query.length >= 10" class="nsb-empty-hint">Try describing what you want to do — AI search is thinking…</div>
        </div>

        <!-- Keyword results -->
        <ul
          v-if="results.length > 0"
          class="nsb-list"
          role="listbox"
          aria-label="Search results"
        >
          <li
            v-for="(item, idx) in results"
            :key="item.fullPath + idx"
            :id="`nsb-item-${idx}`"
            class="nsb-item"
            :class="{ active: activeIndex === idx }"
            role="option"
            :aria-selected="activeIndex === idx"
            @mouseenter="activeIndex = idx"
            @click="navigate(item)"
          >
            <div class="nsb-item-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7"/>
                <path d="M21 21l-4.35-4.35" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="nsb-item-body">
              <div class="nsb-item-title" v-html="highlight(item.title, query)" />
              <div class="nsb-item-section">{{ item.section }}</div>
            </div>
            <svg class="nsb-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </li>
        </ul>

        <!-- Footer -->
        <div class="nsb-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> go</span>
          <span><kbd>Esc</kbd> close</span>
          <span class="nsb-footer-ai">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11" aria-hidden="true">
              <path d="M12 3c-4.97 0-9 3.58-9 8 0 1.42.38 2.76 1.05 3.95L3 21l6.02-1.64A8.9 8.9 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" stroke-linejoin="round"/>
            </svg>
            Describe what you want — AI will navigate you there
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { searchNav } from '../utils/navSearchIndex';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import { resolveAssistantNavigationPath } from '../utils/router';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const orgSlug = computed(() =>
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null
);

const agencyId = computed(() =>
  Number(agencyStore.currentAgency?.id || 0) || null
);

// ── State ──────────────────────────────────────────────────────────────────────
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const rootRef = ref(null);
const inputRef = ref(null);

const aiLoading = ref(false);
const aiResult = ref(null); // { title, text, path }
let aiDebounceTimer = null;
let aiAbortController = null;

// ── Suggestion chips ───────────────────────────────────────────────────────────
const suggestions = ['Coverage Needs', 'Payroll', 'School Management', 'Credentialing', 'Onboarding', 'Audit Center'];
const descSuggestions = [
  'I want to check school coverage gaps',
  'How do I run payroll?',
  'Where do I approve school requests?',
  'I need to review credentials'
];

// ── Keyword search ─────────────────────────────────────────────────────────────
const results = computed(() => searchNav(query.value, { orgSlug: orgSlug.value }));

watch(results, () => { activeIndex.value = 0; });

// ── AI navigation search ───────────────────────────────────────────────────────

/** Queries that look like intent descriptions rather than simple lookups. */
function looksDescriptive(q) {
  if (q.length < 12) return false;
  const intentWords = /\b(want|need|trying|how|where|find|show|check|review|manage|run|approve|view|look|get|see|go|open|access|navigate|help)\b/i;
  return intentWords.test(q) || q.includes(' ') && q.split(' ').length >= 3;
}

function cancelAiSearch() {
  clearTimeout(aiDebounceTimer);
  aiDebounceTimer = null;
  if (aiAbortController) {
    aiAbortController.abort();
    aiAbortController = null;
  }
  aiLoading.value = false;
}

async function runAiSearch(q) {
  if (!q || q.length < 10) {
    aiResult.value = null;
    return;
  }

  aiAbortController = new AbortController();
  aiLoading.value = true;
  aiResult.value = null;

  try {
    const resp = await api.post(
      '/agents/assist',
      {
        prompt: `Navigate me to the right page for this goal: "${q}"`,
        context: {
          routeName: route?.name ? String(route.name) : '',
          path: String(route?.fullPath || route?.path || ''),
          fullPath: String(route?.fullPath || route?.path || ''),
          profileUserId: null,
          placementKey: 'nav_search',
          agencyId: agencyId.value
        },
        history: []
      },
      { skipGlobalLoading: true, signal: aiAbortController.signal }
    );
    const data = resp?.data || {};

    // Extract navigation target from uiCommands
    const cmds = Array.isArray(data.uiCommands) ? data.uiCommands : [];
    const navCmd = cmds.find((c) => c?.type === 'navigate' && c?.to);

    if (navCmd?.to) {
      const rawTo = String(navCmd.to).trim();
      const fullPath = resolveAssistantNavigationPath(rawTo, { orgSlug: orgSlug.value });

      // Extract a friendly title from the path
      const pathLabel = rawTo
        .replace(/^\/[^/]+\/admin\//, '')
        .replace(/^admin\//, '')
        .replace(/-/g, ' ')
        .replace(/\?.*$/, '')
        .trim();
      const titleCase = pathLabel.replace(/\b\w/g, (c) => c.toUpperCase());

      aiResult.value = {
        title: titleCase || 'Suggested page',
        text: String(data.assistantText || '').trim() || `Based on your description, navigate to ${titleCase}.`,
        path: fullPath
      };
    } else if (data.assistantText) {
      // No nav command, but the assistant responded — show as info only
      aiResult.value = null;
    }
  } catch (err) {
    if (err?.name !== 'AbortError' && err?.code !== 'ERR_CANCELED') {
      // Silently fail — don't distract user if AI is unavailable
    }
  } finally {
    aiLoading.value = false;
    aiAbortController = null;
  }
}

function onInput() {
  cancelAiSearch();
  aiResult.value = null;

  const q = query.value.trim();
  if (!q || q.length < 3) return;

  if (looksDescriptive(q) || q.length >= 20) {
    aiDebounceTimer = setTimeout(() => runAiSearch(q), 700);
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function navigate(item) {
  if (!item) return;
  close();
  router.push(item.fullPath);
}

function navigateAi() {
  if (!aiResult.value?.path) return;
  close();
  router.push(aiResult.value.path);
}

// ── Keyboard ───────────────────────────────────────────────────────────────────
function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1);
    scrollActive();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
    scrollActive();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (results.value[activeIndex.value]) {
      navigate(results.value[activeIndex.value]);
    } else if (aiResult.value) {
      navigateAi();
    }
  }
}

function scrollActive() {
  nextTick(() => {
    document.getElementById(`nsb-item-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function highlight(text, q) {
  if (!q || q.length < 2) return text;
  const term = q.split(/\s+/)[0]; // highlight first word for cleanliness
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="nsb-mark">$1</mark>');
}

// ── Panel open / close ─────────────────────────────────────────────────────────
async function openSearch() {
  open.value = true;
  await nextTick();
  inputRef.value?.focus();
}

function close() {
  open.value = false;
  query.value = '';
  aiResult.value = null;
  cancelAiSearch();
  activeIndex.value = 0;
}

// ── Global keyboard shortcut ───────────────────────────────────────────────────
function handleGlobalKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    open.value ? close() : openSearch();
  }
}

function handleClickOutside(e) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target)) close();
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('mousedown', handleClickOutside);
});

onBeforeUnmount(() => {
  cancelAiSearch();
  window.removeEventListener('keydown', handleGlobalKeydown);
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<style scoped>
.nsb-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* ── Trigger ── */
.nsb-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.7);
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.nsb-trigger:hover,
.nsb-trigger.is-open {
  background: #fff;
  border-color: rgba(13, 148, 136, 0.45);
  color: #0f766e;
  box-shadow: 0 2px 8px rgba(13, 148, 136, 0.12);
}
.nsb-ic { width: 15px; height: 15px; flex-shrink: 0; }
.nsb-hint { font-size: 13px; }

@media (max-width: 900px) {
  .nsb-hint { display: none; }
  .nsb-trigger { width: 36px; justify-content: center; padding: 0; }
}

/* ── Panel ── */
.nsb-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 460px;
  max-width: calc(100vw - 24px);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  box-shadow:
    0 24px 64px rgba(15, 23, 42, 0.16),
    0 6px 20px rgba(15, 23, 42, 0.08);
  z-index: 9000;
  overflow: hidden;
}
.nsb-panel-enter-active,
.nsb-panel-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.nsb-panel-enter-from,
.nsb-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

/* ── Input ── */
.nsb-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 14px;
  border-bottom: 1px solid #f1f5f9;
}
.nsb-input-ic { width: 16px; height: 16px; color: #94a3b8; flex-shrink: 0; }
.nsb-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  font-family: inherit;
  color: #0f172a;
  background: transparent;
  min-width: 0;
}
.nsb-input::placeholder { color: #94a3b8; }
.nsb-input::-webkit-search-cancel-button { -webkit-appearance: none; }

.nsb-esc-hint {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid #e2e8f0;
  color: #94a3b8;
  font-family: inherit;
  background: #f8fafc;
  flex-shrink: 0;
}

/* ── AI spinner ── */
.nsb-ai-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #99f6e4;
  border-top-color: #0d9488;
  animation: nsb-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes nsb-spin {
  to { transform: rotate(360deg); }
}

/* ── AI result banner ── */
.nsb-ai-result {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 8px 10px 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%);
  border: 1px solid #99f6e4;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.nsb-ai-result:hover {
  background: linear-gradient(135deg, #ccfbf1 0%, #d1fae5 100%);
  box-shadow: 0 4px 12px rgba(13, 148, 136, 0.12);
}

.nsb-ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #0d9488, #059669);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  margin-top: 1px;
}
.nsb-ai-body { flex: 1; min-width: 0; }
.nsb-ai-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}
.nsb-ai-desc {
  font-size: 12px;
  color: #475569;
  margin-top: 2px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.nsb-ai-arrow { color: #0d9488; flex-shrink: 0; margin-top: 3px; }

.nsb-ai-enter-active,
.nsb-ai-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.nsb-ai-enter-from,
.nsb-ai-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Suggestions ── */
.nsb-suggestions { padding: 12px 14px 8px; }
.nsb-suggestions-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 8px;
}
.nsb-suggestions-label--or { margin-top: 12px; }
.nsb-suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.nsb-chip {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}
.nsb-chip:hover {
  border-color: #0d9488;
  color: #0f766e;
  background: #f0fdfa;
}
.nsb-chip--desc {
  border-color: #c7d2fe;
  background: #eef2ff;
  color: #4338ca;
}
.nsb-chip--desc:hover {
  border-color: #6366f1;
  background: #e0e7ff;
  color: #3730a3;
}

/* ── Empty ── */
.nsb-empty {
  padding: 20px 16px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
}
.nsb-empty-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
}

/* ── Results list ── */
.nsb-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0 0 4px;
  max-height: 340px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.nsb-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.nsb-item:hover,
.nsb-item.active { background: #f0fdfa; }
.nsb-item-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #f1f5f9;
  color: #64748b;
  flex-shrink: 0;
  transition: background 0.1s ease, color 0.1s ease;
}
.nsb-item.active .nsb-item-icon { background: #ccfbf1; color: #0f766e; }
.nsb-item-icon svg { width: 14px; height: 14px; }
.nsb-item-body { flex: 1; min-width: 0; }
.nsb-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nsb-item-section {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nsb-item-arrow {
  width: 14px;
  height: 14px;
  color: #cbd5e1;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.1s ease;
}
.nsb-item.active .nsb-item-arrow,
.nsb-item:hover .nsb-item-arrow { opacity: 1; color: #0d9488; }

/* ── Footer ── */
.nsb-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid #f1f5f9;
  font-size: 11px;
  color: #94a3b8;
  flex-wrap: wrap;
}
.nsb-footer kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 10px;
  font-family: inherit;
  margin-right: 2px;
}
.nsb-footer-ai {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #0d9488;
  font-weight: 600;
  font-size: 11px;
}

/* ── Highlight mark ── */
:deep(.nsb-mark) {
  background: #fef9c3;
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
</style>
