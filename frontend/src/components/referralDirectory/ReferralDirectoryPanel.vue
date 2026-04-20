<template>
  <section class="rd-panel" :class="{ 'is-embedded': embedded }">
    <header class="rd-head">
      <div class="rd-head-main">
        <h2 v-if="!embedded" class="rd-title">Referral Directory</h2>
        <p class="rd-sub">
          External providers and resources your team refers families to. Categories are editable by admins.
        </p>
      </div>
      <div class="rd-head-actions">
        <button
          v-if="isAdmin"
          type="button"
          class="btn btn-ghost"
          @click="openQueue"
        >
          Pending
          <span v-if="pendingCount > 0" class="rd-pill">{{ pendingCount }}</span>
        </button>
        <button type="button" class="btn btn-primary" @click="openCreate">
          {{ isAdmin ? '+ Add referral' : '+ Propose new' }}
        </button>
      </div>
    </header>

    <div class="rd-filters">
      <input
        v-model="search"
        type="search"
        placeholder="Search name, organization, specialty…"
        class="rd-search"
      />
      <select v-model.number="filterCategoryId" class="rd-select">
        <option :value="0">All categories</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <div v-if="loading && !entries.length" class="rd-state">Loading…</div>
    <div v-else-if="filteredEntries.length === 0" class="rd-state">
      No referral entries yet. {{ isAdmin ? 'Add one to get started.' : 'Propose one to get started.' }}
    </div>

    <ul v-else class="rd-list">
      <li v-for="entry in filteredEntries" :key="entry.id" class="rd-item">
        <div class="rd-item-head">
          <div class="rd-item-title">
            <strong>{{ entry.name }}</strong>
            <span v-if="entry.category_name" class="rd-chip">{{ entry.category_name }}</span>
            <span v-if="Number(entry.pending_change_requests_count) > 0" class="rd-chip is-warn">
              Edit pending review
            </span>
          </div>
          <div class="rd-item-actions">
            <button type="button" class="btn btn-ghost" @click="openEdit(entry)">
              {{ isAdmin ? 'Edit' : 'Propose edit' }}
            </button>
            <button type="button" class="btn btn-danger-ghost" @click="handleDelete(entry)">
              {{ isAdmin ? 'Delete' : 'Propose delete' }}
            </button>
          </div>
        </div>
        <div v-if="entry.organization_name" class="rd-line">{{ entry.organization_name }}</div>
        <div class="rd-kv-row">
          <span v-if="entry.phone">📞 <a :href="`tel:${entry.phone}`">{{ entry.phone }}</a></span>
          <span v-if="entry.email">✉ <a :href="`mailto:${entry.email}`">{{ entry.email }}</a></span>
          <span v-if="entry.website">🌐 <a :href="entry.website" target="_blank" rel="noopener">{{ entry.website }}</a></span>
        </div>
        <div v-if="entry.address" class="rd-line muted">📍 {{ entry.address }}</div>
        <div v-if="entry.specialties" class="rd-block">
          <span class="rd-kicker">Specialties</span>
          <div>{{ entry.specialties }}</div>
        </div>
        <div v-if="entry.insurances_accepted" class="rd-block">
          <span class="rd-kicker">Insurances</span>
          <div>{{ entry.insurances_accepted }}</div>
        </div>
        <div v-if="entry.notes" class="rd-block">
          <span class="rd-kicker">Notes</span>
          <div>{{ entry.notes }}</div>
        </div>
      </li>
    </ul>

    <ReferralDirectoryEntryEditor
      :open="editorOpen"
      :mode="editorMode"
      :entry="editorEntry"
      :categories="categories"
      :agency-id="resolvedAgencyId"
      :is-admin="isAdmin"
      @close="editorOpen = false"
      @saved="handleSaved"
      @categories-changed="loadCategories"
    />

    <ReferralDirectoryAdminQueue
      v-if="isAdmin"
      :open="queueOpen"
      :agency-id="resolvedAgencyId"
      @close="queueOpen = false"
      @reviewed="handleReviewed"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import ReferralDirectoryEntryEditor from './ReferralDirectoryEntryEditor.vue';
import ReferralDirectoryAdminQueue from './ReferralDirectoryAdminQueue.vue';

const props = defineProps({
  embedded: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null }
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const categories = ref([]);
const entries = ref([]);
const loading = ref(false);
const search = ref('');
const filterCategoryId = ref(0);

const editorOpen = ref(false);
const editorMode = ref('create');
const editorEntry = ref(null);

const queueOpen = ref(false);
const pendingCount = ref(0);

const ADMIN_ROLES = new Set(['super_admin', 'admin']);
const isAdmin = computed(() => ADMIN_ROLES.has(String(authStore.user?.role || '').toLowerCase()));

const resolvedAgencyId = computed(() => {
  const fromProp = Number(props.agencyId);
  if (fromProp && Number.isFinite(fromProp)) return fromProp;
  const fromStore = Number(agencyStore.currentAgency?.id);
  if (fromStore && Number.isFinite(fromStore)) return fromStore;
  const fromUser = Number(authStore.user?.agencyId);
  if (fromUser && Number.isFinite(fromUser)) return fromUser;
  return null;
});

const filteredEntries = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return entries.value.filter((e) => {
    if (filterCategoryId.value && Number(e.category_id) !== Number(filterCategoryId.value)) return false;
    if (!needle) return true;
    const blob = [
      e.name, e.organization_name, e.phone, e.email, e.address,
      e.specialties, e.insurances_accepted, e.notes, e.category_name
    ].filter(Boolean).join(' ').toLowerCase();
    return blob.includes(needle);
  });
});

let searchDebounce = null;
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadEntries(), 250);
});

watch(resolvedAgencyId, () => { refreshAll(); });

async function loadCategories() {
  try {
    const params = resolvedAgencyId.value ? { agencyId: resolvedAgencyId.value } : {};
    const resp = await api.get('/referral-directory/categories', { params });
    categories.value = resp.data?.categories || [];
  } catch (e) {
    console.warn('[ReferralDirectoryPanel] loadCategories failed', e?.message);
  }
}

async function loadEntries() {
  if (!resolvedAgencyId.value) return;
  loading.value = true;
  try {
    const params = { agencyId: resolvedAgencyId.value };
    if (search.value.trim()) params.search = search.value.trim();
    const resp = await api.get('/referral-directory/entries', { params });
    entries.value = resp.data?.entries || [];
  } catch (e) {
    console.warn('[ReferralDirectoryPanel] loadEntries failed', e?.message);
  } finally {
    loading.value = false;
  }
}

async function loadPendingCount() {
  if (!isAdmin.value || !resolvedAgencyId.value) { pendingCount.value = 0; return; }
  try {
    const resp = await api.get('/referral-directory/change-requests/pending-count', {
      params: { agencyId: resolvedAgencyId.value }
    });
    pendingCount.value = Number(resp.data?.count || 0);
  } catch {
    pendingCount.value = 0;
  }
}

async function refreshAll() {
  await Promise.all([loadCategories(), loadEntries(), loadPendingCount()]);
}

function openCreate() {
  editorMode.value = 'create';
  editorEntry.value = null;
  editorOpen.value = true;
}

function openEdit(entry) {
  editorMode.value = 'edit';
  editorEntry.value = entry;
  editorOpen.value = true;
}

function openQueue() {
  queueOpen.value = true;
}

async function handleDelete(entry) {
  const msg = isAdmin.value
    ? `Remove "${entry.name}" from the directory?`
    : `Propose deleting "${entry.name}"? An admin will review your request.`;
  if (!window.confirm(msg)) return;
  try {
    await api.delete(`/referral-directory/entries/${entry.id}`, {
      params: { agencyId: resolvedAgencyId.value }
    });
    await Promise.all([loadEntries(), loadPendingCount()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to delete entry');
  }
}

function handleSaved({ pendingReview }) {
  if (pendingReview) {
    alert('Thanks — your change was submitted for admin review.');
    loadPendingCount();
  } else {
    loadEntries();
  }
}

function handleReviewed() {
  loadEntries();
  loadPendingCount();
}

onMounted(() => {
  refreshAll();
});

defineExpose({ refresh: refreshAll });
</script>

<style scoped>
.rd-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: var(--card-bg, #fff);
  color: var(--text, inherit);
  border-radius: 10px;
  border: 1px solid var(--border, #e5e7eb);
}
.rd-panel.is-embedded { border: none; padding: 0; background: transparent; }
.rd-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.rd-title { margin: 0 0 4px; font-size: 18px; }
.rd-sub { margin: 0; font-size: 13px; color: var(--muted, #6b7280); max-width: 640px; }
.rd-head-actions { display: flex; gap: 8px; align-items: center; }
.rd-pill {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f59e0b;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.rd-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.rd-search {
  flex: 1;
  min-width: 200px;
  padding: 8px 10px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
}
.rd-select {
  padding: 8px 10px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
}
.rd-state { padding: 20px; text-align: center; color: var(--muted, #6b7280); }
.rd-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.rd-item {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--card-bg-alt, #fff);
}
.rd-item-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.rd-item-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rd-item-actions { display: flex; gap: 6px; }
.rd-chip {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  background: #eef2ff; color: #3730a3; font-size: 11px; font-weight: 600;
}
.rd-chip.is-warn { background: #fef3c7; color: #92400e; }
.rd-line { font-size: 14px; }
.rd-line.muted { color: var(--muted, #6b7280); }
.rd-kv-row { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--muted, #6b7280); }
.rd-kv-row a { color: inherit; text-decoration: none; }
.rd-kv-row a:hover { text-decoration: underline; }
.rd-block { font-size: 13px; }
.rd-kicker { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted, #6b7280); }
.btn {
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn-primary { background: var(--primary, #2563eb); color: #fff; }
.btn-primary:hover { filter: brightness(1.05); }
.btn-ghost { background: transparent; color: inherit; border-color: var(--border, #d1d5db); }
.btn-danger-ghost { background: transparent; color: #b91c1c; border-color: #fecaca; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
