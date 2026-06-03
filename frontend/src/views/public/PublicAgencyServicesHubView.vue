<template>
  <div class="services-hub">
    <header class="hub-header">
      <div class="hub-header-inner">
        <img v-if="agency.logoUrl" :src="agency.logoUrl" :alt="agency.name" class="agency-logo" />
        <div class="hub-headline">
          <h1>{{ agency.name || 'Our Services' }}</h1>
          <p class="hub-tagline">Choose a service below to find and book the right provider for you.</p>
        </div>
      </div>
    </header>

    <div v-if="loading" class="hub-loading">
      <div class="spinner" />
      <span>Loading…</span>
    </div>

    <div v-else-if="error" class="hub-error">
      <p>{{ error }}</p>
    </div>

    <main v-else class="hub-main">
      <div v-if="serviceTypes.length === 0" class="hub-empty">
        <p>No services are currently available for online booking. Please check back soon.</p>
      </div>

      <div v-else class="service-cards">
        <button
          v-for="svc in serviceTypes"
          :key="svc.serviceType"
          class="service-card"
          :class="`service-card--${svc.serviceType}`"
          type="button"
          @click="navigate(svc.serviceType)"
        >
          <div class="service-card-icon">
            <component :is="iconForType(svc.serviceType)" />
          </div>
          <h2 class="service-card-title">{{ svc.displayName }}</h2>
          <p v-if="svc.introBlurb" class="service-card-blurb">{{ svc.introBlurb }}</p>
          <p v-else class="service-card-blurb">{{ defaultBlurb(svc.serviceType) }}</p>
          <span class="service-card-cta">Browse providers &rarr;</span>
        </button>
      </div>

      <section class="hub-trust">
        <div class="trust-item">
          <svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
          <span>Vetted providers</span>
        </div>
        <div class="trust-item">
          <svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          <span>Flexible scheduling</span>
        </div>
        <div class="trust-item">
          <svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
          <span>Easy online booking</span>
        </div>
        <div class="trust-item">
          <svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
          <span>Secure &amp; confidential</span>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();

const slug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);

const loading = ref(false);
const error = ref('');
const agency = ref({ name: '', logoUrl: null });
const serviceTypes = ref([]);

const CounselingIcon = {
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svc-icon">
    <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>`
};

const TutoringIcon = {
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svc-icon">
    <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
  </svg>`
};

const DefaultIcon = {
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svc-icon">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
  </svg>`
};

function iconForType(serviceType) {
  if (serviceType === 'counseling') return CounselingIcon;
  if (serviceType === 'tutoring') return TutoringIcon;
  return DefaultIcon;
}

function defaultBlurb(serviceType) {
  if (serviceType === 'counseling') return 'Browse licensed therapists and counselors. View availability, specialties, and request an appointment online.';
  if (serviceType === 'tutoring') return 'Find the right tutor for your student. Filter by subject, grade level, and schedule to book a session that fits.';
  return 'Browse available providers and book a session online.';
}

function navigate(serviceType) {
  if (!slug.value) return;
  const s = slug.value;
  if (serviceType === 'counseling') {
    router.push(`/${s}/find-counselor`);
  } else if (serviceType === 'tutoring') {
    router.push(`/${s}/find-tutor`);
  }
}

async function load() {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/agency-services/${encodeURIComponent(slug.value)}`, { skipAuthRedirect: true });
    agency.value = res.data?.agency || { name: '', logoUrl: null };
    serviceTypes.value = Array.isArray(res.data?.serviceTypes) ? res.data.serviceTypes : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load agency services.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.services-hub {
  --hub-p: var(--agency-primary-color, #4338ca);
  --hub-a: var(--agency-accent-color, #6366f1);
  min-height: 100vh;
  background: #f8f9fa;
  font-family: var(--agency-font-family, system-ui, -apple-system, sans-serif);
}

/* Header */
.hub-header {
  background: linear-gradient(135deg, var(--hub-p) 0%, color-mix(in srgb, var(--hub-p) 55%, white) 100%);
  padding: 2rem 1.5rem;
}
.hub-header-inner {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
.agency-logo {
  height: 56px;
  width: auto;
  object-fit: contain;
}
.hub-headline h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.25rem;
}
.hub-tagline {
  color: rgba(255,255,255,0.85);
  margin: 0;
  font-size: 0.975rem;
}

/* Loading / error */
.hub-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem;
  color: #6b7280;
}
.spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid #e5e7eb;
  border-top-color: var(--agency-primary-color, #6366f1);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.hub-error { padding: 3rem; text-align: center; color: #dc2626; }
.hub-empty { padding: 3rem; text-align: center; color: #6b7280; }

/* Main */
.hub-main {
  max-width: 960px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

/* Service cards */
.service-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}
.service-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  background: #fff;
  border: 2px solid transparent;
  border-radius: 1rem;
  padding: 2rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
}
.service-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.1);
}
.service-card--counseling:hover { border-color: #5a7a6e; }
.service-card--tutoring:hover { border-color: #1e3a5f; }

.service-card-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.service-card--counseling .service-card-icon { background: #e8f4f0; color: #3d6b5f; }
.service-card--tutoring .service-card-icon { background: #e8eef7; color: #1e3a5f; }
:deep(.svc-icon) {
  width: 1.75rem;
  height: 1.75rem;
}

.service-card-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}
.service-card-blurb {
  font-size: 0.9rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
  flex: 1;
}
.service-card-cta {
  font-size: 0.9rem;
  font-weight: 600;
  margin-top: 0.5rem;
}
.service-card--counseling .service-card-cta { color: #3d6b5f; }
.service-card--tutoring .service-card-cta { color: #1e3a5f; }

/* Trust bar */
.hub-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  justify-content: center;
  padding: 2rem;
  background: #fff;
  border-radius: 1rem;
  border: 1px solid #e5e7eb;
}
.trust-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
  font-weight: 500;
}
.trust-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: rgba(255,255,255,0.8);
}

@media (max-width: 600px) {
  .hub-header-inner { flex-direction: column; align-items: flex-start; }
  .hub-main { padding: 2rem 1rem; }
  .service-cards { grid-template-columns: 1fr; }
}
</style>
