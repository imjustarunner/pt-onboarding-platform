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
        <span>Partner line (optional)</span>
        <input
          v-model="form.partnerLine"
          type="text"
          placeholder="e.g. In partnership with Colorado Springs School District 11"
        />
        <span class="muted small">Small uppercase line above the hero — sets community context.</span>
      </label>
      <label class="field">
        <span>Parent intro (optional)</span>
        <textarea
          v-model="form.parentIntro"
          rows="3"
          placeholder="Short mobile-first message: locations, how to find closest site, what to expect."
        />
        <span class="muted small">Shown in the green highlight card. If empty, a sensible default is used.</span>
      </label>
      <div class="field pmp-assets">
        <span>Logo</span>
        <p class="muted small">Shown in the hub header (theme). Upload or paste a URL.</p>
        <div class="pmp-upload-row">
          <input v-model="form.logoUrl" type="text" placeholder="/uploads/… or https://…" class="flex-grow" />
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!!saving || !!uploadingTarget"
            @click="triggerLogoUpload"
          >
            {{ uploadingTarget === 'logo' ? '…' : 'Upload' }}
          </button>
          <input
            ref="logoFileInput"
            type="file"
            accept="image/*"
            class="pmp-hidden-file"
            tabindex="-1"
            aria-hidden="true"
            @change="onUploadLogo"
          />
        </div>
        <div v-if="form.logoUrl" class="pmp-thumb"><img :src="form.logoUrl" alt="Logo preview" /></div>
      </div>

      <div class="field pmp-assets">
        <span>Hero image</span>
        <p class="muted small">Banner at the top of <code>/p/{{ form.slug || 'slug' }}</code>.</p>
        <div class="pmp-upload-row">
          <input v-model="form.heroImageUrl" type="text" placeholder="https://… or upload" class="flex-grow" />
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!!saving || !!uploadingTarget"
            @click="triggerHeroUpload"
          >
            {{ uploadingTarget === 'hero' ? '…' : 'Upload' }}
          </button>
          <input
            ref="heroFileInput"
            type="file"
            accept="image/*"
            class="pmp-hidden-file"
            tabindex="-1"
            aria-hidden="true"
            @change="onUploadHero"
          />
        </div>
        <div v-if="form.heroImageUrl" class="pmp-thumb pmp-thumb-wide"><img :src="form.heroImageUrl" alt="Hero preview" /></div>
      </div>

      <div class="field">
        <span>Photo gallery</span>
        <p class="muted small">Optional grid of images below the hero. Upload one or more images (append to the list).</p>
        <div class="pmp-upload-row">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!!saving || !!uploadingTarget" @click="triggerGalleryUpload">
            {{ uploadingTarget === 'gallery' ? '…' : 'Upload images' }}
          </button>
          <input
            ref="galleryFileInput"
            type="file"
            accept="image/*"
            multiple
            class="pmp-hidden-file"
            tabindex="-1"
            aria-hidden="true"
            @change="onUploadGallery"
          />
        </div>
        <ul class="pmp-gallery-list">
          <li v-for="(url, gi) in galleryUrls" :key="`g-${gi}`" class="pmp-gallery-item">
            <input v-model="galleryUrls[gi]" type="text" class="mono" placeholder="Image URL" />
            <button type="button" class="btn btn-danger btn-sm" @click="removeGallery(gi)">Remove</button>
          </li>
        </ul>
        <button type="button" class="btn btn-secondary btn-sm" @click="galleryUrls.push('')">Add URL row</button>
      </div>

      <div class="field">
        <span>Primary navigation</span>
        <p class="muted small">
          Top links on the hub. Use internal paths like <code>/p/{{ form.slug || 'your-slug' }}/faq</code> for subpages, or
          <code>https://…</code> for external sites.
        </p>
        <div v-for="(row, ni) in navRows" :key="`nav-${ni}`" class="pmp-row-grid">
          <input v-model="row.label" type="text" placeholder="Label" />
          <input v-model="row.href" type="text" placeholder="URL or path" class="mono" />
          <button type="button" class="btn btn-danger btn-sm" @click="removeNav(ni)">×</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="navRows.push({ label: '', href: '' })">Add link</button>
      </div>

      <div class="field">
        <span>Subpages (markdown)</span>
        <p class="muted small">
          Each entry becomes <code>/p/{{ form.slug || 'slug' }}/:slug</code> with the body rendered as Markdown (great for FAQ,
          policies, extra info).
        </p>
        <div v-for="(pg, pi) in contentPages" :key="`cp-${pi}`" class="pmp-subpage-card">
          <div class="pmp-subpage-meta">
            <label class="pmp-inline"
              >URL slug <input v-model="pg.slug" type="text" placeholder="faq" class="mono"
            /></label>
            <label class="pmp-inline"
              >Page title <input v-model="pg.title" type="text" placeholder="Frequently asked questions"
            /></label>
          </div>
          <label class="pmp-inline full"
            >Body (Markdown)
            <textarea v-model="pg.body" rows="6" class="mono" placeholder="## Heading&#10;&#10;Your content…" />
          </label>
          <button type="button" class="btn btn-danger btn-sm" @click="removeContentPage(pi)">Remove page</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="contentPages.push({ slug: '', title: '', body: '' })">
          Add subpage
        </button>
      </div>

      <label class="field">
        <span>Metrics profile (optional, public)</span>
        <input v-model="form.metricsProfile" type="text" placeholder="hub_sources_summary or plottwistco_summary" />
      </label>
      <label class="field">
        <span>Advanced branding (JSON)</span>
        <p class="muted small">
          Merged with logo / gallery / nav / subpages above on save. Optional hub blocks:
          <code>programThemePrimary</code> (hex accent),
          <code>ctaSection</code> (object to override copy, or <code>false</code> to hide the Medicaid / eligibility band),
          <code>processSection</code> (object with <code>title</code> / <code>steps</code> array, or <code>false</code> to hide),
          <code>whatWeOfferSection</code> (object: <code>title</code>, <code>summary</code>, <code>intro</code>, <code>expandLabel</code>, <code>collapseLabel</code>, <code>items</code> array of <code>{ title, body, imageUrl }</code>, or <code>false</code> to hide the collapsible block).
        </p>
        <textarea v-model="form.brandingJsonText" rows="6" class="mono" placeholder='{"programThemePrimary":"#a32623"}' />
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

const uploadingTarget = ref('');
const logoFileInput = ref(null);
const heroFileInput = ref(null);
const galleryFileInput = ref(null);

function triggerLogoUpload() {
  logoFileInput.value?.click();
}

function triggerHeroUpload() {
  heroFileInput.value?.click();
}

/** Structured hub branding (merged into brandingJson on save). */
const form = ref({
  slug: '',
  title: '',
  isActive: true,
  pageType: 'event_hub',
  heroTitle: '',
  heroSubtitle: '',
  heroImageUrl: '',
  logoUrl: '',
  partnerLine: '',
  parentIntro: '',
  metricsProfile: '',
  brandingJsonText: '{}',
  sources: []
});

const galleryUrls = ref([]);
const navRows = ref([{ label: '', href: '' }]);
const contentPages = ref([{ slug: '', title: '', body: '' }]);

function slugifySegment(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mergeBrandingPayload() {
  let advanced = {};
  try {
    advanced = JSON.parse(form.value.brandingJsonText || '{}');
    if (!advanced || typeof advanced !== 'object' || Array.isArray(advanced)) advanced = {};
  } catch {
    advanced = {};
  }
  const out = { ...advanced };
  const logo = String(form.value.logoUrl || '').trim();
  if (logo) out.logoUrl = logo;
  else delete out.logoUrl;

  const gal = galleryUrls.value.map((u) => String(u || '').trim()).filter(Boolean);
  if (gal.length) out.gallery = gal;
  else delete out.gallery;

  const nav = navRows.value
    .map((r) => ({ label: String(r.label || '').trim(), href: String(r.href || '').trim() }))
    .filter((r) => r.label && r.href);
  if (nav.length) out.primaryNav = nav;
  else delete out.primaryNav;

  const subs = contentPages.value
    .map((p) => ({
      slug: slugifySegment(p.slug),
      title: String(p.title || '').trim(),
      body: String(p.body || '')
    }))
    .filter((p) => p.slug && p.title);
  if (subs.length) out.contentPages = subs;
  else delete out.contentPages;

  const pl = String(form.value.partnerLine || '').trim();
  if (pl) out.partnerLine = pl;
  else delete out.partnerLine;

  const pint = String(form.value.parentIntro || '').trim();
  if (pint) out.parentIntro = pint;
  else delete out.parentIntro;

  return out;
}

function hydrateStructuredFromBranding(b) {
  const branding = b && typeof b === 'object' ? b : {};
  form.value.partnerLine = String(branding.partnerLine || '').trim();
  form.value.parentIntro = String(branding.parentIntro || '').trim();
  form.value.logoUrl = String(branding.logoUrl || '').trim();
  galleryUrls.value = Array.isArray(branding.gallery) ? branding.gallery.map((u) => String(u || '').trim()) : [];
  if (!galleryUrls.value.length) galleryUrls.value = [''];

  const nav = Array.isArray(branding.primaryNav) ? branding.primaryNav : [];
  navRows.value = nav.length
    ? nav.map((r) => ({ label: String(r.label || ''), href: String(r.href || '') }))
    : [{ label: '', href: '' }];

  const cp = Array.isArray(branding.contentPages) ? branding.contentPages : [];
  contentPages.value = cp.length
    ? cp.map((p) => ({ slug: String(p.slug || ''), title: String(p.title || ''), body: String(p.body || '') }))
    : [{ slug: '', title: '', body: '' }];
}

async function postMarketingUpload(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post('/platform/public-marketing-pages/upload', fd, { skipGlobalLoading: true });
  const url = res.data?.url;
  if (!url) throw new Error('Upload did not return a URL');
  return String(url).trim();
}

async function onUploadLogo(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  uploadingTarget.value = 'logo';
  try {
    form.value.logoUrl = await postMarketingUpload(f);
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

async function onUploadHero(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  uploadingTarget.value = 'hero';
  try {
    form.value.heroImageUrl = await postMarketingUpload(f);
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

function triggerGalleryUpload() {
  galleryFileInput.value?.click();
}

async function onUploadGallery(e) {
  const input = e.target;
  const files = input.files ? Array.from(input.files) : [];
  input.value = '';
  if (!files.length) return;
  uploadingTarget.value = 'gallery';
  const cleaned = galleryUrls.value.map((u) => String(u || '').trim()).filter(Boolean);
  try {
    for (const f of files) {
      const url = await postMarketingUpload(f);
      cleaned.push(url);
    }
    galleryUrls.value = cleaned.length ? cleaned : [''];
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

function removeGallery(idx) {
  galleryUrls.value.splice(idx, 1);
  if (!galleryUrls.value.length) galleryUrls.value = [''];
}

function removeNav(idx) {
  navRows.value.splice(idx, 1);
  if (!navRows.value.length) navRows.value = [{ label: '', href: '' }];
}

function removeContentPage(idx) {
  contentPages.value.splice(idx, 1);
  if (!contentPages.value.length) contentPages.value = [{ slug: '', title: '', body: '' }];
}

function resetForm() {
  form.value = {
    slug: '',
    title: '',
    isActive: true,
    pageType: 'event_hub',
    heroTitle: '',
    heroSubtitle: '',
    heroImageUrl: '',
    logoUrl: '',
    partnerLine: '',
    parentIntro: '',
    metricsProfile: '',
    brandingJsonText: '{}',
    sources: []
  };
  galleryUrls.value = [''];
  navRows.value = [{ label: '', href: '' }];
  contentPages.value = [{ slug: '', title: '', body: '' }];
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
  const b = p.brandingJson || {};
  const advanced = { ...b };
  delete advanced.logoUrl;
  delete advanced.gallery;
  delete advanced.primaryNav;
  delete advanced.contentPages;
  delete advanced.partnerLine;
  delete advanced.parentIntro;
  form.value = {
    slug: p.slug,
    title: p.title || '',
    isActive: !!p.isActive,
    pageType: p.pageType || 'event_hub',
    heroTitle: p.heroTitle || '',
    heroSubtitle: p.heroSubtitle || '',
    heroImageUrl: p.heroImageUrl || '',
    logoUrl: '',
    partnerLine: '',
    parentIntro: '',
    metricsProfile: p.metricsProfile || '',
    brandingJsonText: JSON.stringify(advanced, null, 2),
    sources: (p.sources || []).map((s) => ({
      sourceType: s.sourceType || 'agency',
      sourceId: Number(s.sourceId),
      sortOrder: Number(s.sortOrder) || 0,
      isActive: s.isActive !== false
    }))
  };
  hydrateStructuredFromBranding(b);
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
  const brandingJson = mergeBrandingPayload();

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
.sr-only {
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
.pmp-assets .pmp-upload-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.pmp-assets .flex-grow {
  flex: 1;
  min-width: 180px;
}
/* Hidden but in DOM — not display:none so programmatic .click() opens the file picker reliably. */
.pmp-hidden-file {
  position: fixed;
  left: 0;
  top: 0;
  width: 0.01px;
  height: 0.01px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
.pmp-thumb {
  margin-top: 10px;
  max-width: 160px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  background: #f8fafc;
}
.pmp-thumb-wide {
  max-width: 420px;
}
.pmp-thumb img {
  width: 100%;
  display: block;
  vertical-align: middle;
}
.pmp-gallery-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
}
.pmp-gallery-item {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.pmp-gallery-item input {
  flex: 1;
  min-width: 0;
}
.pmp-row-grid {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.pmp-subpage-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.pmp-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}
.pmp-inline.full {
  grid-column: 1 / -1;
}
.pmp-span-2 {
  grid-column: span 2;
}
.pmp-subpage-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  background: #f8fafc;
}
</style>
