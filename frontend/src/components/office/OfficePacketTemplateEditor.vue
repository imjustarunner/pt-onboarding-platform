<template>
  <div class="packet-editor">
    <div class="packet-editor-header">
      <div>
        <h2 style="margin:0;">{{ title }}</h2>
        <div class="muted" style="margin-top:4px;">
          Printable office packet for this audience only. Disclosure, informed consent,
          policy and services, and HIPAA are included. Merge tokens
          <code>{{ tokenAgencyName }}</code>,
          <code>{{ tokenAgencyAddress }}</code>, and
          <code>{{ tokenDisclosure }}</code>
          fill automatically when the PDF is generated. Saving here does not change the other packet.
        </div>
        <div class="locale-tabs" role="tablist" aria-label="Packet language">
          <button type="button" role="tab" class="locale-tab" :class="{ active: locale === 'en' }" :disabled="loading || saving" @click="switchLocale('en')">English</button>
          <button type="button" role="tab" class="locale-tab" :class="{ active: locale === 'es' }" :disabled="loading || saving" @click="switchLocale('es')">Español</button>
        </div>
      </div>
      <div class="packet-editor-actions">
        <span class="version-pill">{{ localeLabel }} · V{{ version || '—' }}</span>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading || saving || downloading" @click="downloadPdf">
          {{ downloading ? 'Preparing…' : 'Download PDF' }}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading || saving" @click="toggleHistory">
          {{ showHistory ? 'Hide history' : 'Version history' }}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading || saving" @click="useOfficeDefault">
          Use office default
        </button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="loading || saving || !dirty" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <div v-if="looksLikeSchoolSeed" class="school-seed-note">
      This copy still looks like the old school-cloned packet. Use office default to load
      disclosure, informed consent, policy and services, and HIPAA for this audience only.
    </div>

    <div v-if="!loading && packetBrand && !packetBrand.useItscoChrome" class="packet-brand-panel">
      <h3 style="margin:0 0 6px;">Packet chrome (non-ITSCO)</h3>
      <p class="muted" style="margin:0 0 10px;">
        Upload cover, header logo, footer logo, and optional header banner. Body text uses Montserrat;
        version and page numbers stay Impact. ITSCO tenants keep the platform brand assets.
      </p>
      <div class="packet-brand-grid">
        <label v-for="slot in brandSlots" :key="slot.key" class="packet-brand-slot">
          <span>{{ slot.label }}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="brandUploading" @change="onBrandFile(slot.key, $event)" />
          <span v-if="brandPath(slot.key)" class="muted brand-path">{{ brandPath(slot.key) }}</span>
        </label>
      </div>
      <div class="packet-brand-version">
        <label>
          Printed version label
          <input v-model="brandVersionLabel" type="text" maxlength="32" placeholder="1.0" />
        </label>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="brandUploading" @click="saveBrandVersion">
          Save version label
        </button>
      </div>
      <div v-if="brandMessage" class="muted" style="margin-top:8px;">{{ brandMessage }}</div>
    </div>
    <div v-else-if="!loading && packetBrand?.useItscoChrome" class="packet-brand-panel itsco-note">
      <p class="muted" style="margin:0;">
        This agency uses ITSCO packet chrome (Comfortaa cover, logos, Impact footer). Platform brand assets are unchanged.
      </p>
    </div>

    <div v-if="error" class="error" style="margin-top:10px;">{{ error }}</div>
    <div v-if="success" class="success" style="margin-top:10px;">{{ success }}</div>
    <div v-if="loading" class="loading" style="margin-top:10px;">Loading template…</div>

    <div v-else-if="showHistory" class="version-history">
      <div v-if="historyLoading" class="muted">Loading versions…</div>
      <div v-else-if="!versions.length" class="muted">No archived versions yet. Save the template to create V1.</div>
      <ul v-else class="version-list">
        <li v-for="v in versions" :key="v.id || v.version" class="version-row">
          <div>
            <strong>V{{ v.version }}</strong>
            <span class="muted" style="margin-left:8px;">{{ formatWhen(v.created_at) }}</span>
            <span v-if="Number(v.version) === Number(version)" class="current-badge">current</span>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="viewVersion(v.version)">View HTML</button>
        </li>
      </ul>
      <div v-if="previewHtml" class="version-preview">
        <div class="version-preview-head">
          <strong>V{{ previewVersion }} (read-only)</strong>
          <button class="btn btn-ghost btn-sm" type="button" @click="previewHtml = ''; previewVersion = null">Close preview</button>
        </div>
        <iframe class="version-preview-frame" :srcdoc="previewHtml" title="Packet version preview" />
      </div>
    </div>

    <div v-else class="packet-editor-body">
      <HtmlDocumentBuilder
        v-model="htmlContent"
        placeholder="Office packet template HTML…"
        :merge-tokens="mergeTokens"
        paper-mode
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';
import HtmlDocumentBuilder from '../documents/HtmlDocumentBuilder.vue';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  initialLocale: { type: String, default: 'en' },
  title: { type: String, default: 'Client Intake Packet' },
  variant: { type: String, default: 'self' }
});

const emit = defineEmits(['saved']);

const tokenAgencyName = '{{' + 'AGENCY_NAME}}';
const tokenAgencyAddress = '{{' + 'AGENCY_ADDRESS}}';
const tokenStaffTable = '{{' + 'SCHOOL_STAFF_TABLE}}';
const tokenDisclosure = '{{' + 'DISCLOSURE_CARE_TEAM}}';

const mergeTokens = [
  { token: '{{AGENCY_NAME}}', label: 'Agency name' },
  { token: '{{AGENCY_ADDRESS}}', label: 'Agency address' },
  { token: '{{SCHOOL_NAME}}', label: 'Agency name (alias)' },
  { token: '{{SCHOOL_ADDRESS}}', label: 'Agency address (alias)' },
  { token: '{{SCHOOL_STAFF_TABLE}}', label: 'Blank staff fill-in table' },
  { token: '{{DISCLOSURE_CARE_TEAM}}', label: 'Care team / disclosure providers' }
];

const locale = ref(String(props.initialLocale || 'en').toLowerCase() === 'es' ? 'es' : 'en');
const loading = ref(false);
const saving = ref(false);
const downloading = ref(false);
const error = ref('');
const success = ref('');
const htmlContent = ref('');
const originalHtml = ref('');
const version = ref(null);
const showHistory = ref(false);
const historyLoading = ref(false);
const versions = ref([]);
const previewHtml = ref('');
const previewVersion = ref(null);
const defaultHtml = ref('');
const looksLikeSchoolSeed = ref(false);
const packetBrand = ref(null);
const brandVersionLabel = ref('1.0');
const brandUploading = ref(false);
const brandMessage = ref('');

const brandSlots = [
  { key: 'cover', label: 'Cover page' },
  { key: 'logo', label: 'Header logo' },
  { key: 'footer', label: 'Footer logo' },
  { key: 'header', label: 'Header banner (optional)' }
];

const packetParams = () => ({ locale: locale.value, variant: props.variant || 'self' });
const packetFileSlug = computed(() =>
  (props.variant === 'parent' ? 'parent-guardian' : 'client')
);

const dirty = computed(() => htmlContent.value !== originalHtml.value);
const localeLabel = computed(() => (locale.value === 'es' ? 'ES' : 'EN'));

function brandPath(slot) {
  const b = packetBrand.value || {};
  if (slot === 'cover') return b.coverPath || '';
  if (slot === 'logo') return b.logoPath || '';
  if (slot === 'footer') return b.footerLogoPath || '';
  if (slot === 'header') return b.headerImagePath || '';
  return '';
}

function formatWhen(v) {
  if (!v) return '';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

const loadBrand = async () => {
  try {
    const res = await api.get(`/agencies/${props.agencyId}/office-packet-brand`);
    packetBrand.value = res.data || null;
    brandVersionLabel.value = String(res.data?.versionLabel || '1.0');
  } catch {
    packetBrand.value = null;
  }
};

const onBrandFile = async (slot, event) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    brandUploading.value = true;
    brandMessage.value = '';
    error.value = '';
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(`/agencies/${props.agencyId}/office-packet-brand/${slot}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    brandMessage.value = `Uploaded ${slot}.`;
    await loadBrand();
    if (res.data?.path) brandMessage.value = `Saved ${slot}: ${res.data.path}`;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Upload failed';
  } finally {
    brandUploading.value = false;
    if (event?.target) event.target.value = '';
  }
};

const saveBrandVersion = async () => {
  try {
    brandUploading.value = true;
    brandMessage.value = '';
    await api.put(`/agencies/${props.agencyId}/office-packet-brand/version`, {
      versionLabel: brandVersionLabel.value || '1.0'
    });
    brandMessage.value = 'Version label saved.';
    await loadBrand();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save version label';
  } finally {
    brandUploading.value = false;
  }
};

const loadVersions = async () => {
  historyLoading.value = true;
  try {
    const res = await api.get(`/agencies/${props.agencyId}/office-packet-template-versions`, {
      params: packetParams()
    });
    versions.value = Array.isArray(res.data?.versions) ? res.data.versions : [];
  } catch {
    versions.value = [];
  } finally {
    historyLoading.value = false;
  }
};

const toggleHistory = async () => {
  showHistory.value = !showHistory.value;
  previewHtml.value = '';
  previewVersion.value = null;
  if (showHistory.value) await loadVersions();
};

const viewVersion = async (ver) => {
  try {
    const res = await api.get(`/agencies/${props.agencyId}/office-packet-template-versions/${ver}`, {
      params: packetParams()
    });
    previewHtml.value = String(res.data?.version?.html_content || '');
    previewVersion.value = Number(ver);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load version';
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    success.value = '';
    showHistory.value = false;
    const res = await api.get(`/agencies/${props.agencyId}/office-packet-template`, {
      params: packetParams()
    });
    htmlContent.value = String(res.data?.html_content || res.data?.template?.html_content || '');
    originalHtml.value = htmlContent.value;
    defaultHtml.value = String(res.data?.default_html || '');
    looksLikeSchoolSeed.value = !!res.data?.looks_like_school_seed;
    version.value = Number(res.data?.version || res.data?.template?.version || 1);
    if (res.data?.packetBrand) {
      packetBrand.value = res.data.packetBrand;
      brandVersionLabel.value = String(res.data.packetBrand.versionLabel || '1.0');
    } else {
      await loadBrand();
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load packet template';
  } finally {
    loading.value = false;
  }
};

const switchLocale = async (next) => {
  const loc = next === 'es' ? 'es' : 'en';
  if (loc === locale.value) return;
  if (dirty.value && !window.confirm('You have unsaved changes for this language. Discard them and switch?')) return;
  locale.value = loc;
  await load();
};

const save = async () => {
  try {
    saving.value = true;
    error.value = '';
    success.value = '';
    const res = await api.put(`/agencies/${props.agencyId}/office-packet-template`, {
      html_content: htmlContent.value,
      locale: locale.value,
      variant: props.variant || 'self'
    });
    htmlContent.value = String(res.data?.html_content || res.data?.template?.html_content || htmlContent.value);
    originalHtml.value = htmlContent.value;
    version.value = Number(res.data?.version || res.data?.template?.version || version.value || 1);
    looksLikeSchoolSeed.value = false;
    success.value = `Saved ${localeLabel.value} as V${version.value}.`;
    emit('saved', { version: version.value, locale: locale.value, variant: props.variant });
    if (showHistory.value) await loadVersions();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save packet template';
  } finally {
    saving.value = false;
  }
};

const downloadPdf = async () => {
  try {
    downloading.value = true;
    error.value = '';
    const res = await api.get(`/agencies/${props.agencyId}/office-packet-template/pdf`, {
      params: packetParams(),
      responseType: 'blob',
      timeout: 120000
    });
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${packetFileSlug.value}-intake-packet-${locale.value}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download PDF';
  } finally {
    downloading.value = false;
  }
};

function useOfficeDefault() {
  if (!defaultHtml.value) return;
  if (dirty.value && !window.confirm('Replace the current draft with the office default for this packet?')) return;
  htmlContent.value = defaultHtml.value;
  looksLikeSchoolSeed.value = false;
  success.value = 'Loaded the office default. Save to keep it.';
}

watch(() => [props.agencyId, props.variant], () => load());
onMounted(load);
</script>

<style scoped>
.packet-editor { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
.packet-editor-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.packet-editor-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.version-pill { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.locale-tabs { display: inline-flex; gap: 4px; margin-top: 10px; padding: 3px; border-radius: 999px; background: #f3f4f6; }
.locale-tab { border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #4b5563; cursor: pointer; }
.locale-tab.active { background: #fff; color: #111827; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.version-history { margin-top: 14px; }
.version-list { list-style: none; margin: 0; padding: 0; }
.version-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
.current-badge { margin-left: 8px; font-size: 11px; font-weight: 700; color: #065f46; }
.version-preview { margin-top: 12px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.version-preview-head { display: flex; justify-content: space-between; padding: 8px 12px; background: #f9fafb; }
.version-preview-frame { width: 100%; height: 480px; border: 0; background: #fff; }
.packet-editor-body { margin-top: 14px; }
.packet-brand-panel {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}
.packet-brand-panel.itsco-note { background: #f0fdf4; border-color: #bbf7d0; }
.packet-brand-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.packet-brand-slot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.packet-brand-slot input[type="file"] { font-weight: 400; font-size: 12px; }
.brand-path { font-weight: 400; font-size: 11px; word-break: break-all; }
.packet-brand-version {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-top: 12px;
}
.packet-brand-version label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.packet-brand-version input {
  min-width: 120px;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}
.muted { color: #6b7280; }
.error { color: #b91c1c; }
.success { color: #047857; }
.school-seed-note {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 13px;
}
</style>
