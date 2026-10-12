<template>
  <div class="library-page">
    <header class="document-topbar">
      <div class="document-identity"><span class="document-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></svg></span><div><h1>Document library <span class="beta-label">Beta</span></h1><p>{{ agencyName }}</p></div></div>
      <form class="document-search" role="search" @submit.prevent="runSearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input v-model="search" type="search" aria-label="Search documents" placeholder="Search documents, policies, or keywords…" @input="scheduleSearch" /><button v-if="search" type="button" aria-label="Clear search" @click="search = ''; runSearch()">×</button></form>
      <div class="document-actions">
        <details ref="addMenu" class="document-add-menu" @keydown.esc.prevent="closeAddMenu(true)" @focusout="onAddFocusOut">
          <summary class="lib-btn lib-btn--ghost" :aria-disabled="!agencyId" @click="!agencyId && $event.preventDefault()">Add +</summary>
          <div class="document-add-options" aria-label="Add to library">
            <button v-for="action in addActions" :key="action.mode" type="button" @click="openAdd(action.mode)">{{ action.label }}</button>
          </div>
        </details>
        <button class="lib-btn lib-btn--primary" :disabled="!agencyId" @click="openAdd('branded')"><span aria-hidden="true">＋</span> New document</button>
      </div>
    </header>
    <div class="document-layout">
      <aside class="document-sidebar" :class="{ 'sidebar-expanded': showNavigation }" aria-label="Library navigation">
        <router-link class="sidebar-home" :to="`${orgPrefix}/dashboard`">← My dashboard</router-link>
        <nav aria-label="Browse documents">
          <button v-for="tab in documentTabs" :key="tab.id" :aria-current="activeTab === tab.id && !activeCategoryId && folderId === undefined ? 'page' : undefined" @click="setTab(tab.id)"><span class="nav-symbol" aria-hidden="true">{{ tab.icon }}</span>{{ tab.label }}</button>
        </nav>
        <button class="mobile-navigation-toggle" :aria-expanded="showNavigation" @click="showNavigation = !showNavigation">Folders &amp; tools {{ showNavigation ? '−' : '+' }}</button><div class="sidebar-heading">Categories</div>
        <nav aria-label="Document categories"><button v-for="c in categoryCards" :key="c.id" :aria-current="Number(activeCategoryId) === Number(c.id) ? 'page' : undefined" @click="selectCategory(c)"><span class="category-icon" :style="c.themeStyle" v-html="c.iconSvg"/><span>{{ c.name }}</span></button></nav>
        <div class="sidebar-heading"><span>Folders</span><button aria-label="Create folder" title="Create folder" @click="openAdd('folder')">＋</button></div>
        <div v-if="!folders.length" class="sidebar-hint">Organize documents your way.</div>
        <div v-for="f in rootFolders" :key="f.id" class="folder-row"><button :aria-current="Number(folderId) === Number(f.id) ? 'page' : undefined" @click="selectFolder(f.id, true)"><span aria-hidden="true">▱</span><span>{{ f.name }}</span></button><button v-if="canShareFolder(f)" class="folder-share" :aria-label="`Share ${f.name}`" title="Share folder" @click="openShareFolder(f)">↗</button></div>
        <div class="sidebar-heading">Create &amp; organize</div>
        <nav aria-label="Document tools"><router-link :to="`${orgPrefix}/clinical-forms`"><span class="nav-symbol" aria-hidden="true">✚</span>Clinical forms</router-link><button @click="openAdd('link')"><span class="nav-symbol" aria-hidden="true">↗</span>Save a link</button><button @click="openAdd('video')"><span class="nav-symbol" aria-hidden="true">▷</span>Video link</button><button @click="openAdd('upload_folder')"><span class="nav-symbol" aria-hidden="true">↑</span>Upload a folder</button><router-link v-if="canManage" :to="settingsPath"><span class="nav-symbol" aria-hidden="true">⚙</span>Library settings</router-link></nav>
        <div class="sidebar-footer"><router-link :to="`${orgPrefix}/my-learning`">Go to Training <span aria-hidden="true">↗</span></router-link></div>
      </aside>
      <main class="document-main">
        <template v-if="selectedReference && referenceAgencyId">
          <button class="lib-btn lib-btn--ghost lib-btn--sm document-back" @click="closeReference">← Back to documents</button>
          <CompanyReferenceLibrary :key="referenceAgencyId" :agency-id="referenceAgencyId" :org-prefix="orgPrefix" reader-only />
        </template>
        <template v-else>
          <div class="document-section-heading"><div><h2>{{ sectionTitle }}</h2><p>{{ sectionDescription }}</p></div><div class="heading-tools"><router-link v-if="referenceCanManage" :to="`${orgPrefix}/admin/document-library?company=${referenceAgencyId}`">Manage company guides ↗</router-link><button v-if="canViewStatistics" class="lib-btn lib-btn--ghost lib-btn--sm" @click="showStatistics = !showStatistics">{{ showStatistics ? 'Hide statistics' : 'Statistics' }}</button></div></div>
          <DocumentAnalyticsControl v-if="showStatistics" :agency-id="referenceAgencyId" initially-open />
          <nav v-if="folderId !== undefined" class="folder-breadcrumbs" aria-label="Folder location"><button @click="goToFolderRoot">{{ activeCategoryId ? categories.find(c => Number(c.id) === Number(activeCategoryId))?.name : 'Library' }}</button><template v-for="folder in folderTrail" :key="folder.id"><span aria-hidden="true">/</span><button :aria-current="Number(folderId) === Number(folder.id) ? 'page' : undefined" @click="selectFolder(folder.id)">{{ folder.name }}</button></template></nav>
          <div v-if="['all', 'files', 'mine'].includes(activeTab)" class="folder-view-controls" role="group" aria-label="Browse mode">
            <button class="lib-btn lib-btn--sm" :aria-pressed="!showAll" @click="setBrowseMode(false)">Folders</button>
            <button class="lib-btn lib-btn--sm" :aria-pressed="showAll" @click="setBrowseMode(true)">Show all</button>
            <span>{{ searchActive ? 'Search results across folders' : showAll ? 'All documents in this view' : 'Browse folders, then open a document' }}</span>
          </div>
          <div v-if="childFolders.length" class="library-subfolders" aria-label="Subfolders"><button v-for="folder in childFolders" :key="folder.id" @click="selectFolder(folder.id)"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/></svg><span>{{ folder.name }}</span><span class="folder-arrow" aria-hidden="true">→</span></button></div>
          <div class="document-filterbar"><div class="filter-left"><label>Type<select v-model="typeFilter"><option value="">All types</option><option value="company_guide">Handbooks &amp; guides</option><option value="pdf">PDFs</option><option value="branded_doc">Editable documents</option><option value="image">Images</option><option value="video">Video links</option><option value="link">Links &amp; Google files</option></select></label><label>Sort<select v-model="sortBy" @change="loadSorted"><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></label><button v-if="activeCategoryId || searchActive || folderId !== undefined || typeFilter" class="clear-filter" @click="clearFilters">Clear filters</button></div><div class="library-view-toggle" role="group" aria-label="Document view"><button :aria-pressed="viewMode === 'list'" aria-label="List view" @click="viewMode = 'list'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/></svg></button><button :aria-pressed="viewMode === 'grid'" aria-label="Grid view" @click="viewMode = 'grid'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button></div></div>
          <p v-if="filterLabel" class="document-filter-label">{{ filterLabel }}</p>
          <div v-if="error || referenceError" class="document-error" role="alert">{{ error || referenceError }} <button @click="refresh">Retry</button></div>
          <div class="document-results-layout" :class="{ 'has-details': detailItem }">
            <section class="document-results" aria-label="Documents">
              <div class="document-result-count" role="status">{{ loading ? 'Loading documents…' : childFolders.length && !displayItems.length ? `${childFolders.length} folders · Open a folder to view its documents` : `${displayItems.length} document${displayItems.length === 1 ? '' : 's'} shown` }}</div>
              <div v-if="loading" class="document-empty" role="status"><span class="loading-lines"></span>Getting your documents…</div>
              <div v-else-if="!displayItems.length && !childFolders.length" class="document-empty"><span class="empty-document" aria-hidden="true">▤</span><h3>{{ searchActive ? 'No matching documents' : 'No documents here yet' }}</h3><p>{{ searchActive ? 'Try another title or keyword, or clear your filters.' : activeTab === 'favorites' ? 'Star a file or document to keep it close at hand.' : 'Upload a file or create a document to get started.' }}</p><button class="lib-btn lib-btn--ghost" @click="searchActive ? clearFilters() : openAdd('upload')">{{ searchActive ? 'Clear filters' : 'Upload a document' }}</button></div>
              <component :is="viewMode === 'grid' ? LibraryResourceGrid : LibraryResourceList" v-else-if="displayItems.length" :items="displayItems" :can-manage="canManage" :show-owner-menu="true" :show-details="true" :selected-id="detailItem?.id" @open="openResource" @toggle-favorite="toggleFavorite" @menu="openMenu" @details="detailItem = $event" />
              <button v-if="hasMore && activeTab !== 'guides' && activeTab !== 'recent'" class="document-load-more lib-btn lib-btn--ghost" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? 'Loading…' : 'Load more documents' }}</button>
            </section>
            <aside v-if="detailItem" class="document-detail" aria-label="Document details"><div class="detail-top"><span class="detail-file-icon">{{ shortType(detailItem) }}</span><button aria-label="Close document details" @click="detailItem = null">×</button></div><h3>{{ detailItem.name }}</h3><span class="detail-category">{{ detailItem.categoryName || 'Resource' }}</span><p>{{ detailItem.description || 'Open this document to view its contents.' }}</p><button class="lib-btn lib-btn--primary detail-open" @click="openResource(detailItem)">{{ isPdf(detailItem) ? 'Open, fill & sign' : 'Open document' }} <span aria-hidden="true">↗</span></button><dl><dt>Access</dt><dd>{{ detailItem.scope === 'personal' ? 'Personal document' : 'Organization library' }}</dd><dt v-if="detailItem.updatedAt">Updated</dt><dd v-if="detailItem.updatedAt">{{ formatDate(detailItem.updatedAt) }}</dd><dt v-if="detailItem.updatedByName || detailItem.createdByName">By</dt><dd v-if="detailItem.updatedByName || detailItem.createdByName">{{ detailItem.updatedByName || detailItem.createdByName }}</dd></dl><p v-if="isPdf(detailItem)" class="detail-tip">Add text, checkmarks, and your signature directly on the PDF. Save your own completed copy.</p><DocumentAnalyticsControl v-if="detailItem.scope === 'organization' && !detailItem.guideKey" :agency-id="agencyId" :document-key="`resource:${detailItem.id}`" :document-title="detailItem.name" /></aside>
          </div>
        </template>
      </main>
    </div>

    <LibraryAddResourceModal ref="addResourceModal" :agency-id="agencyId"
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
          ref="resourceViewer"
          :resource="viewerResource"
          :can-distribute="canDistribute(viewerResource)"
          @close="closeViewer"
          @saved="onDocumentSaved"
          @copied="onDocumentCopied"
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
      :initial-mode="distributeInitialMode"
      :can-manage="canManage"
      @close="distributeItem = null; distributeInitialMode = 'personal_copy'"
      @done="onDistributed"
    />
  </div>
</template>

<script setup>
import DocumentAnalyticsControl from '../components/library/DocumentAnalyticsControl.vue';
import CompanyReferenceLibrary from '../components/library/CompanyReferenceLibrary.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import LibraryResourceGrid from '../components/library/LibraryResourceGrid.vue';
import LibraryResourceList from '../components/library/LibraryResourceList.vue';
import LibraryAddResourceModal from '../components/library/LibraryAddResourceModal.vue';
import LibraryResourceViewer from '../components/library/LibraryResourceViewer.vue';
import LibraryDistributeModal from '../components/library/LibraryDistributeModal.vue';
import api from '../services/api';
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
    description: 'Clinical references, worksheets, handouts and community supports',
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
const selectedReference = computed(() => route.query.companyDocument || '');
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const home = ref(null);
const resources = ref([]);
const search = ref(String(route.query.q || ''));
const searchActive = ref(!!search.value.trim());
const tabFromSection = (section) => section === 'resources' ? 'files' : ['all', 'mine', 'guides', 'files', 'favorites', 'recent'].includes(section) ? section : 'all';
const activeTab = ref(tabFromSection(route.query.section));
const showNavigation = ref(false);
const detailItem = ref(null), typeFilter = ref(''), sortBy = ref('updated'), showStatistics = ref(false);
const referenceDocuments = ref([]), referenceCanManage = ref(false), referenceError = ref('');
const hasMore = ref(false), loadingMore = ref(false);
let requestSequence = 0, viewerRequestSequence = 0, shareRequestSequence = 0, searchTimer;
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
const activeCategoryId = ref(positiveId(route.query.category) || null);
const folderId = ref(positiveId(route.query.folder));
const showAll = ref(route.query.browse === 'all');
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
const distributeInitialMode = ref('personal_copy');

const caps = computed(() => authStore.user?.capabilities || {});
const canManage = computed(() => !!caps.value.canManageLibrary);
const canViewStatistics = computed(() => ['admin', 'super_admin', 'superadmin'].includes(authStore.user?.effectiveRole || authStore.user?.role));
const agencyStore = useAgencyStore();
const selectedAgency = computed(() => {
  const slug = route.params.organizationSlug;
  return [agencyStore.currentAgency, ...(agencyStore.userAgencies || [])].find(a => a && (!slug || [a.slug, a.portal_url].includes(slug)));
});
const agencyId = computed(() => selectedAgency.value?.id || (!route.params.organizationSlug ? authStore.user?.agency_id || authStore.user?.agencyId : null));
const referenceAgencyId = agencyId;
const agencyName = computed(() => selectedAgency.value?.name || route.params.organizationSlug || 'Your organization');
const categories = computed(() => home.value?.categories || []);
const folders = computed(() => home.value?.folders || []);
const orgSlug = computed(() => route.params.organizationSlug || '');
const orgPrefix = computed(() => (orgSlug.value ? `/${orgSlug.value}` : ''));
const settingsPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/library-settings` : '/admin/library-settings'
);

const documentTabs = [
  { id: 'all', label: 'All documents', icon: '▤' },
  { id: 'mine', label: 'My files', icon: '▱' },
  { id: 'favorites', label: 'Favorites', icon: '☆' },
  { id: 'recent', label: 'Recent', icon: '◷' },
  { id: 'guides', label: 'Handbooks & guides', icon: '▥' },
  { id: 'files', label: 'Files & resources', icon: '▱' }
];
const sectionTitle = computed(() => folderId.value !== undefined ? folders.value.find(f => Number(f.id) === Number(folderId.value))?.name || 'Folder' : activeCategoryId.value ? categories.value.find(c => Number(c.id) === Number(activeCategoryId.value))?.name || 'Documents' : documentTabs.find(t => t.id === activeTab.value)?.label || 'All documents');
const sectionDescription = computed(() => activeTab.value === 'guides' ? 'Your organization’s policies, handbooks, and practice guides.' : activeTab.value === 'favorites' ? 'The documents you keep close at hand.' : 'Find, create, and work with your organization’s documents.');
const guideItems = computed(() => referenceDocuments.value.filter(d => d.key === 'workplace-handbook' || d.published || d.betaAvailable).map(d => ({ ...d, id: `guide:${d.key}`, guideKey: d.key, name: d.title, updatedAt: d.published?.published_at || null, resourceType: 'company_guide', fileType: d.key === 'workplace-handbook' ? 'handbook' : 'guide', categoryName: 'Policies & procedures', categorySlug: 'policies_procedures', scope: 'organization', agencyId: agencyId.value })));
const isPdf = item => item.fileType === 'pdf' || item.mimeType === 'application/pdf';
const folderTrail = computed(() => {
  const result = [], seen = new Set();
  let folder = folders.value.find(item => Number(item.id) === Number(folderId.value));
  while (folder && !seen.has(folder.id)) { result.unshift(folder); seen.add(folder.id); folder = folders.value.find(item => Number(item.id) === Number(folder.parentFolderId)); }
  return result;
});
const rootFolders = computed(() => folders.value.filter(folder => !folder.parentFolderId || !folders.value.some(parent => Number(parent.id) === Number(folder.parentFolderId))));
const folderCategoryIds = computed(() => {
  const byId = new Map(folders.value.map(folder => [Number(folder.id), new Set(folder.categoryIds || [])]));
  for (const folder of folders.value) {
    let parentId = Number(folder.parentFolderId);
    const seen = new Set([Number(folder.id)]);
    while (byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId);
      for (const category of folder.categoryIds || []) byId.get(parentId).add(Number(category));
      parentId = Number(folders.value.find(item => Number(item.id) === parentId)?.parentFolderId);
    }
  }
  return byId;
});
const childFolders = computed(() => {
  if (showAll.value || searchActive.value || !['all', 'files', 'mine'].includes(activeTab.value)) return [];
  const matches = folder => (!activeCategoryId.value || folderCategoryIds.value.get(Number(folder.id))?.has(Number(activeCategoryId.value))) &&
    (activeTab.value !== 'mine' || (folder.scope === 'personal' && Number(folder.ownerUserId) === Number(authStore.user?.id)));
  let result = (folderId.value !== undefined ? folders.value.filter(folder => Number(folder.parentFolderId) === Number(folderId.value)) : rootFolders.value).filter(matches);
  // A category's single empty wrapper need not hide its broad topic folders.
  const seen = new Set();
  while (activeCategoryId.value && folderId.value === undefined && result.length === 1 && result[0].documentCount === 0 && !seen.has(result[0].id)) {
    seen.add(result[0].id);
    const children = folders.value.filter(folder => Number(folder.parentFolderId) === Number(result[0].id)).filter(matches);
    if (!children.length) break;
    result = children;
  }
  return result;
});
const categoryCards = computed(() => {
  return categories.value.map((c) => {
    const meta = CATEGORY_META[c.slug] || {
      description: c.description || 'Browse resources in this category',
      accent: '#166534',
      bg: '#ecfdf5',
      icon: CATEGORY_META.guides_resources.icon
    };
    return {
      ...c,
      description: meta.description,
      iconSvg: meta.icon,
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
  let files = activeTab.value === 'recent' ? home.value?.recentlyViewed || [] : resources.value;
  if (activeTab.value === 'guides') files = [];
  const includeGuides = ['all', 'guides'].includes(activeTab.value) && folderId.value === undefined;
  let guides = includeGuides ? guideItems.value : [];
  if (activeCategoryId.value && categories.value.find(c => Number(c.id) === Number(activeCategoryId.value))?.slug !== 'policies_procedures') guides = [];
  const query = search.value.trim().toLowerCase();
  if (query) guides = guides.filter(g => `${g.name} ${g.description || ''}`.toLowerCase().includes(query));
  let result = [...guides, ...files];
  if (typeFilter.value) result = result.filter(item => typeFilter.value === 'link' ? ['link', 'google_doc'].includes(item.resourceType) : [item.fileType, item.resourceType].includes(typeFilter.value));
  if (sortBy.value === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  else if (activeTab.value !== 'recent') result.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  return result;
});

function shortType(r) {
  if (r.fileType === 'video') return 'VIDEO';
  if (r.guideKey) return r.fileType === 'handbook' ? 'BOOK' : 'GUIDE';
  if (r.resourceType === 'branded_doc') return 'DOC';
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

function resourceParams(offset = 0) {
  const params = { agencyId: agencyId.value, sort: sortBy.value, limit: 100, offset };
  if (search.value.trim()) params.q = search.value.trim();
  if (activeCategoryId.value) params.categoryId = activeCategoryId.value;
  if (!showAll.value && !search.value.trim() && ['all', 'files', 'mine'].includes(activeTab.value)) params.folderId = folderId.value ?? 'root';
  if (activeTab.value === 'favorites') params.favorites = '1';
  if (activeTab.value === 'mine') params.mine = '1';
  return params;
}
async function loadHome() {
  const currentAgencyId = agencyId.value;
  const sequence = requestSequence;
  const result = await fetchLibraryHome({ agencyId: currentAgencyId });
  if (sequence === requestSequence && currentAgencyId === agencyId.value) home.value = result;
}
async function refresh() {
  const sequence = ++requestSequence;
  if (!agencyId.value) { loading.value = false; error.value = 'Select an organization to open its document library.'; return; }
  loading.value = true; loadingMore.value = false; error.value = ''; referenceError.value = ''; detailItem.value = null;
  const params = resourceParams();
  const results = await Promise.allSettled([
    fetchLibraryHome({ agencyId: params.agencyId }),
    fetchLibraryResources(params),
    api.get('/provider-update/company-documents', { params: { agencyId: params.agencyId } })
  ]);
  if (sequence !== requestSequence) return;
  if (results[0].status === 'fulfilled') home.value = results[0].value;
  else { home.value = null; error.value = 'The library could not be loaded. Please retry.'; }
  if (results[1].status === 'fulfilled') { resources.value = results[1].value; hasMore.value = resources.value.length === 100; }
  else { resources.value = []; hasMore.value = false; error.value = results[1].reason?.response?.data?.error?.message || 'Documents could not be loaded.'; }
  if (results[2].status === 'fulfilled') {
    const data = results[2].value.data;
    referenceCanManage.value = data.canManage === true;
    referenceDocuments.value = [{ key: 'workplace-handbook', title: 'Workplace handbook', description: 'Company policies, expectations, and updates.' }, ...(data.documents || [])];
  } else { referenceDocuments.value = []; referenceCanManage.value = false; referenceError.value = 'Company guides could not be loaded.'; }
  loading.value = false;
}
async function loadMore() {
  if (loadingMore.value) return;
  const sequence = requestSequence; loadingMore.value = true;
  try { const next = await fetchLibraryResources(resourceParams(resources.value.length)); if (sequence === requestSequence) { resources.value.push(...next); hasMore.value = next.length === 100; } }
  catch { if (sequence === requestSequence) error.value = 'More documents could not be loaded.'; }
  finally { if (sequence === requestSequence) loadingMore.value = false; }
}
function loadSorted() { refresh(); }
function scheduleSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); }
function closeReference() { const query = { ...route.query }; delete query.companyDocument; router.replace({ query, hash: '' }); }

const addMenu = ref(null);
const addActions = [
  { mode: 'upload', label: 'Upload file' },
  { mode: 'upload_folder', label: 'Upload folder' },
  { mode: 'folder', label: 'Create folder' },
  { mode: 'link', label: 'Add link / Google Doc' },
  { mode: 'video', label: 'Add video link' }
];
function closeAddMenu(restoreFocus = false) {
  if (addMenu.value) addMenu.value.open = false;
  if (restoreFocus) addMenu.value?.querySelector('summary')?.focus();
}
function onAddFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) closeAddMenu();
}
function openAdd(mode) {
  closeAddMenu();
  if (!agencyId.value) { error.value = 'Select an organization before creating a document.'; return; }
  addModePref.value = mode || 'link';
  showAdd.value = true;
}

function canShareFolder(folder) { return canManage.value || Number(folder.ownerUserId) === Number(authStore.user?.id); }
async function openShareFolder(folder) {
  if (!agencyId.value || !canShareFolder(folder)) return;
  const currentAgencyId = agencyId.value;
  const sequence = ++shareRequestSequence;
  shareFolder.value = folder;
  shareError.value = '';
  shareEmails.value = '';
  shareList.value = [];
  try {
    const shares = await fetchFolderShares(folder.id, currentAgencyId);
    if (sequence !== shareRequestSequence || currentAgencyId !== agencyId.value || shareFolder.value?.id !== folder.id) return;
    shareList.value = shares;
    shareEmails.value = (shareList.value || [])
      .map((s) => s.userEmail)
      .filter(Boolean)
      .join(', ');
  } catch {
    if (sequence === shareRequestSequence && currentAgencyId === agencyId.value) shareList.value = [];
  }
}

async function saveShareFolder() {
  if (!shareFolder.value) return;
  const currentAgencyId = agencyId.value;
  const folder = shareFolder.value;
  const sequence = shareRequestSequence;
  shareSaving.value = true;
  shareError.value = '';
  try {
    const shares = await setFolderShares(folder.id, {
      agencyId: currentAgencyId,
      emails: shareEmails.value,
      permission: 'view'
    });
    if (sequence !== shareRequestSequence || currentAgencyId !== agencyId.value || shareFolder.value?.id !== folder.id) return;
    shareList.value = shares;
    shareFolder.value = null;
    await refresh();
  } catch (e) {
    if (sequence === shareRequestSequence && currentAgencyId === agencyId.value) shareError.value = e?.response?.data?.error?.message || e?.message || 'Could not save sharing';
  } finally {
    if (sequence === shareRequestSequence && currentAgencyId === agencyId.value) shareSaving.value = false;
  }
}

function syncBrowseLocation() {
  const query = { ...route.query, section: activeTab.value === 'files' ? 'resources' : activeTab.value };
  delete query.companyDocument;
  for (const key of ['folder', 'category', 'browse', 'q']) delete query[key];
  if (folderId.value !== undefined) query.folder = String(folderId.value);
  if (activeCategoryId.value) query.category = String(activeCategoryId.value);
  if (showAll.value) query.browse = 'all';
  if (search.value.trim()) query.q = search.value.trim();
  router.push({ path: `${orgPrefix.value}/library`, query, hash: '' });
  refresh();
}
function resetSearch() { clearTimeout(searchTimer); search.value = ''; searchActive.value = false; }
function setTab(id) {
  activeTab.value = id; activeCategoryId.value = null; folderId.value = undefined; detailItem.value = null; typeFilter.value = ''; showAll.value = false;
  resetSearch(); syncBrowseLocation();
}
function selectCategory(c) {
  activeCategoryId.value = c.id; folderId.value = undefined; activeTab.value = 'all'; showAll.value = false;
  resetSearch(); syncBrowseLocation();
}
function selectFolder(id, fromSidebar = false) {
  folderId.value = id; showAll.value = false;
  if (fromSidebar) { activeCategoryId.value = null; activeTab.value = 'all'; }
  resetSearch(); syncBrowseLocation();
}
function goToFolderRoot() { folderId.value = undefined; resetSearch(); syncBrowseLocation(); }
function setBrowseMode(all) { showAll.value = all; if (all) folderId.value = undefined; syncBrowseLocation(); }
function clearFilters() { setTab('all'); }
function backToLibrary() { setTab('all'); }
function runSearch() {
  clearTimeout(searchTimer);
  searchActive.value = !!search.value.trim();
  if (activeTab.value !== 'mine') activeTab.value = 'all';
  syncBrowseLocation();
}

async function openResource(item) {
  if (!agencyId.value) return;
  if (item.guideKey) { router.replace({ path: `${orgPrefix.value}/library`, query: { ...route.query, companyDocument: item.guideKey }, hash: '' }); return; }
  const currentAgencyId = agencyId.value;
  if ((await resourceViewer.value?.prepareToLeave()) === false || currentAgencyId !== agencyId.value) return;
  const sequence = ++viewerRequestSequence;
  try {
    const full = await fetchLibraryResource(item.id, { agencyId: currentAgencyId });
    if (sequence !== viewerRequestSequence || currentAgencyId !== agencyId.value) return;
    viewerResource.value = full;
    if (String(route.params.resourceId || '') !== String(item.id) && orgSlug.value) {
      router
        .replace({
          name: 'OrganizationLibraryResource',
          params: { organizationSlug: orgSlug.value, resourceId: String(item.id) }, query: { ...route.query, companyDocument: undefined }
        })
        .catch(() => {});
    }
  } catch (e) {
    if (sequence === viewerRequestSequence && currentAgencyId === agencyId.value) error.value = e?.response?.data?.error?.message || 'Could not open resource';
  }
}

const resourceViewer = ref(null);
const addResourceModal = ref(null);
async function saveBeforeNavigation() {
  if ((await resourceViewer.value?.prepareToLeave()) === false) return false;
  return addResourceModal.value?.prepareToLeave() ?? true;
}
onBeforeRouteLeave(saveBeforeNavigation);
onBeforeRouteUpdate(saveBeforeNavigation);

function onDocumentSaved(item) { viewerResource.value = { ...viewerResource.value, ...item }; }
async function onDocumentCopied(item) { await openResource(item); await refresh(); }

async function closeViewer() {
  if ((await resourceViewer.value?.prepareToLeave()) === false) return;
  viewerRequestSequence++;
  viewerResource.value = null;
  if (route.name === 'OrganizationLibraryResource' && orgSlug.value) {
    router.replace({ name: 'OrganizationLibrary', params: { organizationSlug: orgSlug.value }, query: { ...route.query } }).catch(() => {});
  }
}

async function toggleFavorite(item) {
  try {
    if (item.isFavorite) await removeLibraryFavorite(item.id, agencyId.value);
    else await addLibraryFavorite(item.id, agencyId.value);
    item.isFavorite = !item.isFavorite;
    if (activeTab.value === 'favorites') resources.value = resources.value.filter(r => r.id !== item.id || item.isFavorite);
    await loadHome();
  } catch { error.value = 'Your favorite could not be saved. Please retry.'; }
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

function openDistribute(item, initialMode = 'personal_copy') {
  distributeInitialMode.value = ['view_only', 'collaborate', 'personal_copy'].includes(initialMode)
    ? initialMode
    : 'personal_copy';
  distributeItem.value = item;
  menuItem.value = null;
}

function onDistributed() {
  // Keep modal open so success message is visible; refresh list underneath
  refresh();
}

async function toggleFeatured(item) {
  try {
    await updateLibraryResource(item.id, { agencyId: agencyId.value, featured: !item.featured });
    menuItem.value = null;
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Update failed';
  }
}

async function archiveItem(item) {
  try {
    await archiveLibraryResource(item.id, agencyId.value);
    menuItem.value = null;
    if (viewerResource.value?.id === item.id) closeViewer();
    await refresh();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Archive failed';
  }
}

async function onCreated(payload = {}) {
  await refresh();
  const item = payload?.item;
  const shareMode = payload?.shareMode;
  if (item?.resourceType === 'branded_doc' || isPdf(item || {})) await openResource(item);
  if (payload?.kind === 'resource' && item && shareMode && canDistribute(item)) {
    openDistribute(item, shareMode);
  }
}

function onDocClick(event) {
  if (!addMenu.value?.contains(event.target)) closeAddMenu();
  menuItem.value = null;
}

watch(() => [route.query.section, route.query.folder, route.query.category, route.query.browse, route.query.q], () => {
  const next = [tabFromSection(route.query.section), positiveId(route.query.folder), positiveId(route.query.category) || null, route.query.browse === 'all', String(route.query.q || '')];
  const current = [activeTab.value, folderId.value, activeCategoryId.value, showAll.value, search.value.trim()];
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  [activeTab.value, folderId.value, activeCategoryId.value, showAll.value, search.value] = next;
  searchActive.value = !!search.value.trim(); refresh();
});
watch([() => route.params.organizationSlug, () => agencyId.value], () => {
  viewerRequestSequence++; shareRequestSequence++; clearTimeout(searchTimer);
  home.value = null; resources.value = []; referenceDocuments.value = []; referenceCanManage.value = false;
  viewerResource.value = null; detailItem.value = null; menuItem.value = null;
  shareFolder.value = null; shareList.value = []; shareEmails.value = ''; shareError.value = ''; shareSaving.value = false;
  showAdd.value = false; distributeItem.value = null; showStatistics.value = false;
  activeCategoryId.value = null; folderId.value = undefined; search.value = ''; searchActive.value = false; typeFilter.value = ''; showAll.value = false;
  loadingMore.value = false; hasMore.value = false;
  refresh();
});
watch([() => route.params.resourceId, () => agencyId.value], async ([id, currentAgencyId]) => {
  const sequence = ++viewerRequestSequence;
  if (!id || !currentAgencyId) { viewerResource.value = null; return; }
  if (String(viewerResource.value?.id) === String(id) && Number(viewerResource.value?.agencyId) === Number(currentAgencyId)) return;
  viewerResource.value = null;
  try {
    const resource = await fetchLibraryResource(id, { agencyId: currentAgencyId });
    if (sequence === viewerRequestSequence && currentAgencyId === agencyId.value) viewerResource.value = resource;
  } catch (e) {
    if (sequence === viewerRequestSequence && currentAgencyId === agencyId.value) {
      error.value = e?.response?.data?.error?.message || 'Could not open resource';
    }
  }
}, { immediate: true });
onMounted(async () => {
  document.addEventListener('click', onDocClick);
  await refresh();
});

onUnmounted(() => {
  requestSequence++; viewerRequestSequence++; shareRequestSequence++; clearTimeout(searchTimer);
  document.removeEventListener('click', onDocClick);
});
</script>

<style scoped>
.document-add-menu{position:relative}.document-add-menu summary{list-style:none}.document-add-menu summary::-webkit-details-marker{display:none}.document-add-options{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:210px;padding:6px;border:1px solid #dce3de;border-radius:10px;background:#fff;box-shadow:0 12px 32px #203c2926}.document-add-options button{display:block;width:100%;border:0;border-radius:6px;background:transparent;text-align:left;padding:12px;font:inherit;font-size:13px;color:#294c3e;cursor:pointer}.document-add-options button:hover,.document-add-options button:focus-visible{background:#edf3ef}

.folder-breadcrumbs{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px;font-size:12px}.folder-breadcrumbs button{font:inherit;border:0;background:none;color:#365c49;cursor:pointer}.folder-breadcrumbs button[aria-current]{font-weight:600}.folder-view-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:18px}.folder-view-controls button{border:1px solid #dbe4dd;background:white;color:#31513f}.folder-view-controls [aria-pressed=true]{background:#244d42;color:white;border-color:#244d42}.folder-view-controls>span{font-size:12px;color:#718077;margin-left:6px}.library-subfolders{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:12px;margin-bottom:24px}.library-subfolders button{display:flex;gap:14px;align-items:center;min-height:88px;border:1px solid #dbe4dd;border-radius:12px;padding:18px;background:linear-gradient(135deg,#f2f6ee,#fff);color:#31513f;font-family:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}.library-subfolders button:hover{border-color:#72927e;background:#eef4ee}.library-subfolders svg{width:32px;height:32px;flex-shrink:0;color:#64876e}.folder-arrow{margin-left:auto;font-size:18px;font-weight:400}

.mobile-navigation-toggle{display:none}

.library-page{--lib-green:#244d42;--lib-green-soft:#edf3ef;color:#25332f;background:#fbfcfb;width:100%;min-height:calc(100dvh - 70px);font-family:var(--font-body,Arial),sans-serif;font-size:14px;padding:0;box-sizing:border-box}.library-page *{box-sizing:border-box}.document-topbar{display:flex;align-items:center;gap:24px;padding:18px 24px;background:white;border-bottom:1px solid #e3e8e5}.document-identity{display:flex;gap:12px;align-items:center;min-width:230px}.document-mark{width:38px;height:42px;border-radius:9px;background:#edf3ef;color:#3c6554;padding:8px}.document-mark svg{width:100%;height:100%}.document-identity h1{margin:0;font-size:19px;font-weight:650;line-height:1.4;color:#1d3029}.document-identity p{margin:2px 0 0;color:#718077;font-size:12px}.beta-label{vertical-align:middle;font-size:10px;font-weight:600;border:1px solid #d7dfd9;border-radius:20px;padding:3px 7px;margin-left:5px;color:#5e7266}.document-search{display:flex;align-items:center;gap:10px;flex:1;max-width:660px;min-width:150px;border:1px solid #e0e5e1;border-radius:9px;padding:0 12px;background:#fcfdfc}.document-search svg{width:18px;flex-shrink:0;color:#65746b}.document-search input{font:inherit;font-size:13px;background:transparent;border:0;padding:12px 0;min-width:0;width:100%;outline:none}.document-search:focus-within{border-color:#648975;box-shadow:0 0 0 3px #eaf2ed}.document-search button{border:0;background:transparent;font-size:22px;color:#64746a;cursor:pointer}.document-actions{display:flex;gap:8px;margin-left:auto}.lib-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;border-radius:8px;min-height:38px;padding:8px 14px;font:inherit;font-size:13px;font-weight:550;text-decoration:none;cursor:pointer;white-space:nowrap}.lib-btn--primary{background:var(--lib-green);border-color:var(--lib-green);color:white}.lib-btn--primary:hover{background:#193e34}.lib-btn--ghost{background:white;border-color:#dce3de;color:#36574a}.lib-btn--ghost:hover{background:#f0f5f1}.lib-btn:disabled{opacity:.5;cursor:default}.lib-btn--sm{min-height:34px;padding:6px 10px;font-size:12px}.document-layout{display:grid;grid-template-columns:216px minmax(0,1fr);min-height:calc(100dvh - 154px)}.document-sidebar{background:#fff;border-right:1px solid #e3e8e5;padding:20px 12px;display:flex;flex-direction:column;gap:5px}.sidebar-home{font-size:12px;color:#65796c;text-decoration:none;margin:0 12px 17px}.document-sidebar nav{display:grid;gap:3px}.document-sidebar nav a,.document-sidebar nav>button,.folder-row>button:first-child{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;min-height:39px;border:0;border-radius:7px;background:transparent;color:#45564d;text-decoration:none;font:inherit;font-size:12px;line-height:1.5;cursor:pointer}.document-sidebar nav>button:hover,.document-sidebar nav a:hover,.folder-row>button:hover{background:#f4f7f4}.document-sidebar [aria-current=page]{background:#eaf1e8!important;color:#254d3a!important;font-weight:650}.nav-symbol{width:18px;font-size:18px;text-align:center;color:#647c6c;flex-shrink:0}.sidebar-heading{display:flex;align-items:center;justify-content:space-between;text-transform:uppercase;letter-spacing:.075em;font-size:10px;font-weight:600;color:#849087;margin:24px 12px 7px}.sidebar-heading button{border:0;background:transparent;font-size:20px;cursor:pointer;color:#57715f}.category-icon{width:24px;height:25px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:var(--cat-bg);color:var(--cat-accent);flex-shrink:0}.category-icon :deep(svg){width:15px;height:15px}.sidebar-hint{font-size:11px;color:#8a948e;padding:0 12px;line-height:1.5}.folder-row{display:flex;align-items:center}.folder-row>button:first-child{min-width:0;flex:1}.folder-row>button:first-child span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.folder-share{border:0;background:transparent;color:#75887c;padding:9px;cursor:pointer;border-radius:7px}.sidebar-footer{border-top:1px solid #e8ece9;margin:28px 10px 0;padding-top:17px}.sidebar-footer a{display:flex;justify-content:space-between;text-decoration:none;color:#587163;font-size:12px}.document-main{padding:25px 28px 48px;min-width:0}.document-section-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.document-section-heading h2{font-size:23px;font-weight:650;margin:0;color:#21352b;line-height:1.4}.document-section-heading p{font-size:13px;color:#78877e;margin:4px 0 0}.heading-tools{display:flex;align-items:center;gap:16px}.heading-tools a{font-size:12px;text-decoration:none;color:#577563}.document-filterbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:15px}.filter-left{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.filter-left label{display:flex;align-items:center;gap:9px;font-size:11px;color:#839087;border:1px solid #e0e6e1;padding:0 10px;background:white;border-radius:7px}.filter-left select{max-width:180px;min-height:35px;background:transparent;font:inherit;font-size:12px;color:#425b4c;border:0;outline:none}.clear-filter{font:inherit;font-size:12px;color:#557564;background:transparent;border:0;cursor:pointer;text-decoration:underline}.library-view-toggle{display:flex;border:1px solid #dfe5df;border-radius:7px;background:white;padding:3px;gap:2px}.library-view-toggle button{border:0;border-radius:5px;background:transparent;padding:6px 8px;color:#6a7c71;cursor:pointer;display:flex}.library-view-toggle svg{width:17px;height:17px}.library-view-toggle [aria-pressed=true]{background:#e9f0e7;color:#284f3b}.document-filter-label{font-size:12px;color:#657c6c}.document-results-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start}.document-results-layout.has-details{grid-template-columns:minmax(0,1fr) 272px}.document-results{min-width:0}.document-result-count{font-size:11px;color:#89958c;margin:0 0 9px 4px}.document-results :deep(.lib-list){border:1px solid #e4e9e5;border-radius:10px;overflow:hidden;background:white}.document-results :deep(.lib-list__head){background:#f6f8f6;font-size:10px;padding:12px 16px;color:#7b8b80}.document-results :deep(.lib-list__row){padding:14px 16px;min-height:68px}.document-results :deep(.lib-list__title){font-size:13px;font-weight:550;color:#293c30}.document-results :deep(.lib-list__cell){font-size:12px}.document-results :deep(.lib-list__by){font-size:10px}.document-results :deep(.lib-card__title){font-size:14px}.document-detail{position:sticky;top:16px;min-width:0;background:white;border:1px solid #e1e7e2;border-radius:10px;padding:18px}.detail-top{display:flex;justify-content:space-between;align-items:flex-start}.detail-file-icon{display:grid;place-items:center;width:64px;height:78px;border:1px solid #d9e2da;border-radius:4px;background:linear-gradient(135deg,#f3f6ef,#e5ede6);font-size:11px;color:#48704f;box-shadow:3px 3px 0 #f0f3ef}.detail-top button{border:0;background:transparent;color:#758679;font-size:22px;cursor:pointer}.document-detail h3{font-size:16px;line-height:1.5;margin:16px 0 7px}.detail-category{font-size:10px;color:#5a775e;background:#edf3e9;border-radius:4px;padding:4px 6px}.document-detail p{font-size:12px;line-height:1.7;color:#76877b;margin:16px 0}.detail-open{width:100%;justify-content:space-between}.document-detail dl{display:grid;grid-template-columns:55px 1fr;gap:14px 12px;font-size:11px;margin:22px 0;color:#657b6b}.document-detail dd{margin:0;color:#3b5746;overflow-wrap:anywhere}.document-detail .detail-tip{border-top:1px solid #e7ece8;padding-top:16px;font-size:11px}.document-empty{border:1px dashed #dce5df;border-radius:10px;background:white;display:flex;align-items:center;flex-direction:column;gap:12px;padding:60px 20px;text-align:center;color:#789080;font-size:13px}.document-empty h3{font-size:16px;color:#3b5a46;margin:0}.document-empty p{margin:0;max-width:380px;line-height:1.7}.empty-document{font-size:38px;color:#94af9a}.document-error{background:#fff3ed;border:1px solid #ecd3c7;border-radius:7px;padding:12px 16px;color:#91513c;font-size:12px;margin-bottom:15px}.document-error button{font:inherit;background:white;border:1px solid #d2a993;border-radius:4px;padding:4px 8px;cursor:pointer}.document-load-more{margin-top:18px}.document-back{margin-bottom:16px}.library-viewer-overlay{position:fixed;inset:0;z-index:90;background:rgba(25,40,32,.4);display:flex;padding:8px}.library-viewer-shell{width:100%;height:calc(100dvh - 16px);min-width:0}.library-menu{position:fixed;z-index:100;background:white;border:1px solid #dfe5e0;border-radius:9px;box-shadow:0 10px 30px #1f39231a;display:flex;flex-direction:column;min-width:160px;padding:5px}.library-menu button{border:0;background:white;text-align:left;padding:10px 14px;cursor:pointer;border-radius:5px;font:inherit;font-size:12px}.library-menu button:hover{background:#eff4ef}.library-menu .is-danger{color:#9e4742}.lib-modal-backdrop{position:fixed;inset:0;z-index:95;background:#14251a70;display:flex;align-items:center;justify-content:center;padding:16px}.lib-share-modal{width:min(460px,100%);background:white;border-radius:12px;padding:24px}.lib-share-modal__head{display:flex;justify-content:space-between;gap:16px}.lib-share-modal h2{font-size:18px;margin:0}.lib-modal__x{border:0;background:transparent;font-size:24px;cursor:pointer}.lib-share-modal__hint{font-size:13px;color:#768477;line-height:1.6}.lib-field{display:grid;gap:8px;font-size:12px}.lib-field textarea{font:inherit;padding:10px;border:1px solid #dbe3db;border-radius:7px;resize:vertical}.lib-share-modal__list{font-size:12px;padding-left:20px;color:#6d7e6e}.lib-share-modal__foot{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.lib-error{color:#a74638;font-size:12px}.library-page :focus-visible{outline:2px solid #588972;outline-offset:3px}.document-search input:focus-visible{outline:0}.library-page button{touch-action:manipulation}
@media(min-width:1700px){.document-layout{grid-template-columns:240px minmax(0,1fr)}.document-main{padding:30px 36px}.document-results-layout.has-details{grid-template-columns:minmax(0,1fr) 310px}}
@media(max-width:1150px){.document-topbar{gap:16px;padding:14px 18px;flex-wrap:wrap}.document-search{order:3;max-width:none;flex-basis:100%}.document-layout{grid-template-columns:190px minmax(0,1fr)}.document-main{padding:22px 20px}.heading-tools a{display:none}.document-results-layout.has-details{grid-template-columns:minmax(0,1fr)}.document-detail{position:fixed;right:16px;top:100px;bottom:16px;width:min(330px,calc(100vw - 32px));overflow:auto;box-shadow:0 12px 60px #17351d26;z-index:80}}
@media(max-width:720px){.document-topbar{padding:14px;gap:12px}.document-identity{min-width:0;flex:1}.document-identity h1{font-size:17px}.document-mark{display:none}.document-actions{gap:6px}.document-actions .lib-btn{font-size:11px;padding:7px 9px;min-height:36px}.document-actions .lib-btn span{display:none}.document-layout{display:block}.document-sidebar{padding:10px 12px;border-right:0;border-bottom:1px solid #e3e8e5;display:block}.sidebar-home,.sidebar-heading,.sidebar-hint,.folder-row,.sidebar-footer,.document-sidebar nav:not(:first-of-type){display:none}.document-sidebar nav:first-of-type{display:flex;overflow-x:auto;gap:4px;padding-bottom:2px}.document-sidebar nav:first-of-type button{width:auto;white-space:nowrap;padding:8px 10px;font-size:11px;min-height:36px}.nav-symbol{display:none}.document-main{padding:20px 12px 36px}.document-section-heading{gap:8px;margin-bottom:18px}.document-section-heading h2{font-size:20px}.document-section-heading p{font-size:12px;max-width:270px}.heading-tools .lib-btn{font-size:10px;padding:4px 7px}.document-filterbar{align-items:flex-start;gap:7px}.filter-left{gap:6px}.filter-left label{padding:0 6px;font-size:10px}.filter-left select{max-width:122px;font-size:11px}.library-view-toggle button{padding:6px}.document-results :deep(.lib-list__row){padding:12px 10px}.document-results :deep(.lib-list__title){white-space:normal;line-height:1.5}.library-viewer-overlay{padding:0}.library-viewer-shell{height:100dvh}.beta-label{font-size:8px;padding:2px 5px;margin-left:2px}}

@media(max-width:720px){.mobile-navigation-toggle{display:block;background:transparent;border:0;color:#617969;font:inherit;font-size:11px;padding:9px 10px;cursor:pointer}.sidebar-expanded .sidebar-heading{display:flex;margin-top:12px}.sidebar-expanded .sidebar-hint,.sidebar-expanded .folder-row,.sidebar-expanded .sidebar-footer{display:flex}.sidebar-expanded nav:not(:first-of-type){display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.sidebar-expanded .sidebar-footer{margin-top:14px;padding-bottom:10px}}
</style>
