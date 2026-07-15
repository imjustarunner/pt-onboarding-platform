<template>
  <div class="ov-qnav" data-tour="dash-overview-search" @keydown="onRootKeydown">
    <label class="ov-qnav-label" for="ov-quick-nav-input">Jump to</label>
    <div class="ov-qnav-field" :class="{ 'is-open': panelOpen, 'is-focused': focused }">
      <span class="ov-qnav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" stroke-linecap="round" />
        </svg>
      </span>
      <input
        id="ov-quick-nav-input"
        ref="inputRef"
        v-model="query"
        type="search"
        class="ov-qnav-input"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="Search Payroll, Schedule, Documents…"
        role="combobox"
        :aria-expanded="panelOpen ? 'true' : 'false'"
        aria-autocomplete="list"
        aria-controls="ov-quick-nav-listbox"
        :aria-activedescendant="activeDescendantId"
        @focus="onFocus"
        @blur="onBlur"
        @input="onInput"
        @keydown="onInputKeydown"
      />
      <button
        v-if="query"
        type="button"
        class="ov-qnav-clear"
        aria-label="Clear search"
        @mousedown.prevent
        @click="clearQuery"
      >
        ×
      </button>
          <kbd v-else class="ov-qnav-hint" aria-hidden="true">{{ modHint }}</kbd>
    </div>

    <div
      v-if="panelOpen"
      id="ov-quick-nav-listbox"
      class="ov-qnav-panel"
      role="listbox"
      aria-label="Quick navigation results"
    >
      <template v-if="groups.length">
        <div v-for="group in groups" :key="group.group" class="ov-qnav-group">
          <div class="ov-qnav-group-label">{{ group.label }}</div>
          <button
            v-for="item in group.items"
            :id="optionId(item)"
            :key="item.id"
            type="button"
            class="ov-qnav-option"
            role="option"
            :aria-selected="activeId === item.id ? 'true' : 'false'"
            :class="{ 'is-active': activeId === item.id }"
            @mousedown.prevent="go(item)"
            @mouseenter="activeId = item.id"
          >
            <span class="ov-qnav-option-main">
              <span class="ov-qnav-option-label">{{ item.label }}</span>
              <span class="ov-qnav-option-desc">{{ item.description }}</span>
            </span>
            <span class="ov-qnav-badge">{{ item.groupLabel }}</span>
          </button>
        </div>
      </template>
      <div v-else-if="query.trim()" class="ov-qnav-empty" role="status">
        No matches — try Payroll, Schedule, Documents…
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import {
  buildQuickNavContext,
  resolveQuickNavLocation,
  searchQuickNav
} from '../../navigation/quickNavCatalog';

const props = defineProps({
  isClubContext: { type: Boolean, default: false },
  kudosEnabled: { type: Boolean, default: false },
  showSchedule: { type: Boolean, default: true },
  showPayroll: { type: Boolean, default: false },
  showClaims: { type: Boolean, default: false },
  showSupervision: { type: Boolean, default: false },
  showMySupervision: { type: Boolean, default: false },
  showChats: { type: Boolean, default: false }
});

const emit = defineEmits(['navigated']);

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const inputRef = ref(null);
const query = ref('');
const focused = ref(false);
const panelForcedOpen = ref(false);
const activeId = ref(null);
const modHint = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '')
  ? '⌘K'
  : 'Ctrl K';

const ctx = computed(() =>
  buildQuickNavContext({
    user: authStore.user,
    isClubContext: props.isClubContext,
    kudosEnabled: props.kudosEnabled,
    showSchedule: props.showSchedule,
    showPayroll: props.showPayroll,
    showClaims: props.showClaims,
    showSupervision: props.showSupervision,
    showMySupervision: props.showMySupervision,
    showChats: props.showChats,
    isOnboardingComplete: true
  })
);

const searchResult = computed(() => searchQuickNav(query.value, ctx.value));
const groups = computed(() => searchResult.value.groups);
const flat = computed(() => searchResult.value.flat);

const panelOpen = computed(
  () => (focused.value || panelForcedOpen.value) && String(query.value || '').trim().length > 0
);

const activeDescendantId = computed(() => {
  if (!panelOpen.value || !activeId.value) return undefined;
  return `ov-qnav-opt-${activeId.value}`;
});

function optionId(item) {
  return `ov-qnav-opt-${item.id}`;
}

watch(flat, (list) => {
  if (!list.length) {
    activeId.value = null;
    return;
  }
  if (!list.some((i) => i.id === activeId.value)) {
    activeId.value = list[0].id;
  }
});

function onFocus() {
  focused.value = true;
}

function onBlur() {
  // Delay so option mousedown can fire first.
  window.setTimeout(() => {
    focused.value = false;
    panelForcedOpen.value = false;
  }, 120);
}

function onInput() {
  panelForcedOpen.value = true;
}

function clearQuery() {
  query.value = '';
  activeId.value = null;
  nextTick(() => inputRef.value?.focus?.());
}

function moveActive(delta) {
  const list = flat.value;
  if (!list.length) return;
  const idx = list.findIndex((i) => i.id === activeId.value);
  const next = idx < 0 ? 0 : (idx + delta + list.length) % list.length;
  activeId.value = list[next].id;
  nextTick(() => {
    document.getElementById(optionId(list[next]))?.scrollIntoView?.({ block: 'nearest' });
  });
}

async function go(item) {
  if (!item) return;
  const orgSlug = route.params?.organizationSlug || null;
  const loc = resolveQuickNavLocation(item, {
    currentPath: route.path,
    orgSlug,
    currentQuery: route.query
  });
  if (!loc) return;
  query.value = '';
  activeId.value = null;
  panelForcedOpen.value = false;
  try {
    await router.push(loc);
    emit('navigated', item);
  } catch (e) {
    console.warn('[OverviewQuickNav] navigation failed', e?.message);
  }
}

function activateSelected() {
  const list = flat.value;
  if (!list.length) return;
  const hit = list.find((i) => i.id === activeId.value) || list[0];
  go(hit);
}

function onInputKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    panelForcedOpen.value = true;
    moveActive(1);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    panelForcedOpen.value = true;
    moveActive(-1);
    return;
  }
  if (e.key === 'Enter') {
    if (panelOpen.value && flat.value.length) {
      e.preventDefault();
      activateSelected();
    }
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (query.value) {
      clearQuery();
    } else {
      inputRef.value?.blur?.();
    }
  }
}

function onRootKeydown() {
  /* handled on input */
}

function isEditableTarget(t) {
  if (!t || !(t instanceof Element)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return !!t.closest?.('input, textarea, select, [contenteditable="true"]');
}

function onGlobalKeydown(e) {
  const isModK = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
  if (!isModK) return;
  if (isEditableTarget(e.target) && e.target !== inputRef.value) return;
  e.preventDefault();
  inputRef.value?.focus?.();
  panelForcedOpen.value = true;
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});
</script>

<style scoped>
.ov-qnav {
  position: relative;
  width: 100%;
  max-width: 560px;
}
.ov-qnav-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.ov-qnav-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ov-qnav-field.is-focused,
.ov-qnav-field.is-open {
  border-color: #86efac;
  box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
}
.ov-qnav-icon {
  flex: 0 0 auto;
  color: #6b7280;
  display: flex;
}
.ov-qnav-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  padding: 10px 0;
}
.ov-qnav-input::placeholder {
  color: #9ca3af;
  font-weight: 450;
}
.ov-qnav-clear {
  border: none;
  background: #f3f4f6;
  color: #4b5563;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-qnav-clear:hover {
  background: #e5e7eb;
}
.ov-qnav-hint {
  flex: 0 0 auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 2px 6px;
}
.ov-qnav-panel {
  position: absolute;
  z-index: 40;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  max-height: min(420px, 60vh);
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
  padding: 6px;
}
.ov-qnav-group + .ov-qnav-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #f3f4f6;
}
.ov-qnav-group-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9ca3af;
  padding: 6px 10px 4px;
}
.ov-qnav-option {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  color: inherit;
}
.ov-qnav-option:hover,
.ov-qnav-option.is-active {
  background: #f0fdf4;
}
.ov-qnav-option-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ov-qnav-option-label {
  font-size: 14px;
  font-weight: 650;
  color: #111827;
}
.ov-qnav-option-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.35;
}
.ov-qnav-badge {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #166534;
  background: #dcfce7;
  border-radius: 999px;
  padding: 3px 8px;
  margin-top: 2px;
}
.ov-qnav-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: #6b7280;
  text-align: center;
}

[data-theme='dark'] .ov-qnav-field {
  background: #25282c;
  border-color: #475569;
  box-shadow: none;
}
[data-theme='dark'] .ov-qnav-field.is-focused,
[data-theme='dark'] .ov-qnav-field.is-open {
  border-color: #4ade80;
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.15);
}
[data-theme='dark'] .ov-qnav-icon {
  color: #94a3b8;
}
[data-theme='dark'] .ov-qnav-input {
  color: #e2e8f0;
}
[data-theme='dark'] .ov-qnav-input::placeholder {
  color: #64748b;
}
[data-theme='dark'] .ov-qnav-clear {
  background: #334155;
  color: #cbd5e1;
}
[data-theme='dark'] .ov-qnav-hint {
  background: #1e293b;
  border-color: #475569;
  color: #94a3b8;
}
[data-theme='dark'] .ov-qnav-panel {
  background: #1e293b;
  border-color: #475569;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}
[data-theme='dark'] .ov-qnav-group + .ov-qnav-group {
  border-top-color: #334155;
}
[data-theme='dark'] .ov-qnav-option:hover,
[data-theme='dark'] .ov-qnav-option.is-active {
  background: #14532d;
}
[data-theme='dark'] .ov-qnav-option-label {
  color: #e2e8f0;
}
[data-theme='dark'] .ov-qnav-option-desc,
[data-theme='dark'] .ov-qnav-empty,
[data-theme='dark'] .ov-qnav-group-label {
  color: #94a3b8;
}
[data-theme='dark'] .ov-qnav-badge {
  background: #14532d;
  color: #86efac;
}

@media (max-width: 720px) {
  .ov-qnav {
    max-width: none;
  }
  .ov-qnav-hint {
    display: none;
  }
  .ov-qnav-panel {
    max-height: min(360px, 50vh);
  }
}
</style>
