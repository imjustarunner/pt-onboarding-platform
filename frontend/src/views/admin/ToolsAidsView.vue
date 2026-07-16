<template>
  <div class="tools-aids">
    <div class="tools-aids__header">
      <router-link v-if="isStandaloneHub" :to="orgTo('/dashboard')" class="back-link">← Back to Dashboard</router-link>
      <h1>Tools &amp; Aids</h1>
      <p class="subtitle">Assessments, games and activities, and AI aids for sessions and client care.</p>
    </div>

    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        class="search-input"
        placeholder="Search tools…"
        aria-label="Search tools"
      />
      <template v-if="activeTab === 'assessments'">
        <select v-model="filterCategory" class="select" aria-label="Filter by category">
          <option value="all">All categories</option>
          <option value="clinical">Clinical</option>
          <option value="non_clinical">Non-Clinical</option>
        </select>
        <select v-model="filterPopulation" class="select" aria-label="Filter by population">
          <option value="all">All populations</option>
          <option v-for="p in populations" :key="p" :value="p">{{ p }}</option>
        </select>
      </template>
      <select v-model="sortBy" class="select" aria-label="Sort">
        <option value="az">A–Z</option>
        <option value="favorites">Favorites first</option>
      </select>
    </div>

    <div class="tabs" role="tablist">
      <button
        v-for="tab in TOOLS_TABS"
        :key="tab.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab--active': activeTab === tab.id }"
        :aria-selected="activeTab === tab.id ? 'true' : 'false'"
        @click.prevent="setTab(tab.id)"
      >{{ tab.label }}</button>
    </div>

    <div class="stats">
      <div v-for="stat in summaryStats" :key="stat.label" class="stat-card">
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-label">{{ stat.label }}</div>
      </div>
    </div>

    <!-- Assessments -->
    <div v-show="activeTab === 'assessments'" class="grid" role="tabpanel">
      <ToolCard
        v-for="tool in filteredAssessments"
        :key="tool.id"
        :title="tool.title"
        :little-name="tool.littleName || ''"
        :description="tool.description"
        :tags="assessmentTags(tool)"
        :meta="assessmentMeta(tool)"
        :image-url="tool.imageUrl || ''"
        icon="◎"
        :favorited="isFavorite(`assessment:${tool.id}`)"
        :show-edit="true"
        :show-duplicate="true"
        @open="openAssessment(tool)"
        @copy-link="copyAssessmentLink(tool)"
        @assign="openAssign('assessment', tool)"
        @toggle-favorite="toggleFavorite(`assessment:${tool.id}`)"
        @edit="openEdit('assessment', tool)"
        @duplicate="duplicateAssessment(tool)"
      />
      <p v-if="!filteredAssessments.length" class="empty">No assessments match your filters.</p>
    </div>

    <!-- Games -->
    <div v-show="activeTab === 'games'" class="grid" role="tabpanel">
      <template v-if="!canSeeGames">
        <p class="empty empty--wide">Games are not enabled for your account. Contact an admin if you need access.</p>
      </template>
      <template v-else>
        <ToolCard
          v-for="game in filteredGames"
          :key="game.id"
          :title="game.displayName || game.title || game.id"
          :little-name="game.littleName || ''"
          :description="gameDescription(game)"
          :tags="gameTags(game)"
          :meta="gameMeta(game)"
          :image-url="game.imageUrl || game.thumbnailUrl || ''"
          icon="▶"
          :favorited="isFavorite(`game:${game.id}`)"
          :show-assign="true"
          :show-copy="true"
          :show-edit="true"
          :show-duplicate="false"
          @open="openGame(game)"
          @copy-link="copyGameLink(game)"
          @assign="openAssign('game', gameAsAssignTool(game))"
          @toggle-favorite="toggleFavorite(`game:${game.id}`)"
          @edit="openEdit('game', gameAsEditable(game))"
        />
        <p v-if="!filteredGames.length" class="empty">No games available yet.</p>
      </template>
    </div>

    <!-- AI Tools -->
    <div v-show="activeTab === 'ai'" class="ai-section" role="tabpanel">
      <div class="grid">
        <ToolCard
          v-for="tool in filteredAiTools"
          :key="tool.id"
          :title="tool.title"
          :little-name="tool.littleName || ''"
          :description="tool.description"
          :tags="aiTags(tool)"
          :meta="[]"
          :image-url="tool.imageUrl || ''"
          :icon="tool.status === 'live' ? '✦' : '◌'"
          :muted="tool.status === 'coming_soon'"
          :favorited="isFavorite(`ai:${tool.id}`)"
          :show-open="tool.status === 'live' || tool.status === 'workspace'"
          :show-copy="tool.status === 'live' && !!tool.routePath"
          :show-assign="false"
          :show-edit="true"
          :show-duplicate="false"
          :open-label="tool.status === 'coming_soon' ? 'Coming soon' : 'Open'"
          :open-disabled="tool.status === 'coming_soon'"
          @open="openAiTool(tool)"
          @copy-link="copyAiLink(tool)"
          @toggle-favorite="toggleFavorite(`ai:${tool.id}`)"
          @edit="openEdit('ai', tool)"
        />
      </div>
      <footer class="trust-footer">
        <span>Privacy-minded</span>
        <span>·</span>
        <span>Evidence-informed workflows</span>
        <span>·</span>
        <span>Updated regularly</span>
      </footer>
    </div>

    <div class="cta-banner">
      <div>
        <strong>Need a recommendation?</strong>
        <p>Browse assessments by population, try a session game, or open Note Aid for documentation.</p>
      </div>
      <button type="button" class="btn-cta" @click="setTab(activeTab === 'assessments' ? 'ai' : 'assessments')">
        Explore {{ activeTab === 'assessments' ? 'AI Tools' : 'Assessments & Evaluations' }}
      </button>
    </div>

    <p v-if="toast" class="toast" role="status">{{ toast }}</p>

    <ToolsAssignModal
      v-if="assignState"
      :kind="assignState.kind"
      :tool="assignState.tool"
      :agency-id="agencyId"
      :organization-slug="organizationSlug"
      :org-to="orgTo"
      @close="assignState = null"
    />

    <ToolsEditModal
      v-if="editState"
      :tool="editState.tool"
      @close="editState = null"
      @save="saveEdit"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { listActivities } from '../../services/counselingApi.js';
import { launchActivity, isStandaloneLaunchable, resolveStandaloneUrl } from '../../services/launchActivity.js';
import {
  TOOLS_TABS,
  ASSESSMENT_TOOLS,
  AI_TOOLS,
  clinicalKindLabel,
  getAssessmentPublicUrl,
  parseToolsTab,
  loadFavoriteIds,
  saveFavoriteIds
} from '../../navigation/toolsCatalog.js';
import {
  getToolOverrides,
  saveToolOverride,
  applyToolOverride,
  listCustomTools,
  duplicateTool,
  updateCustomTool
} from '../../navigation/toolsCatalogOverrides.js';
import ToolCard from '../../components/tools/ToolCard.vue';
import ToolsAssignModal from '../../components/tools/ToolsAssignModal.vue';
import ToolsEditModal from '../../components/tools/ToolsEditModal.vue';

const props = defineProps({
  /** When embedded in My Dashboard, parent sets the hub tab (assessments | games | ai). */
  initialTab: {
    type: String,
    default: ''
  }
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const search = ref('');
const filterCategory = ref('all');
const filterPopulation = ref('all');
const sortBy = ref('az');
const registryGames = ref([]);
const favorites = ref(new Set());
const overrides = ref({});
const customTools = ref([]);
const toast = ref('');
const assignState = ref(null);
const editState = ref(null);
/** Local hub tab — always drives the UI; route query synced only on standalone hub. */
const hubTab = ref(parseToolsTab(props.initialTab) || 'assessments');
let toastTimer = null;

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const organizationSlug = computed(() =>
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
);
const agencyId = computed(
  () => agencyStore.currentAgency?.id || agencyStore.currentAgency?.value?.id || authStore.user?.agencyId
);
const userId = computed(() => authStore.user?.id || authStore.user?.userId || 'anon');

const isStandaloneHub = computed(() => {
  const name = String(route.name || '');
  if (name === 'ToolsAids' || name === 'OrganizationToolsAids') return true;
  return String(route.path || '').includes('/admin/tools-aids');
});

const activeTab = computed(() => hubTab.value);

const canSeeGames = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  return Boolean(authStore.user?.has_games_access || authStore.user?.hasGamesAccess);
});

function reloadUserToolData() {
  overrides.value = getToolOverrides(userId.value);
  customTools.value = listCustomTools(userId.value).filter(
    (t) => !t.kind || t.kind === 'assessment'
  );
  favorites.value = loadFavoriteIds(userId.value);
}

const assessmentCatalog = computed(() => {
  const catalog = ASSESSMENT_TOOLS.map((t) => applyToolOverride(t, overrides.value[t.id]));
  const customs = (customTools.value || []).map((t) => ({ ...t, isCustom: true }));
  return [...customs, ...catalog];
});

const populations = computed(() => {
  const set = new Set(assessmentCatalog.value.map((a) => a.population).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

const aiCatalog = computed(() =>
  AI_TOOLS.map((t) => applyToolOverride(t, overrides.value[t.id]))
);

function syncHubTabFromRoute() {
  if (!isStandaloneHub.value) return;
  hubTab.value = parseToolsTab(route.query.tab);
}

function setTab(tabId) {
  const tab = parseToolsTab(tabId);
  hubTab.value = tab;

  // Never write hub sub-tabs into the dashboard rail query (?tab=tools_aids).
  if (!isStandaloneHub.value) return;

  const nextQuery = { ...route.query };
  if (tab === 'assessments') delete nextQuery.tab;
  else nextQuery.tab = tab;

  const cur = parseToolsTab(route.query.tab);
  if (cur === tab) return;

  router.replace({ query: nextQuery }).catch(() => {});
}

function showToast(msg) {
  toast.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2200);
}

function isFavorite(key) {
  return favorites.value.has(key);
}

function toggleFavorite(key) {
  const next = new Set(favorites.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  favorites.value = next;
  saveFavoriteIds(userId.value, next);
}

function matchesSearch(text) {
  const q = search.value.trim().toLowerCase();
  if (!q) return true;
  return String(text || '').toLowerCase().includes(q);
}

function sortItems(items, keyFn, favKeyFn) {
  const list = [...items];
  list.sort((a, b) => {
    if (sortBy.value === 'favorites') {
      const af = isFavorite(favKeyFn(a)) ? 0 : 1;
      const bf = isFavorite(favKeyFn(b)) ? 0 : 1;
      if (af !== bf) return af - bf;
    }
    return String(keyFn(a) || '').localeCompare(String(keyFn(b) || ''));
  });
  return list;
}

const filteredAssessments = computed(() => {
  let list = assessmentCatalog.value.filter((t) => {
    if (filterCategory.value !== 'all' && t.clinicalKind !== filterCategory.value) return false;
    if (filterPopulation.value !== 'all' && t.population !== filterPopulation.value) return false;
    return (
      matchesSearch(t.title) ||
      matchesSearch(t.littleName) ||
      matchesSearch(t.description) ||
      matchesSearch((t.tags || []).join(' '))
    );
  });
  return sortItems(list, (t) => t.title, (t) => `assessment:${t.id}`);
});

const gamesWithOverrides = computed(() =>
  (registryGames.value || [])
    .filter((a) => isStandaloneLaunchable(a))
    .map((g) => {
      const o = overrides.value[g.id];
      if (!o) return g;
      return {
        ...g,
        displayName: o.title || g.displayName,
        title: o.title || g.displayName || g.title,
        littleName: o.littleName != null ? o.littleName : g.littleName,
        description: o.description || g.description,
        population: o.population || g.population,
        imageUrl: o.imageUrl || g.imageUrl || g.thumbnailUrl
      };
    })
);

const filteredGames = computed(() => {
  let list = gamesWithOverrides.value.filter((g) => {
    return (
      matchesSearch(g.displayName) ||
      matchesSearch(g.title) ||
      matchesSearch(g.id) ||
      matchesSearch(g.littleName) ||
      matchesSearch(g.description) ||
      matchesSearch(g.activityType || g.type)
    );
  });
  return sortItems(list, (g) => g.displayName || g.title || g.id, (g) => `game:${g.id}`);
});

const filteredAiTools = computed(() => {
  let list = aiCatalog.value.filter((t) => {
    return (
      matchesSearch(t.title) ||
      matchesSearch(t.littleName) ||
      matchesSearch(t.description) ||
      matchesSearch((t.tags || []).join(' '))
    );
  });
  return sortItems(list, (t) => t.title, (t) => `ai:${t.id}`);
});

const summaryStats = computed(() => {
  if (activeTab.value === 'assessments') {
    const all = assessmentCatalog.value;
    const clinical = all.filter((t) => t.clinicalKind === 'clinical').length;
    const fav = all.filter((t) => isFavorite(`assessment:${t.id}`)).length;
    return [
      { label: 'Total', value: all.length },
      { label: 'Clinical', value: clinical },
      { label: 'Non-Clinical', value: all.length - clinical },
      { label: 'Favorites', value: fav }
    ];
  }
  if (activeTab.value === 'games') {
    const all = gamesWithOverrides.value;
    const fav = all.filter((g) => isFavorite(`game:${g.id}`)).length;
    return [
      { label: 'Available', value: canSeeGames.value ? all.length : 0 },
      { label: 'Favorites', value: fav },
      { label: 'Access', value: canSeeGames.value ? 'On' : 'Off' }
    ];
  }
  const live = aiCatalog.value.filter((t) => t.status === 'live').length;
  const soon = aiCatalog.value.filter((t) => t.status === 'coming_soon').length;
  const fav = aiCatalog.value.filter((t) => isFavorite(`ai:${t.id}`)).length;
  return [
    { label: 'Live', value: live },
    { label: 'Coming soon', value: soon },
    { label: 'Workspace aids', value: aiCatalog.value.filter((t) => t.status === 'workspace').length },
    { label: 'Favorites', value: fav }
  ];
});

function assessmentTags(tool) {
  const tags = [clinicalKindLabel(tool.clinicalKind), ...(tool.tags || []).slice(0, 2)];
  if (tool.isCustom) tags.unshift('Custom');
  return tags.filter(Boolean).slice(0, 4);
}

function assessmentMeta(tool) {
  return [tool.durationEstimate, tool.population].filter(Boolean);
}

function aiTags(tool) {
  const tags = [clinicalKindLabel(tool.clinicalKind)];
  if (tool.status === 'coming_soon') tags.push('Coming soon');
  if (tool.status === 'workspace') tags.push('Workspace');
  if (tool.status === 'live') tags.push('Live');
  return tags;
}

function gameDescription(game) {
  return game.description || game.summary || 'Interactive activity from your games library.';
}

function gameTags(game) {
  const tags = [];
  if (game.activityType || game.type) tags.push(game.activityType || game.type);
  if (game.ageBand || game.ageRange) tags.push(game.ageBand || game.ageRange);
  tags.push('Game');
  return tags.slice(0, 3);
}

function gameMeta(game) {
  const meta = [];
  if (game.population) meta.push(game.population);
  if (game.status) meta.push(String(game.status).replace(/_/g, ' '));
  return meta;
}

function openAssessment(tool) {
  if (!tool.path) {
    showToast('This custom copy has no open link — edit the original or set a path later');
    return;
  }
  const url = getAssessmentPublicUrl(window.location.origin, tool.path, organizationSlug.value);
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyAssessmentLink(tool) {
  if (!tool.path) {
    showToast('No link available for this item');
    return;
  }
  const url = getAssessmentPublicUrl(window.location.origin, tool.path, organizationSlug.value);
  try {
    await navigator.clipboard?.writeText(url);
    showToast('Link copied');
  } catch {
    showToast('Could not copy link');
  }
}

function openGame(game) {
  launchActivity(game, { mode: 'standalone' });
}

async function copyGameLink(game) {
  const url = resolveStandaloneUrl(game);
  if (!url) {
    showToast('No open link for this game');
    return;
  }
  try {
    await navigator.clipboard?.writeText(url);
    showToast('Link copied');
  } catch {
    showToast('Could not copy link');
  }
}

function gameAsAssignTool(game) {
  return {
    id: game.id,
    title: game.displayName || game.title || game.id,
    openUrl: resolveStandaloneUrl(game) || ''
  };
}

function gameAsEditable(game) {
  return {
    id: game.id,
    title: game.displayName || game.title || game.id,
    littleName: game.littleName || '',
    population: game.population || '',
    description: gameDescription(game),
    imageUrl: game.imageUrl || game.thumbnailUrl || ''
  };
}

function openAiTool(tool) {
  if (tool.status === 'coming_soon') return;
  if (tool.routePath) {
    router.push(orgTo(tool.routePath));
    return;
  }
  if (tool.id === 'ask-assistant') {
    showToast('Use Ask Assistant from the top-right of the portal');
    return;
  }
  if (tool.id === 'momentum') {
    showToast('Use Momentum stickies from the workspace overlay');
  }
}

async function copyAiLink(tool) {
  if (!tool.routePath) return;
  const path = orgTo(tool.routePath);
  const url = `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    await navigator.clipboard?.writeText(url);
    showToast('Link copied');
  } catch {
    showToast('Could not copy link');
  }
}

function openAssign(kind, tool) {
  assignState.value = { kind, tool };
}

function openEdit(kind, tool) {
  editState.value = { kind, tool: { ...tool } };
}

function saveEdit(fields) {
  const state = editState.value;
  if (!state?.tool?.id) return;
  const id = state.tool.id;
  if (state.tool.isCustom) {
    updateCustomTool(userId.value, id, fields);
    customTools.value = listCustomTools(userId.value).filter(
      (t) => !t.kind || t.kind === 'assessment'
    );
  } else {
    overrides.value = saveToolOverride(userId.value, id, fields);
  }
  editState.value = null;
  showToast('Saved');
}

function duplicateAssessment(tool) {
  const copy = duplicateTool(userId.value, tool, 'assessment');
  if (!copy) {
    showToast('Could not duplicate');
    return;
  }
  customTools.value = listCustomTools(userId.value).filter(
    (t) => !t.kind || t.kind === 'assessment'
  );
  showToast('Duplicated — edit your copy anytime');
  openEdit('assessment', copy);
}

async function loadGames() {
  if (!canSeeGames.value || !authStore.isAuthenticated) {
    registryGames.value = [];
    return;
  }
  try {
    const role = String(authStore.user?.role || '').toLowerCase();
    registryGames.value = await listActivities({
      agencyId: agencyId.value,
      launchMode: 'standalone',
      includeDisabled: role === 'super_admin' ? 'true' : undefined
    });
  } catch (err) {
    console.warn('[tools-aids] failed to load games', err);
    registryGames.value = [
      {
        id: 'thought-explorer',
        displayName: 'Thought Explorer',
        status: 'live_current',
        launchMode: 'standalone',
        entryUrl: '/games-content/thought-explorer-main/dist/index.html'
      }
    ];
  }
}

onMounted(() => {
  reloadUserToolData();
  syncHubTabFromRoute();
  loadGames();
});

watch(canSeeGames, (v) => {
  if (v) loadGames();
  else registryGames.value = [];
});

watch(userId, () => {
  reloadUserToolData();
});

watch(
  () => [isStandaloneHub.value, route.query.tab, route.name, route.path],
  () => {
    syncHubTabFromRoute();
  }
);

watch(
  () => props.initialTab,
  (tab) => {
    if (!tab || isStandaloneHub.value) return;
    hubTab.value = parseToolsTab(tab);
  },
  { immediate: true }
);
</script>

<style scoped>
.tools-aids {
  --ta-teal: #0f766e;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px 24px 40px;
  box-sizing: border-box;
}
.tools-aids__header h1 {
  margin: 0;
  letter-spacing: -0.02em;
}
.back-link {
  display: inline-block;
  margin-bottom: 8px;
  color: #64748b;
  text-decoration: none;
}
.back-link:hover { text-decoration: underline; }
.subtitle {
  margin: 6px 0 0;
  color: #64748b;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.search-input,
.select {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 0.9rem;
  background: #fff;
}
.search-input {
  flex: 1 1 220px;
  min-width: 180px;
}
.select { min-width: 140px; }
.tabs {
  display: flex;
  gap: 6px;
  margin-top: 16px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0;
}
.tab {
  border: none;
  background: transparent;
  padding: 10px 14px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab--active {
  color: var(--ta-teal);
  border-bottom-color: var(--ta-teal);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin: 16px 0;
}
.stat-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(165deg, #f0fdfa 0%, #fff 70%);
}
.stat-value {
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
}
.stat-label {
  font-size: 0.78rem;
  color: #64748b;
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
  align-items: stretch;
  width: 100%;
}
.empty {
  grid-column: 1 / -1;
  color: #64748b;
  margin: 8px 0;
}
.empty--wide { padding: 18px; border: 1px dashed #cbd5e1; border-radius: 12px; }
.ai-section { display: grid; gap: 16px; width: 100%; }
.trust-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 600;
}
.cta-banner {
  margin-top: 22px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid #99f6e4;
  background: linear-gradient(120deg, #f0fdfa, #fff);
}
.cta-banner p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.9rem;
}
.btn-cta {
  border: none;
  background: #0f766e;
  color: #fff;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}
.btn-cta:hover { background: #0d5f59; }
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #0f172a;
  color: #fff;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 0.88rem;
  z-index: 1500;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25);
}
@media (max-width: 640px) {
  .tools-aids {
    padding: 12px 14px 32px;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
