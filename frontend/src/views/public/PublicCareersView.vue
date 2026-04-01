<template>
  <div class="careers-root" :style="rootFontStyle">
    <header class="careers-hero">
      <div class="careers-hero-inner">
        <p class="careers-eyebrow">Careers</p>
        <div v-if="headerLogoUrl" class="careers-logo-wrap">
          <img class="careers-logo" :src="headerLogoUrl" :alt="headerLogoAlt" loading="eager" />
        </div>
        <h1 class="careers-title">{{ pageTitle }}</h1>
        <p class="careers-subtitle">
          Browse open roles and apply directly online.
        </p>
      </div>
    </header>

    <div v-if="loading" class="careers-loading">Loading open positions...</div>
    <div v-else-if="error" class="careers-error">{{ error }}</div>
    <div v-else-if="!jobs.length" class="careers-empty">
      <p>No open positions right now.</p>
    </div>
    <ul v-else class="careers-list">
      <li v-for="job in jobs" :key="`job-${job.jobId}`">
        <a
          class="careers-card"
          :href="buildPublicIntakeUrl(job.applicationPublicKey)"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div class="careers-card-body">
            <h2 class="careers-card-title">{{ job.title }}</h2>
            <p class="careers-card-meta">{{ trimText(job.descriptionText, 260) }}</p>
          </div>
          <span class="careers-card-cta">Apply</span>
        </a>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';

const route = useRoute();
const brandingStore = useBrandingStore();

const slug = computed(() => String(route.params?.agencySlug || '').trim());
const loading = ref(false);
const error = ref('');
const jobs = ref([]);
const agencyName = ref('');

const pageTitle = computed(() => (agencyName.value ? `${agencyName.value} Careers` : 'Careers'));
const headerLogoUrl = computed(() => {
  const t = brandingStore.portalTheme;
  const u = t?.logoUrl || brandingStore.portalAgency?.logoUrl;
  return u ? String(u).trim() : '';
});
const headerLogoAlt = computed(() => {
  const n = brandingStore.portalTheme?.agencyName || brandingStore.portalAgency?.name || agencyName.value;
  return n ? `${n} logo` : 'Organization logo';
});
const rootFontStyle = computed(() => {
  const raw = brandingStore.portalTheme?.themeSettings?.fontFamily || brandingStore.portalAgency?.themeSettings?.fontFamily;
  if (!raw) return {};
  return { fontFamily: String(raw).trim() };
});

const trimText = (text, maxLen = 220) => {
  const raw = String(text || '').trim();
  if (!raw) return 'No description provided yet.';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen).trim()}...`;
};

const loadCareers = async () => {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    try {
      await brandingStore.fetchAgencyTheme(slug.value, { pageContext: 'public_events' });
    } catch {
      // best effort
    }
    const r = await api.get(`/public-intake/careers/${encodeURIComponent(slug.value)}`, {
      skipAuthRedirect: true,
      timeout: 15000
    });
    agencyName.value = String(r.data?.agency?.officialName || r.data?.agency?.name || '').trim();
    jobs.value = Array.isArray(r.data?.jobs) ? r.data.jobs : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Unable to load careers at this time.';
    jobs.value = [];
  } finally {
    loading.value = false;
  }
};

watch(slug, () => loadCareers(), { immediate: true });
</script>

<style scoped>
.careers-root {
  min-height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 40%);
  color: #0f172a;
  padding-bottom: 48px;
}
.careers-hero {
  padding: 28px 20px 20px;
  text-align: center;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.careers-hero-inner {
  max-width: 720px;
  margin: 0 auto;
}
.careers-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.careers-logo-wrap {
  margin: 0 auto 12px;
  max-height: 64px;
}
.careers-logo {
  max-height: 64px;
  width: auto;
  object-fit: contain;
}
.careers-title {
  margin: 0;
  font-size: 1.65rem;
  color: var(--primary, #15803d);
}
.careers-subtitle {
  margin: 12px 0 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #64748b;
}
.careers-loading,
.careers-error,
.careers-empty {
  max-width: 760px;
  margin: 24px auto;
  padding: 0 20px;
  text-align: center;
}
.careers-error {
  color: #b91c1c;
}
.careers-list {
  list-style: none;
  margin: 16px auto 0;
  padding: 0 20px;
  max-width: 860px;
}
.careers-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 18px 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  text-decoration: none;
  color: inherit;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.careers-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: 0 4px 14px rgb(15 23 42 / 8%);
}
.careers-card-title {
  margin: 0;
  font-size: 1.1rem;
}
.careers-card-meta {
  margin: 6px 0 0;
  font-size: 0.9rem;
  color: #64748b;
  line-height: 1.45;
}
.careers-card-cta {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--primary, #15803d);
  white-space: nowrap;
}
</style>
