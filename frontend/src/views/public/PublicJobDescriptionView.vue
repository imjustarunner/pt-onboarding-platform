<template>
  <div class="pjd" :style="rootStyle">
    <header class="pjd-top">
      <div class="pjd-brand">
        <img v-if="agency.logoUrl" class="pjd-logo" :src="agency.logoUrl" :alt="agencyDisplayName" />
        <span class="pjd-agency">{{ agencyDisplayName }}</span>
      </div>
      <router-link v-if="careersHref" class="pjd-careers-link" :to="careersHref">Careers</router-link>
    </header>

    <div v-if="loading" class="pjd-state">Loading job description…</div>
    <div v-else-if="error" class="pjd-state pjd-state--err">{{ error }}</div>
    <main v-else class="pjd-main">
      <div v-if="!job.isOpen" class="pjd-closed" role="status">
        <strong>Currently closed</strong>
        <p>{{ job.statusMessage || 'This position is currently closed.' }}</p>
      </div>

      <h1 class="pjd-title">{{ job.title }}</h1>
      <div v-if="metaLine" class="pjd-meta">{{ metaLine }}</div>

      <JobDescriptionSections
        v-if="job.descriptionSections"
        class="pjd-sections"
        :sections="job.descriptionSections"
        :title="job.title"
        :role-type="job.roleType || ''"
        :location="job.location || ''"
        :schedule="job.scheduleText || ''"
        :accent-color="accentColor"
        :show-header="false"
      />

      <div v-else-if="job.descriptionText" class="pjd-plain">
        <p v-for="(para, i) in plainParagraphs" :key="`p-${i}`">{{ para }}</p>
      </div>

      <p v-else-if="job.jobDescriptionFileUrl" class="pjd-file">
        <a :href="job.jobDescriptionFileUrl" target="_blank" rel="noopener noreferrer">
          {{ job.jobDescriptionFileName || 'Download job description PDF' }} →
        </a>
      </p>

      <p v-else class="pjd-empty">No job description content is available for this role.</p>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api.js';
import JobDescriptionSections from '../../components/careers/JobDescriptionSections.vue';
import { ensurePortalSlugResolved, resolveHostImpliedPortalSlug } from '../../utils/orgScopedPath.js';
import { useBrandingStore } from '../../store/branding.js';

const route = useRoute();
const brandingStore = useBrandingStore();

const loading = ref(true);
const error = ref('');
const agency = ref({});
const job = ref({});
const hostResolvedSlug = ref('');

function pathSlug(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'login' || lower === 'careers' || lower === 'admin' || lower === 'jobs') return '';
  return s;
}

const slug = computed(() =>
  pathSlug(route.params?.agencySlug)
    || hostResolvedSlug.value
    || resolveHostImpliedPortalSlug(brandingStore)
);

const jobId = computed(() => Number(route.params?.jobId || 0));

const agencyDisplayName = computed(() =>
  String(agency.value?.officialName || agency.value?.name || 'Careers').trim()
);

const accentColor = computed(() => {
  const c = String(agency.value?.accentColor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1a8c54';
});

const rootStyle = computed(() => ({
  '--accent': accentColor.value
}));

const metaLine = computed(() => {
  const parts = [
    job.value?.roleType,
    job.value?.location,
    job.value?.educationLevel
  ].map((s) => String(s || '').trim()).filter(Boolean);
  return parts.join(' · ');
});

const plainParagraphs = computed(() =>
  String(job.value?.descriptionText || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
);

const careersHref = computed(() => {
  const s = slug.value || agency.value?.slug;
  if (!s) return '/careers';
  // Dedicated hosts use flat /careers; path-based use /careers/:slug
  if (resolveHostImpliedPortalSlug(brandingStore) && !pathSlug(route.params?.agencySlug)) {
    return '/careers';
  }
  return `/careers/${encodeURIComponent(s)}`;
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (!hostResolvedSlug.value && !pathSlug(route.params?.agencySlug)) {
      hostResolvedSlug.value = await ensurePortalSlugResolved({}, brandingStore);
    }
    const jid = jobId.value;
    if (!jid) {
      error.value = 'Job not found.';
      return;
    }
    // Dedicated hosts use flat /careers/jobs/:id — skip agency slug in the API
    // path so portal_url vs slug mismatches (e.g. nextleveluplcc vs nlu) don't 404.
    const onDedicatedHost = Boolean(
      resolveHostImpliedPortalSlug(brandingStore) && !pathSlug(route.params?.agencySlug)
    );
    const s = onDedicatedHost ? '' : slug.value;
    const url = s
      ? `/public-intake/careers/${encodeURIComponent(s)}/jobs/${jid}`
      : `/public-intake/careers/jobs/${jid}`;
    const { data } = await api.get(url);
    agency.value = data?.agency || {};
    job.value = data?.job || {};
    if (!job.value?.jobId) {
      error.value = 'Job description not found.';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Unable to load job description.';
  } finally {
    loading.value = false;
  }
}

watch([jobId, () => route.params?.agencySlug], () => load(), { immediate: true });
</script>

<style scoped>
.pjd {
  --accent: #1a8c54;
  min-height: 100vh;
  background:
    radial-gradient(ellipse 80% 50% at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent),
    linear-gradient(180deg, #f7faf8 0%, #eef3f0 100%);
  color: #0f172a;
  font-family: "Source Sans 3", "Segoe UI", sans-serif;
}
.pjd-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(8px);
}
.pjd-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}
.pjd-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 8px;
}
.pjd-agency {
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pjd-careers-link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
  font-size: 0.95rem;
}
.pjd-careers-link:hover { text-decoration: underline; }
.pjd-main {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3.5rem;
}
.pjd-closed {
  margin-bottom: 1.25rem;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  border: 1px solid #c4a35a;
  background: #fff8e8;
  color: #5c4810;
}
.pjd-closed strong {
  display: block;
  font-size: 1rem;
  margin-bottom: 0.25rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.pjd-closed p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
}
.pjd-title {
  margin: 0 0 0.5rem;
  font-size: clamp(1.75rem, 3vw, 2.35rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #0b1f14;
}
.pjd-meta {
  margin-bottom: 1.5rem;
  color: #475569;
  font-size: 0.98rem;
}
.pjd-sections { margin-top: 0.5rem; }
.pjd-plain p {
  margin: 0 0 1rem;
  line-height: 1.55;
  white-space: pre-wrap;
}
.pjd-file a {
  color: var(--accent);
  font-weight: 600;
}
.pjd-empty, .pjd-state {
  padding: 2.5rem 1.25rem;
  text-align: center;
  color: #64748b;
}
.pjd-state--err { color: #b91c1c; }
</style>
