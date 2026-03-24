<template>
  <div class="pmp-admin container" style="max-width: 960px; margin: 0 auto; padding: 24px 16px 64px">
    <header class="pmp-head">
      <h1>Public marketing pages</h1>
      <p class="muted">
        Multi-agency public event hubs at <code>/p/:slug</code>. Sources use each agency’s Skill Builders program events
        (same rules as single-agency public listings).
      </p>
    </header>

    <div v-if="loadError" class="error-banner">{{ loadError }}</div>

    <div class="pmp-actions">
      <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="startCreate">New page</button>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadPages">Reload</button>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <ul v-else class="pmp-list">
      <li v-for="p in pages" :key="p.id" class="pmp-row">
        <div>
          <strong>/p/{{ p.slug }}</strong>
          <span v-if="!p.isActive" class="badge badge-warning">inactive</span>
          <div class="muted small">{{ p.title }}</div>
        </div>
        <div class="pmp-row-actions">
          <a class="linkish" :href="`/p/${p.slug}`" target="_blank" rel="noopener noreferrer">Open</a>
          <button type="button" class="btn btn-secondary btn-sm" @click="edit(p)">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" @click="removePage(p)">Delete</button>
        </div>
      </li>
    </ul>

    <div v-if="editorOpen" class="pmp-editor card">
      <h2>{{ editingId ? `Edit page #${editingId}` : 'New page' }}</h2>

      <label class="field">
        <span>Slug (URL: /p/slug)</span>
        <input v-model="form.slug" type="text" placeholder="d11-summer-2025" :disabled="!!editingId" />
      </label>
      <label class="field">
        <span>Title</span>
        <input v-model="form.title" type="text" />
      </label>
      <label class="field inline">
        <input v-model="form.isActive" type="checkbox" />
        <span>Active</span>
      </label>
      <label class="field">
        <span>Page type</span>
        <select v-model="form.pageType">
          <option value="event_hub">event_hub</option>
          <option value="provider_booking">provider_booking</option>
        </select>
      </label>
      <label class="field">
        <span>Hero title (optional)</span>
        <input v-model="form.heroTitle" type="text" />
      </label>
      <label class="field">
        <span>Hero subtitle</span>
        <textarea v-model="form.heroSubtitle" rows="2" />
      </label>
      <label class="field">
        <span>Hero image URL</span>
        <input v-model="form.heroImageUrl" type="text" placeholder="https://..." />
      </label>
      <label class="field">
        <span>Metrics profile (optional, public)</span>
        <input v-model="form.metricsProfile" type="text" placeholder="hub_sources_summary or plottwistco_summary" />
      </label>
      <label class="field">
        <span>Branding JSON</span>
        <textarea v-model="form.brandingJsonText" rows="6" class="mono" placeholder='{"colorPalette":{"primary":"#4f46e5"}}' />
      </label>

      <div class="field">
        <span>Sources (agency IDs — parent agencies with Skill Builders program)</span>
        <div class="pmp-source-pick">
          <select v-model="pickSourceType" class="filters-input">
            <option value="agency">Agency (Skill Builders program under that agency)</option>
            <option value="organization">Program organization id (merge all events with that organization_id)</option>
          </select>
          <select v-model="pickAgencyId" class="filters-input">
            <option :value="null">Select…</option>
            <option v-for="a in agencyOptions" :key="a.id" :value="a.id">{{ a.name }} ({{ a.id }})</option>
          </select>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!pickAgencyId" @click="addSource">Add</button>
        </div>
        <ul class="pmp-sources">
          <li v-for="(s, idx) in form.sources" :key="`${s.sourceId}-${idx}`">
            {{ sourceLabel(s) }}
            <button type="button" class="linkish" @click="removeSource(idx)">Remove</button>
          </li>
        </ul>
      </div>

      <p v-if="saveError" class="error-banner">{{ saveError }}</p>
      <div class="pmp-save-row">
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="btn btn-secondary" :disabled="saving" @click="cancelEdit">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const pages = ref([]);
const agencyOptions = ref([]);
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveError = ref('');
const editorOpen = ref(false);
const editingId = ref(null);
const pickAgencyId = ref(null);
const pickSourceType = ref('agency');

const form = ref({
  slug: '',
  title: '',
  isActive: true,
  pageType: 'event_hub',
  heroTitle: '',
  heroSubtitle: '',
  heroImageUrl: '',
  metricsProfile: '',
  brandingJsonText: '{}',
  sources: []
});

function resetForm() {
  form.value = {
    slug: '',
    title: '',
    isActive: true,
    pageType: 'event_hub',
    heroTitle: '',
    heroSubtitle: '',
    heroImageUrl: '',
    metricsProfile: '',
    brandingJsonText: '{}',
    sources: []
  };
  pickAgencyId.value = null;
  pickSourceType.value = 'agency';
}

async function loadAgencies() {
  try {
    const res = await api.get('/agencies', { skipGlobalLoading: true });
    const raw = Array.isArray(res.data) ? res.data : res.data?.agencies || [];
    agencyOptions.value = raw
      .map((a) => ({
        id: Number(a.id),
        name: `${String(a.name || '').trim() || `Org ${a.id}`} (${String(a.organization_type || 'agency')})`
      }))
      .filter((a) => a.id > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    agencyOptions.value = [];
  }
}

async function loadPages() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get('/platform/public-marketing-pages', { skipGlobalLoading: true });
    pages.value = Array.isArray(res.data?.pages) ? res.data.pages : [];
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    pages.value = [];
  } finally {
    loading.value = false;
  }
}

function startCreate() {
  editingId.value = null;
  resetForm();
  editorOpen.value = true;
  saveError.value = '';
}

function edit(p) {
  editingId.value = p.id;
  form.value = {
    slug: p.slug,
    title: p.title || '',
    isActive: !!p.isActive,
    pageType: p.pageType || 'event_hub',
    heroTitle: p.heroTitle || '',
    heroSubtitle: p.heroSubtitle || '',
    heroImageUrl: p.heroImageUrl || '',
    metricsProfile: p.metricsProfile || '',
    brandingJsonText: JSON.stringify(p.brandingJson || {}, null, 2),
    sources: (p.sources || []).map((s) => ({
      sourceType: s.sourceType || 'agency',
      sourceId: Number(s.sourceId),
      sortOrder: Number(s.sortOrder) || 0,
      isActive: s.isActive !== false
    }))
  };
  editorOpen.value = true;
  saveError.value = '';
}

function cancelEdit() {
  editorOpen.value = false;
  editingId.value = null;
  saveError.value = '';
}

function addSource() {
  const id = Number(pickAgencyId.value);
  if (!id) return;
  const st = pickSourceType.value === 'organization' ? 'organization' : 'agency';
  if (form.value.sources.some((s) => s.sourceType === st && Number(s.sourceId) === id)) return;
  form.value.sources.push({ sourceType: st, sourceId: id, sortOrder: form.value.sources.length, isActive: true });
  pickAgencyId.value = null;
}

function removeSource(idx) {
  form.value.sources.splice(idx, 1);
}

function sourceLabel(s) {
  const id = Number(s.sourceId);
  const a = agencyOptions.value.find((x) => x.id === id);
  return `${s.sourceType} ${id}${a ? ` — ${a.name}` : ''}`;
}

async function save() {
  saveError.value = '';
  let brandingJson = {};
  try {
    brandingJson = JSON.parse(form.value.brandingJsonText || '{}');
  } catch {
    saveError.value = 'Branding JSON is invalid.';
    return;
  }
  const payload = {
    slug: form.value.slug.trim().toLowerCase(),
    title: form.value.title.trim(),
    isActive: form.value.isActive,
    pageType: form.value.pageType,
    heroTitle: form.value.heroTitle || null,
    heroSubtitle: form.value.heroSubtitle || null,
    heroImageUrl: form.value.heroImageUrl || null,
    metricsProfile: form.value.metricsProfile?.trim() || null,
    brandingJson,
    sources: form.value.sources
  };
  saving.value = true;
  try {
    if (editingId.value) {
      await api.put(`/platform/public-marketing-pages/${editingId.value}`, payload, { skipGlobalLoading: true });
    } else {
      await api.post('/platform/public-marketing-pages', payload, { skipGlobalLoading: true });
    }
    editorOpen.value = false;
    editingId.value = null;
    await loadPages();
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function removePage(p) {
  if (!window.confirm(`Delete public page /p/${p.slug}?`)) return;
  try {
    await api.delete(`/platform/public-marketing-pages/${p.id}`, { skipGlobalLoading: true });
    await loadPages();
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Delete failed';
  }
}

onMounted(async () => {
  await Promise.all([loadAgencies(), loadPages()]);
});
</script>

<style scoped>
.pmp-head h1 {
  margin: 0 0 8px;
}
.muted {
  color: #64748b;
}
.small {
  font-size: 0.85rem;
}
.pmp-actions {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}
.pmp-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
}
.pmp-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #e2e8f0;
}
.pmp-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.pmp-editor {
  padding: 20px;
  margin-top: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
.pmp-source-pick {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.pmp-sources {
  margin: 8px 0 0;
  padding-left: 1.2rem;
}
.pmp-save-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.error-banner {
  background: #fef2f2;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0;
}
.linkish {
  background: none;
  border: none;
  padding: 0;
  color: #4f46e5;
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}
.card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
</style>
