<template>
  <div class="pmh-sub">
    <div v-if="error" class="pmh-fatal">{{ error }}</div>
    <div v-else-if="loading" class="pmh-loading">Loading…</div>
    <article v-else-if="subPage" class="pmh-sub-inner">
      <nav class="pmh-sub-breadcrumb">
        <router-link class="pmh-sub-crumb" :to="{ path: `/p/${hubSlug}` }">← {{ hubTitle }}</router-link>
      </nav>
      <h1 class="pmh-sub-title">{{ subPage.title }}</h1>
      <div class="pmh-sub-body" v-html="renderedBody" />
    </article>
    <div v-else class="pmh-fatal">This page is not available.</div>

    <footer v-if="!error && !loading" class="pmh-sub-foot">
      <div class="pmh-sub-foot-inner">
        <router-link class="pmh-sub-foot-login" to="/login">Staff login</router-link>
        <PoweredByFooter
          variant="embedded"
          :legal-title="hubLegalTitle"
          :legal-links-override="hubLegalLinksOverride"
        />
      </div>
    </footer>
  </div>
</template>

<script setup>
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import PoweredByFooter from '../../components/PoweredByFooter.vue';

const brandingStore = useBrandingStore();

const route = useRoute();
const hubSlug = computed(() => String(route.params.hubSlug || '').trim().toLowerCase());
const subPageSlug = computed(() => String(route.params.subPageSlug || '').trim().toLowerCase());

const loading = ref(true);
const error = ref('');
const pageMeta = ref(null);

const hubTitle = computed(() => pageMeta.value?.heroTitle || pageMeta.value?.title || 'Hub');
const hubLegalTitle = computed(() => String(pageMeta.value?.branding?.legalFooterTitle || '').trim());
const hubLegalLinksOverride = computed(() => {
  const raw = pageMeta.value?.branding?.legalFooterLinks;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ label: String(r?.label || '').trim(), href: String(r?.href || r?.url || '').trim() }))
    .filter((r) => r.label && r.href)
    .slice(0, 12);
});

const subPage = computed(() => {
  const pages = pageMeta.value?.branding?.contentPages;
  if (!Array.isArray(pages)) return null;
  return pages.find((p) => String(p.slug || '').trim().toLowerCase() === subPageSlug.value) || null;
});

const renderedBody = computed(() => {
  const raw = String(subPage.value?.body || '').trim();
  if (!raw) return '';
  try {
    const html = marked.parse(raw, { async: false });
    return DOMPurify.sanitize(typeof html === 'string' ? html : String(html));
  } catch {
    return DOMPurify.sanitize(`<p>${raw}</p>`);
  }
});

async function loadPage() {
  const slug = hubSlug.value;
  const sub = subPageSlug.value;
  if (!slug || !sub) {
    error.value = 'Invalid page.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [res] = await Promise.all([
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      }),
      brandingStore.fetchPlatformBranding()
    ]);
    pageMeta.value = res.data?.page || null;
    const pages = pageMeta.value?.branding?.contentPages;
    const found =
      Array.isArray(pages) &&
      pages.some((p) => String(p.slug || '').trim().toLowerCase() === sub);
    if (!found) {
      pageMeta.value = pageMeta.value || {};
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load page.';
    pageMeta.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadPage);
watch([hubSlug, subPageSlug], () => loadPage());
</script>

<style scoped>
.pmh-sub {
  --hub-font-display: 'Plus Jakarta Sans', Inter, system-ui, sans-serif;
  --hub-font-body: Inter, system-ui, sans-serif;
  --hub-text: #111827;
  --hub-text-muted: #4b5563;
  --hub-link: #a32623;
  --hub-surface: #ffffff;
  --hub-border: rgba(15, 23, 42, 0.06);
  --hub-radius-lg: 20px;
  --hub-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.07), 0 8px 10px -6px rgba(15, 23, 42, 0.045);
  min-height: 100vh;
  font-family: var(--hub-font-body);
  background:
    radial-gradient(110% 55% at 50% -8%, rgba(45, 212, 191, 0.07) 0%, transparent 52%),
    linear-gradient(180deg, #f3f5f8 0%, #f1f4f8 45%, #eceff3 100%);
  color: var(--hub-text);
  padding: 32px 16px 64px;
}
.pmh-loading {
  text-align: center;
  padding: 48px 16px;
  color: #64748b;
}
.pmh-sub-inner {
  max-width: 44rem;
  margin: 0 auto;
  padding: 28px 24px 32px;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
}
.pmh-sub-breadcrumb {
  margin-bottom: 16px;
}
.pmh-sub-crumb {
  color: var(--hub-link);
  font-weight: 700;
  font-family: var(--hub-font-display);
  text-decoration: none;
  font-size: 0.9375rem;
}
.pmh-sub-crumb:hover {
  text-decoration: underline;
}
.pmh-sub-title {
  margin: 0 0 20px;
  font-size: clamp(1.5rem, 4vw, 1.85rem);
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.03em;
  color: var(--hub-text);
}
.pmh-sub-body {
  line-height: 1.65;
  font-size: 1rem;
  color: var(--hub-text-muted);
}
.pmh-sub-body :deep(h2),
.pmh-sub-body :deep(h3) {
  color: var(--hub-text);
  margin-top: 1.25em;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.02em;
}
.pmh-sub-body :deep(a) {
  color: var(--hub-link);
  font-weight: 600;
}
.pmh-fatal {
  padding: 48px 16px;
  text-align: center;
  color: #991b1b;
  background: #fef2f2;
  font-size: 1rem;
}

.pmh-sub-foot {
  max-width: 44rem;
  margin: 28px auto 0;
  padding: 0 16px 32px;
}

.pmh-sub-foot-inner {
  padding: 20px 22px 16px;
  text-align: center;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
}

.pmh-sub-foot-login {
  display: inline-block;
  margin-bottom: 6px;
  font-size: 0.875rem;
  font-weight: 700;
  font-family: var(--hub-font-display);
  color: var(--hub-link);
  text-decoration: none;
}
.pmh-sub-foot-login:hover {
  text-decoration: underline;
}

.pmh-sub-foot :deep(.powered-by-text),
.pmh-sub-foot :deep(.powered-by-name),
.pmh-sub-foot :deep(.legal-link) {
  color: var(--hub-text-muted);
}
</style>
