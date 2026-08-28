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
                <span class="cp-mode-desc">Open pages and tools — no database lookup. Payroll, schedule, credentials, and more.</span>
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
              <ul v-if="mode === 'nav' && navResults.length" class="cp-results" role="listbox">
                <li
                  v-for="(item, idx) in navResults"
                  :key="item.id"
                  class="cp-result"
                  :class="{ active: activeIndex === idx }"
                  role="option"
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
                {{ mode === 'nav' ? 'Instant page jump — no DB query' : 'Searches schedules & team data' }}
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
import { useRoute, useRouter } from 'vue-router';
import { useCommandPalette } from '../composables/useCommandPalette';
import { useAskAssistant } from '../composables/useAskAssistant';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useBrandingStore } from '../store/branding';
import { useSchoolPortalQuickNavCache } from '../composables/useSchoolPortalQuickNavCache';
import { listNavForSurface, searchNav } from '../utils/navSearchIndex';
import { canUseSchoolPortalQuickNav, searchSchoolPortalQuickNav } from '../utils/schoolPortalQuickNav';
import {
  buildQuickNavContext,
  getAccessibleQuickNavEntries,
  resolveQuickNavRoute,
  searchQuickNav
} from '../navigation/quickNavCatalog';
import { getMyDashboardPath, resolveAssistantNavigationPath } from '../utils/router';
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

const orgSlug = computed(() =>
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null
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

const navResults = computed(() => {
  const q = String(query.value || '').trim();
  if (!q) return [];
  const surface = commandSurface.value;
  const items = [];
  // Unscoped hub/searchNav ignores roles — only admins may use it.
  // Providers and other roles rely on role-aware searchQuickNav / school portal search.
  if (isAdminLike.value) {
    const hub = searchNav(q, { orgSlug: orgSlug.value, surface, limit: 8 }).map((item) => ({
      id: `hub-${item.fullPath}`,
      label: item.title,
      description: item.section,
      groupLabel: surface && item.score >= 80 ? `On ${surface.label}` : 'Page',
      kind: 'path',
      path: item.fullPath,
      score: item.score
    }));
    items.push(...hub);
  }
  const qn = searchQuickNav(q, quickNavCtx.value, { limit: 10, surface }).flat.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    groupLabel: item.groupLabel,
    kind: item.kind,
    routeName: item.routeName,
    path: item.path,
    query: item.query,
    hash: item.hash,
    score: item.score
  }));
  for (const item of qn) {
    if (!items.some((x) => x.id === item.id)) items.push(item);
  }
  for (const item of schoolPortalNavResults.value) {
    if (!items.some((x) => x.id === item.id)) items.push(item);
  }
  return items.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 14);
});

watch(navResults, () => { activeIndex.value = 0; });

const accessibleNavPathSet = computed(() => {
  const paths = new Set();
  const opts = {
    currentPath: route.path,
    orgSlug: orgSlug.value,
    currentQuery: route.query,
    dashboardPath: getMyDashboardPath({ preferNonDemo: true })
  };
  for (const entry of getAccessibleQuickNavEntries(quickNavCtx.value)) {
    if (entry.path) {
      const base = String(entry.path).split('?')[0];
      if (base) paths.add(base);
      paths.add(String(entry.path));
    }
    const loc = resolveQuickNavRoute(entry, opts);
    if (!loc) continue;
    if (typeof loc === 'string') {
      paths.add(loc.split('?')[0]);
      paths.add(loc);
    } else if (loc.path) {
      paths.add(String(loc.path).split('?')[0]);
      paths.add(String(loc.path));
    }
  }
  return paths;
});

function isAccessibleHistoryPath(path) {
  if (!path) return false;
  if (isAdminLike.value) return true;
  const raw = String(path);
  const base = raw.split('?')[0];
  if (accessibleNavPathSet.value.has(raw) || accessibleNavPathSet.value.has(base)) return true;
  // Allow school-portal destinations for eligible users
  if (schoolPortalQuickNavEligible.value && /\/school-portal\//.test(base)) return true;
  // Match accessible entries whose path is a prefix (e.g. dashboard tabs)
  for (const allowed of accessibleNavPathSet.value) {
    if (!allowed) continue;
    if (raw === allowed || base === allowed) return true;
    if (raw.startsWith(allowed) || allowed.startsWith(base)) return true;
  }
  return false;
}

const popularNavEntries = computed(() => {
  const surface = commandSurface.value;
  if (surface) {
    if (isAdminLike.value) {
      const fromIndex = listNavForSurface(surface, { orgSlug: orgSlug.value, limit: 8 }).map((item) => ({
        id: `surf-${item.path}`,
        label: item.title,
        description: item.section,
        group: 'surface',
        kind: 'path',
        path: item.fullPath
      }));
      if (fromIndex.length) return fromIndex;
    }
    const groups = surface.quickNavGroups || [];
    return getAccessibleQuickNavEntries(quickNavCtx.value)
      .filter((e) => groups.includes(e.group))
      .slice(0, 10);
  }
  return getAccessibleQuickNavEntries(quickNavCtx.value)
    .filter((e) => ['schedule', 'account', 'workspace', 'clients'].includes(e.group))
    .slice(0, 10);
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

function dashboardPath() {
  return getMyDashboardPath({ preferNonDemo: true });
}

async function goNav(item) {
  if (!item) return;
  let path = item.path;
  if (!path && item.kind !== 'path') {
    const loc = resolveQuickNavRoute(item, {
      currentPath: route.path,
      orgSlug: orgSlug.value,
      currentQuery: route.query,
      dashboardPath: dashboardPath()
    });
    if (!loc) return;
    path = typeof loc === 'string' ? loc : loc.path;
    if (typeof loc === 'object' && loc.path) {
      closePalette();
      const target = {
        ...loc,
        path: resolveAssistantNavigationPath(loc.path, { orgSlug: orgSlug.value || undefined })
      };
      await router.push(target);
      recordNavSelection({ path: target.path, title: item.label, section: item.description });
      return;
    }
  }
  if (!path) return;
  closePalette();
  const resolvedPath = resolveAssistantNavigationPath(path, { orgSlug: orgSlug.value || undefined });
  await router.push(resolvedPath);
  recordNavSelection({ path: resolvedPath, title: item.label, section: item.description || item.groupLabel });
}

function goNavRecent(item) {
  if (!item?.path) return;
  closePalette();
  router.push(item.path);
  recordNavSelection(item);
}

function goNavExample(entry) {
  void goNav({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    groupLabel: entry.group,
    kind: entry.kind,
    routeName: entry.routeName,
    path: entry.path,
    query: entry.query,
    hash: entry.hash
  });
}

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
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
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
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
}
.cp-picker-title { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #0f172a; }
.cp-picker-sub { margin: 0; font-size: 13px; color: #64748b; line-height: 1.45; }
.cp-surface-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #0f766e;
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
  background: linear-gradient(145deg, #f0fdfa 0%, #ecfeff 100%);
  border-color: #99f6e4;
}
.cp-mode-card--nav:hover,
.cp-mode-card--nav.is-focused { border-color: #0d9488; }
.cp-mode-card--ask {
  background: linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%);
  border-color: #c4b5fd;
}
.cp-mode-card--ask:hover,
.cp-mode-card--ask.is-focused { border-color: #7c3aed; }
.cp-mode-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}
.cp-mode-icon svg { width: 20px; height: 20px; }
.cp-mode-icon--nav { background: #ccfbf1; color: #0f766e; }
.cp-mode-icon--ask { background: #ddd6fe; color: #6d28d9; }
.cp-mode-label { font-size: 16px; font-weight: 800; color: #0f172a; }
.cp-mode-desc { font-size: 12px; color: #475569; line-height: 1.4; }
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
  background: rgba(255,255,255,0.7);
  color: #64748b;
}

/* Toolbar */
.cp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.cp-back {
  border: 0;
  background: #f8fafc;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: #64748b;
}
.cp-mode-pill {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: 999px;
}
.cp-mode-pill--nav { background: #ccfbf1; color: #0f766e; }
.cp-mode-pill--ask { background: #ede9fe; color: #6d28d9; }
.cp-mode-tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
  background: #f1f5f9;
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
  color: #64748b;
}
.cp-mode-tab.is-active { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.cp-close {
  border: 0;
  background: none;
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px 6px;
}

/* Input */
.cp-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
}
.cp-input-wrap--nav { background: linear-gradient(180deg, #f0fdfa 0%, #fff 100%); }
.cp-input-wrap--ask { background: linear-gradient(180deg, #f5f3ff 0%, #fff 100%); }
.cp-input-icon { width: 18px; height: 18px; color: #94a3b8; flex-shrink: 0; }
.cp-input-wrap--nav .cp-input-icon { color: #0d9488; }
.cp-input-wrap--ask .cp-input-icon { color: #7c3aed; }
.cp-input {
  flex: 1;
  border: 0;
  outline: none;
  font-size: 15px;
  font-family: inherit;
  background: transparent;
  color: #0f172a;
  min-width: 0;
}
.cp-input::placeholder { color: #94a3b8; }

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
.cp-result.active { background: #f0fdfa; }
.cp-result-body { flex: 1; min-width: 0; }
.cp-result-title { font-size: 13px; font-weight: 700; color: #0f172a; }
.cp-result-meta { font-size: 11px; color: #94a3b8; margin-top: 1px; }
.cp-result-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  flex-shrink: 0;
}
.cp-empty { padding: 20px 16px; text-align: center; font-size: 13px; color: #64748b; }

.cp-suggestions { padding: 12px 16px 16px; }
.cp-section { margin-bottom: 14px; }
.cp-section-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  margin-bottom: 8px;
}
.cp-section-hint { font-size: 12px; color: #64748b; margin: -4px 0 8px; line-height: 1.4; }
.cp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  color: #475569;
  transition: all 0.12s ease;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cp-chip--nav:hover { border-color: #0d9488; background: #f0fdfa; color: #0f766e; }
.cp-chip--ask:hover { border-color: #7c3aed; background: #f5f3ff; color: #5b21b6; }

.cp-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 16px;
  border-top: 1px solid #f1f5f9;
  font-size: 11px;
  color: #94a3b8;
}
.cp-footer kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 10px;
  margin-right: 2px;
}
.cp-footer-mode {
  margin-left: auto;
  font-weight: 700;
  font-size: 11px;
}
.cp-footer-mode--nav { color: #0f766e; }
.cp-footer-mode--ask { color: #6d28d9; }
</style>
