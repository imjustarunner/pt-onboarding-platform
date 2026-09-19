<template>
  <div class="legal-doc-page" :style="{ background: pageBackground }">
    <div class="legal-doc-header">
      <div class="legal-doc-brand" v-if="displayLogoUrl || displayBrandName">
        <img v-if="displayLogoUrl" :src="displayLogoUrl" alt="" class="legal-doc-logo" />
        <div class="legal-doc-brand-text">
          <div class="legal-doc-brand-name">{{ displayBrandName || 'PlotTwistHQ Platform' }}</div>
          <div class="legal-doc-brand-host">{{ hostLabel }}</div>
        </div>
      </div>
      <h2>{{ title }}</h2><p><a href="/community-standards" target="_blank" rel="noopener">Community Standards &amp; communication privacy</a> apply to all support communications.</p>
      <p class="legal-doc-subtitle">Viewing this document inside PlotTwistHQ.</p>
      <a
        v-if="sourceUrl"
        :href="sourceUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="legal-doc-open"
      >
        Open original in new tab
      </a>
    </div>

    <p v-if="sessionChecked && !verifiedSuperAdmin && editableTypes.includes(docType)" class="legal-admin-signin"><router-link :to="{path:'/login',query:{redirect:route.fullPath}}">Administrator sign-in</router-link></p>
    <section v-if="canEdit" class="legal-editor" aria-label="Edit legal document">
      <button v-if="!editing" type="button" @click="openEditor">{{ sourceUrl ? 'Edit document' : 'Add document' }}</button>
      <form v-else @submit.prevent="publish">
        <h3>Publish {{ title }}</h3>
        <p>This is a public platform document. Publishing updates this link across all websites.</p>
        <fieldset :disabled="saving">
          <legend>Document source</legend>
          <label><input v-model="sourceMode" type="radio" value="link" /> Web link</label>
          <label><input v-model="sourceMode" type="radio" value="upload" /> Upload PDF</label>
          <label v-if="sourceMode === 'link'" class="legal-editor-field">Document URL<input v-model="draftUrl" type="url" required maxlength="2048" placeholder="https://…" /><small>Use a link visitors can open without signing in. Some websites only allow viewing in a separate tab.</small></label>
          <label v-else class="legal-editor-field">PDF document<input type="file" accept="application/pdf,.pdf" required @change="file = $event.target.files?.[0] || null" /><small>PDF, up to 15 MB. The published file will be public.</small></label>
          <div class="legal-editor-actions"><button type="submit">{{ saving ? 'Publishing…' : 'Publish document' }}</button><button type="button" @click="editing = false">Cancel</button></div>
        </fieldset>
      </form>
      <p v-if="saveError" role="alert">{{ saveError }}</p><p v-if="savedNotice" role="status">{{ savedNotice }}</p>
    </section>
    <div v-if="!sourceUrl" class="legal-doc-empty">
      This document link is not configured yet.
    </div>
    <iframe
      v-else
      :src="embedUrl"
      title="Legal document"
      class="legal-doc-frame"
      loading="lazy"
      referrerpolicy="no-referrer"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useRoute } from 'vue-router';
import { useBrandingStore } from '../../store/branding';

const route = useRoute();
const sessionChecked = ref(false);
const verifiedSuperAdmin = ref(false), editing = ref(false), saving = ref(false), draftUrl = ref(''), file = ref(null), sourceMode = ref('link'), saveError = ref(''), savedNotice = ref('');
const editableTypes = ['terms', 'privacypolicy', 'platformhipaa'];
const canEdit = computed(() => verifiedSuperAdmin.value && editableTypes.includes(docType.value));
function openEditor() { draftUrl.value = sourceUrl.value; file.value = null; sourceMode.value = 'link'; saveError.value = ''; savedNotice.value = ''; editing.value = true; }
watch(() => route.meta?.legalDocType, () => { editing.value = false; saveError.value = ''; savedNotice.value = ''; });
async function publish() {
  saving.value = true; saveError.value = ''; savedNotice.value = '';
  const publishingType = docType.value;
  try {
    let body;
    if (sourceMode.value === 'upload') {
      if (!file.value || file.value.size > 15 * 1024 * 1024) throw new Error('Choose a PDF of 15 MB or smaller.');
      body = new FormData(); body.append('file', file.value);
    } else {
      let parsed;
      try { parsed = new URL(draftUrl.value.trim()); } catch { throw new Error('Enter a complete http:// or https:// document link.'); }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Enter a complete http:// or https:// document link.');
      body = { url: parsed.href };
    }
    const { data } = await api.post(`/platform-branding/legal-documents/${publishingType}`, body);
    brandingStore.platformBranding = data.branding;
    if (publishingType === docType.value) { editing.value = false; savedNotice.value = 'Document published. Visitors can open it now.'; }
  } catch (error) { if (publishingType === docType.value) saveError.value = error.response?.data?.error?.message || error.message || 'Could not publish the document.'; }
  finally { saving.value = false; }
}

const brandingStore = useBrandingStore();
const hostLabel = typeof window !== 'undefined' ? window.location.host : '';

const defaults = {
  terms: 'https://docs.google.com/document/d/1KuT_Oe0uuwwOXS1YF6vGSLVhKZEkb8wyFaKQc4Rl3rg/edit?tab=t.0',
  privacypolicy: 'https://docs.google.com/document/d/1kstKJCBvjcuPiFrzZrVbRoIOaOQF8RxYL7zhBX7EbCo/edit?tab=t.0',
  publicproof: 'https://docs.google.com/document/d/1Wsft2HBQM0g4Thllgpq5jf9PYhNmAH4ho_zSg_mfvIE/edit?tab=t.0'
};

const docType = computed(() => String(route.meta?.legalDocType || '').toLowerCase());

const title = computed(() => {
  if (docType.value === 'terms') return 'Platform Terms of Service';
  if (docType.value === 'privacypolicy') return 'Platform Privacy Policy';
  if (docType.value === 'publicproof') return 'PlotTwistHQ SMS Consent Proof';
  if (docType.value === 'platformhipaa') return 'Platform HIPAA';
  return 'Legal Document';
});

const displayLogoUrl = computed(
  () => brandingStore.displayChromeIconUrl || brandingStore.displayLogoUrl || null
);
const displayBrandName = computed(() => {
  const portalName = String(brandingStore.portalAgency?.name || '').trim();
  if (portalName) return portalName;
  return String(brandingStore.platformBranding?.organization_name || '').trim();
});
const pageBackground = computed(() => brandingStore.loginBackground || 'linear-gradient(135deg, #eef2f7 0%, #f8fafc 100%)');

const sourceUrl = computed(() => {
  const pb = brandingStore.platformBranding || {};
  if (docType.value === 'terms') {
    return String(pb.terms_url || '').trim() || defaults.terms;
  }
  if (docType.value === 'privacypolicy') {
    return String(pb.privacy_policy_url || '').trim() || defaults.privacypolicy;
  }
  if (docType.value === 'publicproof') {
    return String(pb.public_proof_url || '').trim() || defaults.publicproof;
  }
  if (docType.value === 'platformhipaa') {
    return String(pb.platform_hipaa_url || '').trim() || '';
  }
  return '';
});

const embedUrl = computed(() => {
  const u = String(sourceUrl.value || '').trim();
  if (!u) return '';
  if (u.includes('docs.google.com/document/d/')) {
    if (u.includes('/preview')) return u;
    if (u.includes('/pub')) return u;
    return u.replace(/\/edit(?:\?.*)?$/, '/preview');
  }
  return u;
});

onMounted(async () => {
  api.get('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true }).then(({ data }) => { verifiedSuperAdmin.value = data?.role === 'super_admin'; }).catch(() => {}).finally(() => { sessionChecked.value = true; });
  await brandingStore.initializePortalTheme();
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
});
</script>

<style scoped>
.legal-admin-signin { margin:16px 20px; }
.legal-editor { margin:20px; padding:20px; border:1px solid #c1d0d9; border-radius:12px; background:#fff; color:#183b4c; }
.legal-editor h3 { color:inherit; }
.legal-editor fieldset { border:0; padding:0; min-width:0; }
.legal-editor legend { font-weight:700; margin-bottom:10px; }
.legal-editor label { margin-right:20px; }
.legal-editor-field { display:grid; gap:8px; margin:18px 0!important; }
.legal-editor input[type=url] { width:100%; box-sizing:border-box; padding:12px; border:1px solid #98adb8; border-radius:6px; font:inherit; }
.legal-editor input[type=file] { max-width:100%; }
.legal-editor small { line-height:1.5; }
.legal-editor-actions { display:flex; flex-wrap:wrap; gap:12px; }
.legal-editor button { padding:12px 18px; border:1px solid #245361; border-radius:6px; background:#245361; color:#fff; font:inherit; cursor:pointer; }
.legal-editor [role=alert] { color:#9b2626; }

.legal-doc-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-size: cover;
  background-position: center;
}

.legal-doc-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
}

.legal-doc-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.legal-doc-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.legal-doc-brand-text {
  display: flex;
  flex-direction: column;
}

.legal-doc-brand-name {
  font-weight: 700;
}

.legal-doc-brand-host {
  color: var(--text-secondary, #64748b);
  font-size: 12px;
}

.legal-doc-header h2 {
  margin: 0 0 6px 0;
}

.legal-doc-subtitle {
  margin: 0;
  color: var(--text-secondary, #64748b);
}

.legal-doc-open {
  display: inline-block;
  margin-top: 8px;
  color: var(--primary, #0ea5a5);
}

.legal-doc-empty {
  margin: 20px;
  color: var(--text-secondary, #64748b);
}

.legal-doc-frame {
  flex: 1;
  width: 100%;
  border: 0;
  min-height: 75vh;
  background: rgba(255, 255, 255, 0.96);
}
</style>
