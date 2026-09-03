<template>
  <div class="library-page">
    <div class="library-page__inner">
      <header class="library-page__header">
        <div>
          <h1>Tools and Resources</h1>
          <p class="library-page__sub">
            Find guides, resources, templates, care documents, forms, and links available through your
            organization.
          </p>
        </div>
        <button
          type="button"
          class="lib-btn lib-btn--primary"
          @click="openAdd('link')"
        >
          + Add Resource
        </button>
      </header>

      <div class="library-search-row">
        <div class="library-search">
          <span class="library-search__icon" aria-hidden="true">⌕</span>
          <input
            v-model="search"
            type="search"
            placeholder="Search resources, guides, templates, links…"
            aria-label="Search Tools and Resources"
            @keydown.enter="runSearch"
          />
        </div>
        <button type="button" class="lib-btn lib-btn--ghost" @click="runSearch">
          <span aria-hidden="true">⚙</span> Filters
        </button>
      </div>

      <section v-if="!activeCategoryId && !searchActive" class="library-cats">
        <h2 class="library-section-title">Browse by Category</h2>
        <div class="library-cats__grid">
          <button
            v-for="c in categoryCards"
            :key="c.id"
            type="button"
            class="library-cat"
            :style="c.themeStyle"
            @click="selectCategory(c)"
          >
            <span class="library-cat__icon" v-html="c.iconSvg" />
            <span class="library-cat__body">
              <span class="library-cat__name">{{ c.name }}</span>
              <span class="library-cat__desc">{{ c.description }}</span>
              <span class="library-cat__count">{{ c.countLabel }}</span>
            </span>
            <span class="library-cat__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <div class="library-layout">
        <main class="library-main">
          <div class="library-panel">
            <div class="library-toolbar">
              <div class="library-tabs">
                <button
                  v-for="t in mainTabs"
                  :key="t.id"
                  type="button"
                  class="library-tabs__btn"
                  :class="{ 'is-active': activeTab === t.id }"
                  @click="setTab(t.id)"
                >
                  {{ t.label }}
                </button>
              </div>
              <div class="library-toolbar__right">
                <button
                  v-if="activeCategoryId || searchActive || folderId !== undefined"
                  type="button"
                  class="lib-btn lib-btn--ghost lib-btn--sm"
                  @click="clearFilters"
                >
                  Clear filters
                </button>
                <div class="library-view-toggle" role="group" aria-label="View mode">
                  <button
                    type="button"
                    :class="{ 'is-active': viewMode === 'list' }"
                    title="List view"
                    @click="viewMode = 'list'"
                  >
                    ☰
                  </button>
                  <button
                    type="button"
                    :class="{ 'is-active': viewMode === 'grid' }"
                    title="Grid view"
                    @click="viewMode = 'grid'"
                  >
                    ▦
                  </button>
                </div>
              </div>
            </div>

            <p v-if="filterLabel" class="library-filter-label">{{ filterLabel }}</p>

            <div v-if="loading" class="library-empty">Loading…</div>
            <div v-else-if="error" class="library-empty library-empty--error">{{ error }}</div>
            <div v-else-if="!displayItems.length" class="library-empty">
              No resources yet.
              Use <strong>+ Add Resource</strong> to upload a file or paste a Google Doc link.
              Admins can share with everyone; personal items stay yours until you share a folder.
            </div>
            <LibraryResourceGrid
              v-else-if="viewMode === 'grid'"
              :items="displayItems"
              :can-manage="canManage"
              :show-owner-menu="true"
              @open="openResource"
              @toggle-favorite="toggleFavorite"
              @menu="openMenu"
            />
            <LibraryResourceList
              v-else
              :items="displayItems"
              :can-manage="canManage"
              :show-owner-menu="true"
              @open="openResource"
              @toggle-favorite="toggleFavorite"
              @menu="openMenu"
            />

            <button
              v-if="activeTab === 'recent' && displayItems.length"
              type="button"
              class="library-view-all"
              @click="setTab('all')"
            >
              View all resources →
            </button>
          </div>
        </main>

        <aside class="library-side">
          <section class="library-side__card">
            <h3>Quick Access</h3>
            <div class="library-qa">
              <button type="button" class="library-qa__btn" @click="openAdd('upload')">
                <span class="library-qa__ico" aria-hidden="true">☁</span>
                Upload New Resource
              </button>
              <button type="button" class="library-qa__btn" @click="openAdd('link')">
                <span class="library-qa__ico" aria-hidden="true">🔗</span>
                Save New Link
              </button>
              <button type="button" class="library-qa__btn" @click="openAdd('folder')">
                <span class="library-qa__ico" aria-hidden="true">📁</span>
                Create New Folder
              </button>
              <router-link
                v-if="canManage"
                class="library-qa__btn"
                :to="settingsPath"
              >
                <span class="library-qa__ico" aria-hidden="true">⚙</span>
                Library Settings
              </router-link>
            </div>
          </section>

          <section v-if="folders.length" class="library-side__card">
            <h3>Folders</h3>
            <ul class="library-folders">
              <li>
                <button type="button" :class="{ 'is-active': folderId === undefined }" @click="selectFolder(undefined)">
                  All folders
                </button>
              </li>
              <li v-for="f in folders" :key="f.id">
                <div class="library-folders__row" :class="{ 'is-mine': f.scope === 'personal' || f.isMine }">
                  <button
                    type="button"
                    :class="{ 'is-active': Number(folderId) === Number(f.id) }"
                    @click="selectFolder(f.id)"
                  >
                    {{ f.name }}
                    <span v-if="f.scope === 'personal' || f.isMine" class="library-mine-pill">Mine</span>
                  </button>
                  <button
                    v-if="f.scope === 'personal' || f.isMine || canManage"
                    type="button"
                    class="library-folders__share"
                    title="Share folder"
                    @click="openShareFolder(f)"
                  >
                    Share
                  </button>
                </div>
              </li>
            </ul>
          </section>

          <section class="library-side__card">
            <h3>Recently Updated</h3>
            <ul v-if="home?.recentlyUpdated?.length" class="library-mini">
              <li v-for="r in home.recentlyUpdated.slice(0, 5)" :key="r.id">
                <button type="button" class="library-mini__row" @click="openResource(r)">
                  <span class="library-mini__type">{{ shortType(r) }}</span>
                  <span class="library-mini__text">
                    <span class="library-mini__name">{{ r.name }}</span>
                    <span class="library-mini__date">{{ formatDate(r.updatedAt) }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <p v-else class="library-side__muted">Nothing updated yet.</p>
            <button
              v-if="home?.recentlyUpdated?.length"
              type="button"
              class="library-view-all"
              @click="setTab('all')"
            >
              View all updates →
            </button>
          </section>
        </aside>
      </div>
    </div>

    <LibraryAddResourceModal
      v-if="showAdd"
      :categories="categories"
      :folders="folders"
      :default-folder-id="folderId || ''"
      :initial-mode="addModePref"
      :can-manage="canManage"
      @close="showAdd = false; addModePref = 'link'"
      @created="onCreated"
    />

    <div v-if="shareFolder" class="lib-modal-backdrop" @click.self="shareFolder = null">
      <div class="lib-share-modal" role="dialog" aria-modal="true">
        <header class="lib-share-modal__head">
          <h2>Share “{{ shareFolder.name }}”</h2>
          <button type="button" class="lib-modal__x" @click="shareFolder = null">×</button>
        </header>
        <p class="lib-share-modal__hint">
          Invite coworkers by work email. They’ll see everything in this folder (including your personal docs in it).
        </p>
        <label class="lib-field">
          <span>Emails (comma-separated)</span>
          <textarea v-model="shareEmails" rows="3" placeholder="alex@agency.org, jordan@agency.org" />
        </label>
        <ul v-if="shareList.length" class="lib-share-modal__list">
          <li v-for="s in shareList" :key="s.id">{{ s.userName || s.userEmail || s.granteeValue }}</li>
        </ul>
        <p v-if="shareError" class="lib-error">{{ shareError }}</p>
        <footer class="lib-share-modal__foot">
          <button type="button" class="btn btn-secondary" @click="shareFolder = null">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="shareSaving" @click="saveShareFolder">
            {{ shareSaving ? 'Saving…' : 'Save sharing' }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="viewerResource" class="library-viewer-overlay" @click.self="closeViewer">
      <div class="library-viewer-shell">
        <LibraryResourceViewer
          :resource="viewerResource"
          :can-distribute="canDistribute(viewerResource)"
          @close="closeViewer"
          @distribute="openDistribute(viewerResource)"
        />
      </div>
    </div>

    <div v-if="menuItem" class="library-menu" :style="menuStyle" @click.stop>
      <button
        v-if="canDistribute(menuItem)"
        type="button"
        @click="openDistribute(menuItem)"
      >
        Distribute…
      </button>
      <button v-if="canManage" type="button" @click="toggleFeatured(menuItem)">
        {{ menuItem.featured ? 'Unfeature' : 'Mark featured' }}
      </button>
      <button type="button" class="is-danger" @click="archiveItem(menuItem)">Archive</button>
      <button type="button" @click="menuItem = null">Cancel</button>
    </div>

    <LibraryDistributeModal
      v-if="distributeItem"
      :resource="distributeItem"
      :agency-id="agencyId"
      @close="distributeItem = null"
      @done="onDistributed"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import LibraryResourceGrid from '../components/library/LibraryResourceGrid.vue';
import LibraryResourceList from '../components/library/LibraryResourceList.vue';
import LibraryAddResourceModal from '../components/library/LibraryAddResourceModal.vue';
import LibraryResourceViewer from '../components/library/LibraryResourceViewer.vue';
import LibraryDistributeModal from '../components/library/LibraryDistributeModal.vue';
import {
  fetchLibraryHome,
  fetchLibraryResources,
  fetchLibraryResource,
  addLibraryFavorite,
  removeLibraryFavorite,
  updateLibraryResource,
  archiveLibraryResource,
  fetchFolderShares,
  setFolderShares
} from '../services/library.js';

const CATEGORY_META = {
  guides_resources: {
    description: 'Client education, toolkits, and helpful handouts',
    accent: '#16a34a',
    bg: '#ecfdf5',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
  },
  templates: {
    description: 'Ready-to-use templates for common needs',
    accent: '#7c3aed',
    bg: '#f5f3ff',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  },
  forms_assessments: {
    description: 'Intake forms, assessments, and screening tools',
    accent: '#ea580c',
    bg: '#fff7ed',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
  },
  care_documents: {
    description: 'Care plans, safety plans, discharge and support documents',
    accent: '#2563eb',
    bg: '#eff6ff',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
  },
  policies_procedures: {
    description: 'Agency procedures, compliance, and reference materials',
    accent: '#4f46e5',
    bg: '#eef2ff',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
  },
  community_external: {
    description: 'Helpful websites, external resources, and community supports',
    accent: '#0d9488',
    bg: '#f0fdfa',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
  }
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const home = ref(null);
const resources = ref([]);
const allForCounts = ref([]);
const search = ref('');
const searchActive = ref(false);
const activeTab = ref('recent');
const activeCategoryId = ref(null);
const folderId = ref(undefined);
const viewMode = ref('list');
const showAdd = ref(false);
const addModePref = ref('link');
const viewerResource = ref(null);
const menuItem = ref(null);
const menuStyle = ref({});
const shareFolder = ref(null);
const shareEmails = ref('');
const shareList = ref([]);
const shareSaving = ref(false);
const shareError = ref('');
const distributeItem = ref(null);

const caps = computed(() => authStore.user?.capabilities || {});
const canManage = computed(() => !!caps.value.canManageLibrary);
const agencyId = computed(
  () =>
    authStore.user?.agency_id ||
    authStore.user?.agencyId ||
    home.value?.agencyId ||
    null
);

const categories = computed(() => home.value?.categories || []);
const folders = computed(() => home.value?.folders || []);

const orgSlug = computed(() => route.params.organizationSlug || '');
const settingsPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/library-settings` : '/admin/library-settings'
);

const mainTabs = [
  { id: 'recent', label: 'Recent' },
  { id: 'all', label: 'All Resources' },
  { id: 'favorites', label: 'Favorites' }
];

const categoryCards = computed(() => {
  const counts = {};
  for (const r of allForCounts.value || []) {
    const id = r.categoryId;
    if (id == null) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  return categories.value.map((c) => {
    const meta = CATEGORY_META[c.slug] || {
      description: c.description || 'Browse resources in this category',
      accent: '#166534',
      bg: '#ecfdf5',
      icon: CATEGORY_META.guides_resources.icon
    };
    const n = counts[c.id] || 0;
    const isLinkCat = c.slug === 'community_external';
    return {
      ...c,
      description: meta.description,
      iconSvg: meta.icon,
      countLabel: isLinkCat ? `${n} link${n === 1 ? '' : 's'}` : `${n} item${n === 1 ? '' : 's'}`,
      themeStyle: {
        '--cat-accent': meta.accent,
        '--cat-bg': meta.bg
      }
    };
  });
});

const filterLabel = computed(() => {
  const parts = [];
  if (activeCategoryId.value) {
    const c = categories.value.find((x) => Number(x.id) === Number(activeCategoryId.value));
    if (c) parts.push(c.name);
  }
  if (folderId.value) {
    const f = folders.value.find((x) => Number(x.id) === Number(folderId.value));
    if (f) parts.push(`Folder: ${f.name}`);
  }
  if (searchActive.value && search.value) parts.push(`Search: “${search.value}”`);
  return parts.join(' · ');
});

const displayItems = computed(() => {
  if (activeTab.value === 'favorites' && !searchActive.value && !activeCategoryId.value) {
    return home.value?.favorites || resources.value;
  }
  if (
    activeTab.value === 'recent' &&
    !searchActive.value &&
    !activeCategoryId.value &&
    folderId.value === undefined
  ) {
    const viewed = home.value?.recentlyViewed || [];
    const updated = home.value?.recentlyUpdated || [];
    if (viewed.length) return viewed;
    return updated;
  }
  return resources.value;
});

function shortType(r) {
  if (r.resourceType === 'google_doc') return 'GDOC';
  if (r.resourceType === 'link') return 'LINK';
  return String(r.fileType || 'FILE').slice(0, 4).toUpperCase();
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

async function loadHome() {
  home.value = await fetchLibraryHome();
}

async function loadResources() {
  const params = {
    sort: 'updated',
    limit: 100
  };
  if (searchActive.value && search.value.trim()) params.q = search.value.trim();
  if (activeCategoryId.value) params.categoryId = activeCategoryId.value;
  if (folderId.value !== undefined) {
    params.folderId = folderId.value == null ? 'all' : folderId.value;
  }
  if (activeTab.value === 'favorites') params.favorites = '1';
  resources.value = await fetchLibraryResources(params);
}

async function loadCounts() {
  try {
    allForCounts.value = await fetchLibraryResources({ sort: 'updated', limit: 500 });
  } catch {
    allForCounts.value = [];
  }
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    await loadHome();
    await loadCounts();
    if (
      activeTab.value === 'all' ||
      searchActive.value ||
      activeCategoryId.value ||
      folderId.value !== undefined ||
      activeTab.value === 'favorites'
    ) {
      await loadResources();
    } else {
      resources.value = [];
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load Library';
  } finally {
    loading.value = false;
  }
}

function openAdd(mode) {
  addModePref.value = mode || 'link';
  showAdd.value = true;
}

async function openShareFolder(folder) {
  shareFolder.value = folder;
  shareError.value = '';
  shareEmails.value = '';
  shareList.value = [];
  try {
    shareList.value = await fetchFolderShares(folder.id);
    shareEmails.value = (shareList.value || [])
      .map((s) => s.userEmail)
      .filter(Boolean)
      .join(', ');
  } catch {
    shareList.value = [];
  }
}

async function saveShareFolder() {
  if (!shareFolder.value) return;
  shareSaving.value = true;
  shareError.value = '';
  try {
    shareList.value = await setFolderShares(shareFolder.value.id, {
      emails: shareEmails.value,
      permission: 'view'
    });
    shareFolder.value = null;
    await refresh();
  } catch (e) {
    shareError.value = e?.response?.data?.error?.message || e?.message || 'Could not save sharing';
  } finally {
    shareSaving.value = false;
  }
}

function setTab(id) {
  activeTab.value = id;
  refresh();
}

function selectCategory(c) {
  activeCategoryId.value = c.id;
  activeTab.value = 'all';
  refresh();
}

function selectFolder(id) {
  folderId.value = id;
  activeTab.value = 'all';
  refresh();
}

function clearFilters() {
  activeCategoryId.value = null;
  folderId.value = undefined;
  search.value = '';
  searchActive.value = false;
  activeTab.value = 'recent';
  refresh();
}

function runSearch() {
  searchActive.value = !!search.value.trim();
  activeTab.value = 'all';
  refresh();
}

async function openResource(item) {
  try {
    const full = await fetchLibraryResource(item.id);
    viewerResource.value = full;
    if (route.params.resourceId !== String(item.id) && orgSlug.value) {
      router
        .replace({
          name: 'OrganizationLibraryResource',
          params: { organizationSlug: orgSlug.value, resourceId: String(item.id) }
        })
        .catch(() => {});
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not open resource';
  }
}

function closeViewer() {
  viewerResource.value = null;
  if (route.name === 'OrganizationLibraryResource' && orgSlug.value) {
    router.replace({ name: 'OrganizationLibrary', params: { organizationSlug: orgSlug.value } }).catch(() => {});
  }
}

async function toggleFavorite(item) {
  try {
    if (item.isFavorite) await removeLibraryFavorite(item.id);
    else await addLibraryFavorite(item.id);
    item.isFavorite = !item.isFavorite;
    await loadHome();
  } catch {
    /* ignore */
  }
}

function openMenu(item, evt) {
  menuItem.value = item;
  const x = evt?.clientX || 120;
  const y = evt?.clientY || 120;
  menuStyle.value = { left: `${x}px`, top: `${y}px` };
}

function canDistribute(item) {
  if (!item) return false;
  if (canManage.value) return true;
  return Number(item.ownerUserId) === Number(authStore.user?.id);
}

function openDistribute(item) {
  distributeItem.value = item;
  menuItem.value = null;
}

function onDistributed() {
  // Keep modal open so success message is visible; refresh list underneath
  refresh();
}

async function toggleFeatured(item) {
  try {
    await updateLibraryResource(item.id, { featured: !item.featured });
    menuItem.value = null;
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Update failed';
  }
}

async function archiveItem(item) {
  try {
    await archiveLibraryResource(item.id);
    menuItem.value = null;
    if (viewerResource.value?.id === item.id) closeViewer();
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Archive failed';
  }
}

async function onCreated() {
  await refresh();
}

function onDocClick() {
  menuItem.value = null;
}

watch(
  () => route.params.resourceId,
  async (id) => {
    if (id) {
      try {
        viewerResource.value = await fetchLibraryResource(id);
      } catch {
        viewerResource.value = null;
      }
    }
  }
);

onMounted(async () => {
  document.addEventListener('click', onDocClick);
  await refresh();
  if (route.params.resourceId) {
    try {
      viewerResource.value = await fetchLibraryResource(route.params.resourceId);
    } catch {
      /* ignore */
    }
  }
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
});
</script>

<style scoped>
.library-page {
  --lib-green: #166534;
  --lib-green-soft: #dcfce7;
  width: 100%;
  min-height: calc(100vh - 120px);
  background: #f3f4f6;
  padding: 1.25rem 1.5rem 3rem;
  box-sizing: border-box;
}

.library-page__inner {
  width: 100%;
  max-width: none;
  margin: 0;
}

.library-page__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.15rem;
}

.library-page__header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: #0f172a;
}

.library-page__sub {
  margin: 0.35rem 0 0;
  color: #64748b;
  max-width: 40rem;
  line-height: 1.45;
  font-size: 0.95rem;
}

.lib-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 10px;
  border: 1px solid transparent;
  padding: 0.6rem 1rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.lib-btn--primary {
  background: var(--lib-green);
  color: #fff;
}

.lib-btn--primary:hover {
  background: #14532d;
}

.lib-btn--ghost {
  background: #fff;
  border-color: #e5e7eb;
  color: #334155;
}

.lib-btn--sm {
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
}

.library-search-row {
  display: flex;
  gap: 0.65rem;
  margin-bottom: 1.35rem;
  align-items: stretch;
}

.library-search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 0 1rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.library-search__icon {
  color: #94a3b8;
  font-size: 1.1rem;
}

.library-search input {
  flex: 1;
  border: 0;
  outline: none;
  padding: 0.85rem 0;
  font-size: 1rem;
  background: transparent;
}

.library-section-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 650;
  color: #334155;
}

.library-cats {
  margin-bottom: 1.35rem;
}

.library-cats__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.library-cat {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.75rem;
  align-items: start;
  text-align: left;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 14px;
  padding: 1rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.library-cat:hover {
  border-color: var(--cat-accent, #86efac);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}

.library-cat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background: var(--cat-bg, #ecfdf5);
  color: var(--cat-accent, #166534);
  flex-shrink: 0;
}

.library-cat__name {
  display: block;
  font-weight: 700;
  color: #0f172a;
  font-size: 0.92rem;
  margin-bottom: 0.2rem;
}

.library-cat__desc {
  display: block;
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.35;
  margin-bottom: 0.45rem;
}

.library-cat__count {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--cat-accent, #166534);
  background: var(--cat-bg, #ecfdf5);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

.library-cat__arrow {
  color: #cbd5e1;
  font-size: 1.1rem;
  margin-top: 0.35rem;
}

.library-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 1.15rem;
  align-items: start;
}

.library-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 0.85rem 1rem 1rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.library-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.65rem;
}

.library-tabs {
  display: flex;
  gap: 0.15rem;
}

.library-tabs__btn {
  border: 0;
  background: transparent;
  padding: 0.45rem 0.85rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -0.65rem;
}

.library-tabs__btn.is-active {
  color: var(--lib-green);
  border-bottom-color: var(--lib-green);
}

.library-toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.library-view-toggle {
  display: inline-flex;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.library-view-toggle button {
  border: 0;
  background: #fff;
  padding: 0.4rem 0.65rem;
  font-size: 0.95rem;
  cursor: pointer;
  color: #94a3b8;
}

.library-view-toggle button.is-active {
  background: var(--lib-green-soft);
  color: var(--lib-green);
}

.library-filter-label {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: #64748b;
}

.library-empty {
  padding: 2.5rem 1rem;
  text-align: center;
  color: #64748b;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #fafafa;
}

.library-empty--error {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
}

.library-view-all {
  display: inline-block;
  margin-top: 0.85rem;
  border: 0;
  background: transparent;
  color: #0d9488;
  font-weight: 650;
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0;
}

.library-side__card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 1rem;
  margin-bottom: 0.85rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.library-side__card h3 {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.library-side__muted {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.library-qa {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.library-qa__btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.55rem 0.4rem;
  border-radius: 8px;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 550;
  color: #334155;
  cursor: pointer;
  text-decoration: none;
}

.library-qa__btn:hover {
  background: #f0fdf4;
  color: var(--lib-green);
}

.library-qa__ico {
  width: 1.5rem;
  text-align: center;
  opacity: 0.85;
}

.library-folders,
.library-mini {
  list-style: none;
  margin: 0;
  padding: 0;
}

.library-folders li {
  margin: 0;
}

.library-folders__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 8px;
  padding: 0.1rem;
}

.library-folders__row.is-mine {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.library-folders button {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.4rem 0.35rem;
  font-size: 0.85rem;
  color: #334155;
  cursor: pointer;
  border-radius: 6px;
}

.library-folders__row > button:first-child {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.library-folders button:hover,
.library-folders button.is-active {
  background: #ecfdf5;
  color: var(--lib-green);
  font-weight: 600;
}

.library-folders__row.is-mine button:hover,
.library-folders__row.is-mine button.is-active {
  background: #fef3c7;
  color: #b45309;
}

.library-folders__share {
  flex: 0 0 auto;
  width: auto !important;
  font-size: 0.7rem !important;
  font-weight: 700;
  color: #b45309 !important;
  padding: 0.25rem 0.45rem !important;
  white-space: nowrap;
}

.library-mine-pill {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.12rem 0.35rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
}

.lib-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.lib-share-modal {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
  padding: 1.1rem 1.2rem 1.15rem;
}

.lib-share-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.lib-share-modal__head h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #0f172a;
}

.lib-modal__x {
  border: 0;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}

.lib-share-modal__hint {
  margin: 0 0 0.85rem;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.4;
}

.lib-share-modal .lib-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.lib-share-modal textarea {
  font: inherit;
  font-weight: 400;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  resize: vertical;
}

.lib-share-modal__list {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  font-size: 0.85rem;
  color: #475569;
}

.lib-share-modal__list li {
  padding: 0.25rem 0;
}

.lib-share-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.lib-error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}

.library-mini__row {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0.45rem 0.2rem;
  cursor: pointer;
  text-align: left;
  border-radius: 8px;
}

.library-mini__row:hover {
  background: #f8fafc;
}

.library-mini__type {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  color: #166534;
  background: #ecfdf5;
  padding: 0.25rem 0.35rem;
  border-radius: 6px;
}

.library-mini__name {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
}

.library-mini__date {
  display: block;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 0.1rem;
}

.library-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 1rem;
}

.library-viewer-shell {
  width: min(1100px, 100%);
  height: calc(100vh - 2rem);
}

.library-menu {
  position: fixed;
  z-index: 100;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  min-width: 160px;
  overflow: hidden;
}

.library-menu button {
  border: 0;
  background: #fff;
  text-align: left;
  padding: 0.55rem 0.85rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.library-menu button:hover {
  background: #f8fafc;
}

.library-menu .is-danger {
  color: #b91c1c;
}

@media (max-width: 980px) {
  .library-layout {
    grid-template-columns: 1fr;
  }
  .library-side {
    order: -1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }
  .library-side__card {
    margin-bottom: 0;
  }
}

@media (max-width: 640px) {
  .library-page {
    padding: 1rem 0.85rem 2.5rem;
  }
  .library-page__header {
    flex-direction: column;
  }
  .library-search-row {
    flex-direction: column;
  }
  .library-cats__grid {
    grid-template-columns: 1fr;
  }
}
</style>
