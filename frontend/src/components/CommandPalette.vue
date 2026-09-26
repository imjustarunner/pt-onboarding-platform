<template>
  <Teleport to="body">
    <Transition name="cp-fade">
      <div v-if="open" class="cp-overlay" @mousedown.self="closePalette">
        <div
          class="cp-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="mode === 'nav' ? 'Quick navigation' : mode === 'ask' ? 'Ask assistant' : 'Command palette'"
          @mousedown.stop
        >
          <!-- Mode picker -->
          <div v-if="!mode" class="cp-picker">
            <div class="cp-picker-head">
              <span class="cp-kbd-hint"><kbd>⌘</kbd><kbd>K</kbd></span>
              <h2 class="cp-picker-title">What do you need?</h2>
              <p class="cp-picker-sub">Jump to a page instantly, or ask about schedules, availability, and your team.</p>
              <p v-if="commandSurface" class="cp-surface-hint">
                Prioritizing <strong>{{ commandSurface.label }}</strong> tools first
              </p>
            </div>
            <div class="cp-mode-cards">
              <button
                type="button"
                class="cp-mode-card cp-mode-card--nav"
                :class="{ 'is-focused': pickerFocus === 0 }"
                @click="selectMode('nav')"
                @mouseenter="pickerFocus = 0"
              >
                <span class="cp-mode-icon cp-mode-icon--nav" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="cp-mode-label">Quick Nav</span>
                <span class="cp-mode-desc">Find payroll, schedules, credentials, payments, and other tools.</span>
                <span class="cp-mode-shortcut"><kbd>1</kbd></span>
              </button>
              <button
                type="button"
                class="cp-mode-card cp-mode-card--ask"
                :class="{ 'is-focused': pickerFocus === 1 }"
                @click="selectMode('ask')"
                @mouseenter="pickerFocus = 1"
              >
                <span class="cp-mode-icon cp-mode-icon--ask" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 3c-4.97 0-9 3.58-9 8 0 1.42.38 2.76 1.05 3.95L3 21l6.02-1.64A8.9 8.9 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" stroke-linejoin="round" />
                  </svg>
                </span>
                <span class="cp-mode-label">Ask</span>
                <span class="cp-mode-desc">Query live data — who's free, who's in, schedules, coverage, and client fit.</span>
                <span class="cp-mode-shortcut"><kbd>2</kbd></span>
              </button>
            </div>
          </div>

          <!-- Active mode -->
          <template v-else>
            <div class="cp-toolbar">
              <button type="button" class="cp-back" @click="backToPicker" aria-label="Back to mode selection">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <span class="cp-mode-pill" :class="`cp-mode-pill--${mode}`">
                {{ mode === 'nav' ? 'Quick Nav' : 'Ask' }}
              </span>
              <div class="cp-mode-tabs">
                <button
                  type="button"
                  class="cp-mode-tab"
                  :class="{ 'is-active': mode === 'nav' }"
                  @click="selectMode('nav')"
                >Nav</button>
                <button
                  type="button"
                  class="cp-mode-tab"
                  :class="{ 'is-active': mode === 'ask' }"
                  @click="selectMode('ask')"
                >Ask</button>
              </div>
              <button type="button" class="cp-close" aria-label="Close" @click="closePalette">Esc</button>
            </div>

            <div class="cp-input-wrap" :class="`cp-input-wrap--${mode}`">
              <span class="cp-input-icon" aria-hidden="true">
                <svg v-if="mode === 'nav'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" stroke-linecap="round" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3c-4.97 0-9 3.58-9 8 0 1.42.38 2.76 1.05 3.95L3 21l6.02-1.64A8.9 8.9 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" stroke-linejoin="round" />
                </svg>
              </span>
              <input
                ref="inputRef"
                v-model="query"
                type="search"
                class="cp-input"
                :placeholder="mode === 'nav' ? 'Jump to payroll, schedule, credentials…' : 'Who is free today? What is Hale\'s schedule?'"
                autocomplete="off"
                spellcheck="false"
                @keydown="onKeydown"
              />
            </div>

            <div class="cp-body">
              <!-- Nav: live results -->
              <p v-if="navigationError" class="cp-navigation-error" role="alert">{{ navigationError }}</p>
              <p v-if="navigating" class="cp-navigation-status" role="status">Opening page…</p>
              <ul v-if="mode === 'nav' && navResults.length" class="cp-results" role="listbox">
                <li
                  v-for="(item, idx) in navResults"
                  :key="item.id"
                  class="cp-result"
                  :class="{ active: activeIndex === idx }"
                  role="option"
                  :aria-selected="activeIndex === idx"
                  @mouseenter="activeIndex = idx"
                  @click="goNav(item)"
                >
                  <div class="cp-result-body">
                    <div class="cp-result-title">{{ item.label }}</div>
                    <div class="cp-result-meta">{{ item.description || item.groupLabel }}</div>
                  </div>
                  <span class="cp-result-badge">{{ item.groupLabel }}</span>
                </li>
              </ul>

              <div v-else-if="mode === 'nav' && query && !navResults.length" class="cp-empty">
                No page match for <strong>"{{ query }}"</strong>
              </div>

              <!-- Empty / suggestions -->
              <div v-if="!query || mode === 'ask'" class="cp-suggestions">
                <div v-if="recentItems.length" class="cp-section">
                  <div class="cp-section-label">Recent</div>
                  <div class="cp-chips">
                    <button
                      v-for="(item, i) in recentItems"
                      :key="`recent-${i}`"
                      type="button"
                      class="cp-chip"
                      :class="`cp-chip--${mode}`"
                      @click="mode === 'nav' ? goNavRecent(item) : submitAsk(item.prompt)"
                    >
                      {{ mode === 'nav' ? item.title : item.prompt }}
                    </button>
                  </div>
                </div>

                <div v-if="frequentItems.length" class="cp-section">
                  <div class="cp-section-label">Frequent</div>
                  <div class="cp-chips">
                    <button
                      v-for="(item, i) in frequentItems"
                      :key="`freq-${i}`"
                      type="button"
                      class="cp-chip"
                      :class="`cp-chip--${mode}`"
                      @click="mode === 'nav' ? goNavRecent(item) : submitAsk(item.prompt)"
                    >
                      {{ mode === 'nav' ? item.title : item.prompt }}
                    </button>
                  </div>
                </div>

                <div class="cp-section">
                  <div class="cp-section-label">
                    {{ mode === 'nav'
                      ? (commandSurface ? `On ${commandSurface.label}` : 'Popular destinations')
                      : (commandSurface ? `Ask from ${commandSurface.label}` : 'Try asking') }}
                  </div>
                  <p v-if="mode === 'ask'" class="cp-section-hint">
                    {{ commandSurface
                      ? `Suggestions lean toward what people usually need on ${commandSurface.label}.`
                      : 'These look up live schedules, presence, and team data — not just navigation.' }}
                  </p>
                  <div class="cp-chips">
                    <button
                      v-for="(s, i) in exampleItems"
                      :key="`ex-${i}`"
                      type="button"
                      class="cp-chip"
                      :class="`cp-chip--${mode}`"
                      @click="mode === 'nav' ? goNavExample(s) : submitAsk(s)"
                    >
                      {{ mode === 'nav' ? s.label : s }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="cp-footer">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> {{ mode === 'nav' ? 'go' : 'ask' }}</span>
              <span><kbd>Tab</kbd> switch mode</span>
              <span class="cp-footer-mode" :class="`cp-footer-mode--${mode}`">
                {{ mode === 'nav' ? 'Find a page or setting' : 'Searches schedules & team data' }}
              </span>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, isNavigationFailure, NavigationFailureType } from 'vue-router';
import { useCommandPalette } from '../composables/useCommandPalette';
import { useAskAssistant } from '../composables/useAskAssistant';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useBrandingStore } from '../store/branding';
import { useSchoolPortalQuickNavCache } from '../composables/useSchoolPortalQuickNavCache';
import { canUseSchoolPortalQuickNav, searchSchoolPortalQuickNav } from '../utils/schoolPortalQuickNav';
import {
  buildQuickNavContext,
  searchQuickNav
} from '../navigation/quickNavCatalog';
import { getRegisteredQuickNavEntries, resolveRegisteredQuickNav, canDiscoverQuickNavRoute } from '../navigation/quickNavRuntime';
import { isSupervisor } from '../utils/helpers';
import { resolveCommandSurface } from '../utils/resolveCommandSurface';
import {
  getAskHistory,
  getFrequentAsk,
  getFrequentNav,
  getNavHistory,
  recordAskPrompt,
  recordNavSelection
} from '../composables/commandPaletteHistory';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const { schoolsRef: schoolPortalSchoolsRef, ensureCache: ensureSchoolPortalQuickNavCache } =
  useSchoolPortalQuickNavCache();

const { open, mode, seedQuery, closePalette, openPalette, setMode } = useCommandPalette();
const { openAsk } = useAskAssistant();

const query = ref('');
const activeIndex = ref(0);
const pickerFocus = ref(0);
const inputRef = ref(null);
const navigationError = ref('');
const navigating = ref(false);

const orgSlug = computed(() =>
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug
    : route.query.scope === 'platform' ? null
    : agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || null
);

const commandSurface = computed(() =>
  resolveCommandSurface({ path: route.path, fullPath: route.fullPath, name: route.name })
);

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase().trim());
const isAdminLike = computed(() =>
  ['admin', 'support', 'staff', 'super_admin', 'superadmin'].includes(roleNorm.value)
);
const isProviderLike = computed(() =>
  ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant', 'supervisor'].includes(roleNorm.value)
);

const schoolPortalQuickNavEligible = computed(() => {
  const agency = agencyStore.currentAgency || {};
  const pb = brandingStore.platformBranding || {};
  return canUseSchoolPortalQuickNav({
    role: authStore.user?.role,
    agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
  });
});

const schoolPortalNavResults = computed(() => {
  if (!schoolPortalQuickNavEligible.value) return [];
  const q = String(query.value || '').trim();
  if (q.length < 2) return [];
  return searchSchoolPortalQuickNav(q, schoolPortalSchoolsRef.value, { limit: 6 });
});

const quickNavCtx = computed(() => {
  const u = authStore.user;
  const role = String(u?.role || '').toLowerCase();
  const caps = u?.capabilities || {};
  const isTrueAdmin = role === 'admin' || role === 'super_admin' || role === 'superadmin';
  const isProv = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(role);
  const isSup = isSupervisor(u);
  const isLimited =
    !isTrueAdmin && !isProv && (isSup || !!caps?.canManageHiring || !!caps?.canManagePayroll);
  const cur = agencyStore.currentAgency;
  const orgType = String(cur?.organization_type || cur?.organizationType || '').toLowerCase();
  const isClub = orgType === 'affiliation';
  const kudosEnabled = !!(cur?.kudos_enabled ?? cur?.kudosEnabled);
  return buildQuickNavContext({
    user: u,
    isClubContext: isClub,
    kudosEnabled,
    showSchedule: role !== 'school_staff' && !isClub,
    showPayroll: role !== 'school_staff' && !isClub && !isLimited,
    showClaims: role !== 'school_staff' && !isClub && !isLimited && (isProv || isTrueAdmin),
    showSupervision: !isClub && isSup,
    showMySupervision: !isClub && !isSup && !isLimited,
    showChats: !isLimited,
    isOnboardingComplete: true
  });
});

const navigationOptions = computed(() => ({
  currentPath: route.path,
  orgSlug: orgSlug.value,
  dashboardPath: `${orgSlug.value ? '/' + orgSlug.value : ''}/dashboard`,
  agency: agencyStore.currentAgency || {},
  platformBranding: brandingStore.platformBranding || {},
  user: authStore.user
}));
const registeredEntries = computed(() => getRegisteredQuickNavEntries(router, quickNavCtx.value, navigationOptions.value));
const navResults = computed(() => {
  const q = String(query.value || '').trim();
  if (!q) return [];
  const items = searchQuickNav(q, quickNavCtx.value, {
    limit: 20, surface: commandSurface.value, entries: registeredEntries.value
  }).flat;
  for (const entry of schoolPortalNavResults.value) {
    const resolved = resolveRegisteredQuickNav(entry, router, { ...navigationOptions.value, orgSlug: '' });
    if (resolved && canDiscoverQuickNavRoute(resolved, navigationOptions.value)) {
      items.push({ ...entry, scope: 'platform', destination: resolved.fullPath });
    }
  }
  const seen = new Set();
  return items.sort((a, b) => (b.score || 0) - (a.score || 0)).filter(item => {
    if (seen.has(item.destination)) return false;
    seen.add(item.destination);
    return true;
  }).slice(0, 14);
});
watch(navResults, () => { activeIndex.value = 0; });

function isAccessibleHistoryPath(path) {
  if (!path) return false;
  const resolved = resolveRegisteredQuickNav({ kind: 'path', path, scope: 'platform' }, router, navigationOptions.value);
  if (!resolved || !canDiscoverQuickNavRoute(resolved, navigationOptions.value)) return false;
  const destinationOrg = resolved.params.organizationSlug;
  if (destinationOrg && destinationOrg !== orgSlug.value) return false;
  // Account tab visibility and tenant feature choices also apply to saved history.
  return registeredEntries.value.some(entry => entry.destination === resolved.fullPath)
    || (schoolPortalQuickNavEligible.value && /\/school-portal\//.test(resolved.path));
}

const popularNavEntries = computed(() => {
  const groups = commandSurface.value?.quickNavGroups || ['schedule', 'account', 'workspace', 'clients'];
  return registeredEntries.value.filter(e => groups.includes(e.group)).slice(0, 10);
});

const askExamples = computed(() => {
  const surface = commandSurface.value;
  if (surface?.askExamples?.length) {
    return surface.askExamples.slice(0, 8);
  }
  const base = [
    'Who is free today?',
    "What is Hale's schedule today?",
    'Who is in right now?',
    'Who sees 10 year old kids?',
    'Who is available this afternoon?',
    'What should I prioritize today?'
  ];
  if (isAdminLike.value) {
    base.push('What activity happened in my agency this week?');
    base.push('Who has an intake opening today?');
  }
  if (isProviderLike.value) {
    base.push("What's on my agenda today?");
    base.push('When is my next meeting?');
  }
  return [...new Set(base)].slice(0, 8);
});

const exampleItems = computed(() =>
  mode.value === 'nav' ? popularNavEntries.value : askExamples.value
);

const recentItems = computed(() => {
  if (mode.value === 'nav') {
    return getNavHistory()
      .filter((item) => isAccessibleHistoryPath(item?.path))
      .slice(0, 6);
  }
  return getAskHistory().slice(0, 6);
});

const frequentItems = computed(() => {
  if (mode.value === 'nav') {
    return getFrequentNav(12)
      .filter((item) => isAccessibleHistoryPath(item?.path))
      .slice(0, 6);
  }
  return getFrequentAsk(6);
});

watch(open, async (isOpen) => {
  if (!isOpen) {
    query.value = '';
    pickerFocus.value = 0;
    return;
  }
  if (schoolPortalQuickNavEligible.value) {
    const agencyId = agencyStore.currentAgency?.id;
    if (agencyId) ensureSchoolPortalQuickNavCache(agencyId);
  }
  navigationError.value = '';
  if (seedQuery.value) query.value = seedQuery.value;
  await nextTick();
  inputRef.value?.focus();
});

watch(mode, async () => {
  activeIndex.value = 0;
  if (open.value && mode.value) {
    await nextTick();
    inputRef.value?.focus();
  }
});

function selectMode(nextMode) {
  setMode(nextMode);
  nextTick(() => inputRef.value?.focus());
}

function backToPicker() {
  setMode(null);
  query.value = '';
}

async function goNav(item) {
  if (!item || navigating.value) return;
  navigationError.value = '';
  const target = item.destination
    ? resolveRegisteredQuickNav({ kind: 'path', path: item.destination, scope: 'platform' }, router, navigationOptions.value)
    : resolveRegisteredQuickNav(item, router, navigationOptions.value);
  if (!target || !canDiscoverQuickNavRoute(target, navigationOptions.value)) {
    navigationError.value = 'This page is unavailable in your current workspace. Search again or switch organizations.';
    return;
  }
  navigating.value = true;
  try {
    const failure = await router.push(target.fullPath);
    if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
      navigationError.value = 'Navigation was interrupted. Select the page again to retry.';
      return;
    }
    // Guards can redirect without throwing. Do not record a shortcut as successful in that case.
    if (router.currentRoute.value.fullPath !== target.fullPath) {
      navigationError.value = 'This page could not open in your current workspace. Check your access or organization.';
      return;
    }
    recordNavSelection({ path: target.fullPath, title: item.label || item.title, section: item.description || item.groupLabel });
    closePalette();
  } catch {
    navigationError.value = 'The page could not load. Check your connection and select it again to retry.';
  } finally {
    navigating.value = false;
  }
}

function goNavRecent(item) {
  if (isAccessibleHistoryPath(item?.path)) void goNav({ ...item, kind: 'path', scope: 'platform', label: item.title });
}

function goNavExample(entry) { void goNav(entry); }

function submitAsk(text) {
  const prompt = String(text || query.value || '').trim();
  if (!prompt) return;
  recordAskPrompt(prompt);
  closePalette();
  openAsk(prompt, 'ask');
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (mode.value) backToPicker();
    else closePalette();
    return;
  }
  if (e.key === 'Tab' && mode.value) {
    e.preventDefault();
    selectMode(mode.value === 'nav' ? 'ask' : 'nav');
    return;
  }
  if (!mode.value) {
    if (e.key === '1' || (e.key === 'ArrowLeft' && pickerFocus.value === 0)) {
      e.preventDefault();
      selectMode('nav');
    } else if (e.key === '2' || e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      selectMode(pickerFocus.value === 0 ? 'nav' : 'ask');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      pickerFocus.value = 0;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      pickerFocus.value = 1;
    }
    return;
  }
  if (mode.value === 'nav') {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex.value = Math.min(activeIndex.value + 1, Math.max(navResults.value.length - 1, 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex.value = Math.max(activeIndex.value - 1, 0);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (navResults.value[activeIndex.value]) goNav(navResults.value[activeIndex.value]);
      return;
    }
  }
  if (mode.value === 'ask' && e.key === 'Enter') {
    e.preventDefault();
    submitAsk();
  }
}

function handleGlobalKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    if (open.value) closePalette();
    else openPalette(null);
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});

defineExpose({ openPalette });
</script>

<style scoped>
.cp-navigation-error { padding: 12px 20px; color: var(--danger, #b91c1c); background: var(--bg-card); }
.cp-navigation-status { padding: 8px 20px; color: var(--text-secondary); }
.cp-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 24px;
}
.cp-panel {
  width: min(560px, 100%);
  background: var(--bg-card);
  border-radius: 20px;
  border: 1px solid var(--border);
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}
.cp-fade-enter-active,
.cp-fade-leave-active { transition: opacity 0.15s ease; }
.cp-fade-enter-from,
.cp-fade-leave-to { opacity: 0; }

/* Picker */
.cp-picker { padding: 24px 22px 20px; }
.cp-picker-head { text-align: center; margin-bottom: 20px; }
.cp-kbd-hint { display: inline-flex; gap: 4px; margin-bottom: 10px; }
.cp-kbd-hint kbd {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-secondary);
}
.cp-picker-title { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: var(--text-primary); }
.cp-picker-sub { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.45; }
.cp-surface-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--link-color);
  font-weight: 600;
}
.cp-mode-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 520px) { .cp-mode-cards { grid-template-columns: 1fr; } }
.cp-mode-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 18px 16px;
  border-radius: 16px;
  border: 2px solid transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.cp-mode-card:hover,
.cp-mode-card.is-focused {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
}
.cp-mode-card--nav {
  background: linear-gradient(145deg, var(--brand-tint) 0%, var(--bg-card) 100%);
  border-color: var(--border);
}
.cp-mode-card--nav:hover,
.cp-mode-card--nav.is-focused { border-color: var(--link-color); }
.cp-mode-card--ask {
  background: linear-gradient(145deg, var(--brand-tint) 0%, var(--brand-tint) 100%);
  border-color: var(--border);
}
.cp-mode-card--ask:hover,
.cp-mode-card--ask.is-focused { border-color: var(--link-color); }
.cp-mode-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}
.cp-mode-icon svg { width: 20px; height: 20px; }
.cp-mode-icon--nav { background: var(--brand-tint); color: var(--link-color); }
.cp-mode-icon--ask { background: var(--brand-tint); color: var(--link-color); }
.cp-mode-label { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.cp-mode-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.4; }
.cp-mode-shortcut {
  position: absolute;
  top: 12px;
  right: 12px;
}
.cp-mode-shortcut kbd {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.08);
  background: var(--bg-card);
  color: var(--text-secondary);
}

/* Toolbar */
.cp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--bg-muted);
}
.cp-back {
  border: 0;
  background: var(--bg-alt);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--text-secondary);
}
.cp-mode-pill {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: 999px;
}
.cp-mode-pill--nav { background: var(--brand-tint); color: var(--link-color); }
.cp-mode-pill--ask { background: var(--brand-tint); color: var(--link-color); }
.cp-mode-tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
  background: var(--bg-muted);
  border-radius: 8px;
  padding: 2px;
}
.cp-mode-tab {
  border: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
}
.cp-mode-tab.is-active { background: var(--bg-card); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.cp-close {
  border: 0;
  background: none;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 6px;
}

/* Input */
.cp-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--bg-muted);
}
.cp-input-wrap--nav { background: linear-gradient(180deg, var(--brand-tint) 0%, var(--bg-card) 100%); }
.cp-input-wrap--ask { background: linear-gradient(180deg, var(--brand-tint) 0%, var(--bg-card) 100%); }
.cp-input-icon { width: 18px; height: 18px; color: var(--text-secondary); flex-shrink: 0; }
.cp-input-wrap--nav .cp-input-icon { color: var(--link-color); }
.cp-input-wrap--ask .cp-input-icon { color: var(--link-color); }
.cp-input {
  flex: 1;
  border: 0;
  outline: none;
  font-size: 15px;
  font-family: inherit;
  background: transparent;
  color: var(--text-primary);
  min-width: 0;
}
.cp-input::placeholder { color: var(--text-secondary); }

.cp-body { max-height: 360px; overflow-y: auto; }
.cp-results { list-style: none; margin: 0; padding: 6px 0; }
.cp-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
}
.cp-result:hover,
.cp-result.active { background: var(--brand-tint); }
.cp-result-body { flex: 1; min-width: 0; }
.cp-result-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cp-result-meta { font-size: 11px; color: var(--text-secondary); margin-top: 1px; }
.cp-result-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--text-secondary);
  flex-shrink: 0;
}
.cp-empty { padding: 20px 16px; text-align: center; font-size: 13px; color: var(--text-secondary); }

.cp-suggestions { padding: 12px 16px 16px; }
.cp-section { margin-bottom: 14px; }
.cp-section-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.cp-section-hint { font-size: 12px; color: var(--text-secondary); margin: -4px 0 8px; line-height: 1.4; }
.cp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.12s ease;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cp-chip--nav:hover { border-color: var(--link-color); background: var(--brand-tint); color: var(--link-color); }
.cp-chip--ask:hover { border-color: var(--link-color); background: var(--brand-tint); color: var(--link-color); }

.cp-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 16px;
  border-top: 1px solid var(--bg-muted);
  font-size: 11px;
  color: var(--text-secondary);
}
.cp-footer kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  font-size: 10px;
  margin-right: 2px;
}
.cp-footer-mode {
  margin-left: auto;
  font-weight: 700;
  font-size: 11px;
}
.cp-footer-mode--nav { color: var(--link-color); }
.cp-footer-mode--ask { color: var(--link-color); }
</style>
