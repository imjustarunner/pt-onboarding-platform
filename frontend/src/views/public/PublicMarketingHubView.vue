<template>
  <div class="pmh-page">
    <div v-if="error" class="pmh-fatal">{{ error }}</div>
    <div v-if="heroImageUrl" class="pmh-hero-media">
      <img :src="heroImageUrl" :alt="heroTitle || pageTitle" loading="lazy" />
    </div>
    <PublicEventsListing
      v-if="!error"
      :page-title="listingTitle"
      :page-subtitle="listingSubtitle"
      :events="events"
      :loading="loading"
      :error="''"
      :hub-slug="hubSlug"
      :show-hub-source-chips="true"
    />

    <section v-if="bookingHints.length" class="pmh-section pmh-booking">
      <div class="pmh-section-inner">
        <h2 class="pmh-h2">Request a provider</h2>
        <p class="pmh-muted">
          Each organization may offer public booking. You need the access key from them to complete scheduling (append
          <code>?key=…</code> to the link they provide, or use their full invitation URL).
        </p>
        <ul class="pmh-booking-list">
          <li v-for="h in bookingHints" :key="h.agencyId">
            <router-link class="pmh-link" :to="{ path: `/find-provider/${h.agencyId}` }">{{ h.agencyName }}</router-link>
            <span v-if="!h.publicAvailabilityEnabled" class="pmh-muted"> — public booking not enabled</span>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="metricsBlock" class="pmh-section pmh-metrics">
      <div class="pmh-section-inner">
        <h2 class="pmh-h2">At a glance</h2>
        <p v-if="metricsBlock.disclaimer" class="pmh-muted pmh-disclaimer">{{ metricsBlock.disclaimer }}</p>
        <dl class="pmh-metrics-grid">
          <div v-if="metricsBlock.metrics.providerCount != null" class="pmh-metric">
            <dt>Providers (approx.)</dt>
            <dd>{{ metricsBlock.metrics.providerCount }}</dd>
          </div>
          <div v-if="metricsBlock.metrics.activeClientCount != null" class="pmh-metric">
            <dt>Active clients (non-archived)</dt>
            <dd>{{ metricsBlock.metrics.activeClientCount }}</dd>
          </div>
          <div v-if="metricsBlock.metrics.mileageClaimsSubmittedLast365Days != null" class="pmh-metric">
            <dt>Mileage claims (last 365 days)</dt>
            <dd>{{ metricsBlock.metrics.mileageClaimsSubmittedLast365Days }}</dd>
          </div>
        </dl>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import PublicEventsListing from '../../components/public/PublicEventsListing.vue';

const route = useRoute();
const hubSlug = computed(() => String(route.params.hubSlug || '').trim().toLowerCase());

const loading = ref(true);
const error = ref('');
const pageMeta = ref(null);
const events = ref([]);
const bookingHints = ref([]);
const metricsBlock = ref(null);

const heroTitle = computed(() => pageMeta.value?.heroTitle || '');
const heroImageUrl = computed(() => pageMeta.value?.heroImageUrl || '');
const pageTitle = computed(() => pageMeta.value?.title || 'Events');
const listingTitle = computed(() => heroTitle.value || pageTitle.value);
const listingSubtitle = computed(() => pageMeta.value?.heroSubtitle || '');

async function loadAll() {
  const slug = hubSlug.value;
  if (!slug) {
    error.value = 'Invalid page.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  metricsBlock.value = null;
  try {
    const [pageRes, evRes, bookRes] = await Promise.all([
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}`, { skipGlobalLoading: true, skipAuthRedirect: true }),
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/events`, { skipGlobalLoading: true, skipAuthRedirect: true }),
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/booking-hints`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      })
    ]);
    pageMeta.value = pageRes.data?.page || null;
    events.value = Array.isArray(evRes.data?.events) ? evRes.data.events : [];
    bookingHints.value = Array.isArray(bookRes.data?.bookingHints) ? bookRes.data.bookingHints : [];

    if (pageMeta.value?.metricsEnabled) {
      try {
        const mRes = await api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/metrics`, {
          skipGlobalLoading: true,
          skipAuthRedirect: true
        });
        if (mRes.data?.ok && mRes.data?.metrics) {
          metricsBlock.value = { metrics: mRes.data.metrics, disclaimer: mRes.data.disclaimer || '' };
        }
      } catch {
        metricsBlock.value = null;
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load page.';
    pageMeta.value = null;
    events.value = [];
    bookingHints.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);
watch(hubSlug, () => loadAll());
</script>

<style scoped>
.pmh-page {
  min-height: 100vh;
}

.pmh-fatal {
  padding: 48px 16px;
  text-align: center;
  color: #fecaca;
  background: #0f172a;
  font-size: 1rem;
}

.pmh-hero-media {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px 16px 0;
}

.pmh-hero-media img {
  width: 100%;
  max-height: 280px;
  object-fit: cover;
  border-radius: 12px;
  display: block;
}

.pmh-section {
  background: linear-gradient(165deg, #0f172a 0%, #1e1b4b 38%, #312e81 100%);
  color: #e2e8f0;
  padding: 32px 16px 48px;
}

.pmh-section-inner {
  max-width: 40rem;
  margin: 0 auto;
}

.pmh-h2 {
  margin: 0 0 12px;
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
}

.pmh-muted {
  margin: 0 0 12px;
  color: #c7d2fe;
  font-size: 0.92rem;
  line-height: 1.5;
}

.pmh-disclaimer {
  font-size: 0.82rem;
  opacity: 0.9;
}

.pmh-booking-list {
  margin: 0;
  padding-left: 1.2rem;
  color: #e2e8f0;
}

.pmh-link {
  color: #a5b4fc;
  font-weight: 600;
}

.pmh-metrics-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  margin: 0;
}

.pmh-metric {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(129, 140, 248, 0.35);
  border-radius: 10px;
  padding: 12px 14px;
}

.pmh-metric dt {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #a5b4fc;
}

.pmh-metric dd {
  margin: 6px 0 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #fff;
}
</style>
