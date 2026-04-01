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
    <div v-else class="careers-filters">
      <select v-model="selectedEducation" class="careers-select">
        <option value="">All education levels</option>
        <option v-for="opt in educationLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <select v-model="selectedState" class="careers-select">
        <option value="">All states</option>
        <option v-for="st in availableStates" :key="st" :value="st">{{ st }}</option>
      </select>
      <select v-model="sortBy" class="careers-select">
        <option value="posted_desc">Newest posted</option>
        <option value="posted_asc">Oldest posted</option>
        <option value="city_asc">City/State (A-Z)</option>
      </select>
    </div>
    <ul v-if="filteredJobs.length" class="careers-list">
      <li v-for="job in filteredJobs" :key="`job-${job.jobId}`">
        <div class="careers-card">
          <div class="careers-card-body">
            <h2 class="careers-card-title">{{ job.title }}</h2>
            <p class="careers-card-meta">{{ trimText(job.descriptionText, 260) }}</p>
            <div class="careers-card-meta small">
              <span v-if="job.city || job.state">{{ [job.city, job.state].filter(Boolean).join(', ') }}</span>
              <span v-if="job.educationLevel"> • {{ educationLabel(job.educationLevel) }}</span>
              <span v-if="job.postedDate"> • Posted {{ formatDate(job.postedDate) }}</span>
              <span> • {{ job.applicationDeadline ? `Apply by ${formatDate(job.applicationDeadline)}` : 'Ongoing' }}</span>
            </div>
          </div>
          <div class="careers-actions">
            <button class="btn btn-secondary btn-sm" type="button" @click="openLearnMore(job)">Learn more</button>
            <a
              class="careers-card-cta"
              :href="buildPublicIntakeUrl(job.applicationPublicKey)"
              target="_blank"
              rel="noopener noreferrer"
            >
              Apply now
            </a>
          </div>
        </div>
      </li>
    </ul>
    <div v-else class="careers-empty"><p>No jobs match the selected filters.</p></div>

    <div v-if="learnMoreJob" class="careers-modal-overlay" @click.self="closeLearnMore">
      <div class="careers-modal">
        <div class="careers-modal-header">
          <h3>{{ learnMoreJob.title }}</h3>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeLearnMore">Close</button>
        </div>
        <div class="careers-modal-body">
          <p class="careers-card-meta">{{ learnMoreJob.descriptionText || 'No quick description provided.' }}</p>
          <div v-if="learnMoreJob.jobDescriptionFileUrl" class="careers-embed-wrap">
            <iframe :src="learnMoreJob.jobDescriptionFileUrl" class="careers-embed" title="Job description" />
          </div>
          <div v-else class="muted small">No attached job description document.</div>
        </div>
      </div>
    </div>
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
const selectedState = ref('');
const selectedEducation = ref('');
const sortBy = ref('posted_desc');
const learnMoreJob = ref(null);
const educationLevelOptions = [
  { value: 'bachelors', label: 'Bachelors' },
  { value: 'masters_level_intern', label: 'Masters level intern' },
  { value: 'masters_or_doctoral', label: 'Masters/Doctoral level' }
];

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
const availableStates = computed(() =>
  Array.from(new Set((jobs.value || []).map((j) => String(j?.state || '').trim()).filter(Boolean))).sort()
);
const filteredJobs = computed(() => {
  let list = (jobs.value || []).slice();
  if (selectedState.value) list = list.filter((j) => String(j.state || '').trim() === selectedState.value);
  if (selectedEducation.value) {
    list = list.filter((j) => String(j.educationLevel || '').trim().toLowerCase() === selectedEducation.value);
  }
  if (sortBy.value === 'city_asc') {
    list.sort((a, b) => `${a.city || ''} ${a.state || ''}`.localeCompare(`${b.city || ''} ${b.state || ''}`));
  } else if (sortBy.value === 'posted_asc') {
    list.sort((a, b) => String(a.postedDate || '').localeCompare(String(b.postedDate || '')));
  } else {
    list.sort((a, b) => String(b.postedDate || '').localeCompare(String(a.postedDate || '')));
  }
  return list;
});
const formatDate = (v) => {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toLocaleDateString();
};
const educationLabel = (key) =>
  educationLevelOptions.find((o) => o.value === String(key || '').trim().toLowerCase())?.label || key || 'Education not specified';
const openLearnMore = (job) => { learnMoreJob.value = job || null; };
const closeLearnMore = () => { learnMoreJob.value = null; };

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
  color: inherit;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.careers-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: 0 4px 14px rgb(15 23 42 / 8%);
}
.careers-filters {
  max-width: 860px;
  margin: 12px auto 0;
  padding: 0 20px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.careers-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}
.careers-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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
  text-decoration: none;
}
.careers-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}
.careers-modal {
  width: min(980px, 96vw);
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.careers-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}
.careers-modal-body {
  padding: 12px;
}
.careers-embed-wrap {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  overflow: hidden;
}
.careers-embed {
  width: 100%;
  min-height: 560px;
  border: 0;
}
</style>
