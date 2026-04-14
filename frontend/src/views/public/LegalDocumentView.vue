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
      <h2>{{ title }}</h2>
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
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useBrandingStore } from '../../store/branding';

const route = useRoute();
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
  await brandingStore.initializePortalTheme();
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
});
</script>

<style scoped>
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
