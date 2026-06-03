<template>
  <div class="public-services-admin container">
    <div class="page-header">
      <div>
        <h1>Public Services &amp; Booking</h1>
        <p class="subtitle">Configure which booking finders are active on your public portal pages.</p>
      </div>
      <div class="page-actions">
        <a v-if="agencySlug" :href="`/${agencySlug}/services`" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
          Preview public hub &rarr;
        </a>
      </div>
    </div>

    <div v-if="loading" class="card">
      <div class="loading">Loading…</div>
    </div>
    <div v-else-if="error" class="card error">{{ error }}</div>

    <template v-else>
      <!-- Status bar -->
      <div class="card status-bar">
        <div class="status-item">
          <span class="status-dot" :class="publicBookingEnabled ? 'dot--on' : 'dot--off'" />
          <span>Public booking is <strong>{{ publicBookingEnabled ? 'enabled' : 'disabled' }}</strong> for this agency</span>
        </div>
        <div v-if="!publicBookingEnabled" class="status-note">
          Enable "Public Availability" in the provider portal settings or contact support to activate public booking.
        </div>
      </div>

      <!-- Service type cards -->
      <div v-if="saveSuccess" class="success-banner">{{ saveSuccess }}</div>
      <div v-if="saveError" class="error-banner">{{ saveError }}</div>

      <div class="service-type-list">
        <div
          v-for="svc in serviceTypeConfigs"
          :key="svc.serviceType"
          class="card service-type-card"
          :class="{ 'service-type-card--active': svc.isEnabled }"
        >
          <div class="stc-header">
            <div class="stc-header-left">
              <div class="stc-icon" :class="`stc-icon--${svc.serviceType}`">
                <svg v-if="svc.serviceType === 'counseling'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" /></svg>
              </div>
              <div>
                <h3>{{ svc.serviceType === 'counseling' ? 'Counseling' : 'Tutoring' }}</h3>
                <p class="stc-type-label">{{ svc.serviceType === 'counseling' ? 'Find a Counselor' : 'Find a Tutor' }} finder page</p>
              </div>
            </div>
            <div class="stc-header-right">
              <label class="toggle-switch" :title="svc.isEnabled ? 'Disable this service' : 'Enable this service'">
                <input type="checkbox" v-model="svc.isEnabled" @change="saveServiceType(svc)" :disabled="saving" />
                <span class="toggle-slider" />
              </label>
              <span class="toggle-label">{{ svc.isEnabled ? 'Enabled' : 'Disabled' }}</span>
            </div>
          </div>

          <div v-if="svc.isEnabled" class="stc-body">
            <div class="form-row">
              <div class="form-group">
                <label>Display name <span class="hint">(shown on the hub page button)</span></label>
                <input v-model="svc.displayName" type="text" :placeholder="svc.serviceType === 'counseling' ? 'Find a Counselor' : 'Find a Tutor'" />
              </div>
              <div class="form-group">
                <label>Sort order</label>
                <input v-model.number="svc.sortOrder" type="number" min="0" step="1" />
              </div>
            </div>
            <div class="form-group">
              <label>Intro blurb <span class="hint">(shown at top of finder page)</span></label>
              <textarea v-model="svc.introBlurb" rows="3" :placeholder="`A short introduction shown at the top of the ${svc.serviceType} finder…`" />
            </div>
            <div class="form-group">
              <label>Hero image URL <span class="hint">(optional banner for finder page)</span></label>
              <input v-model="svc.heroImageUrl" type="url" placeholder="https://…" />
            </div>
            <div class="stc-actions">
              <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveServiceType(svc)">
                {{ saving ? 'Saving…' : 'Save' }}
              </button>
              <a v-if="agencySlug" :href="`/${agencySlug}/find-${svc.serviceType === 'counseling' ? 'counselor' : 'tutor'}`" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
                Preview &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Enrolled providers quick count -->
      <div class="card enrollment-summary">
        <h3>Provider enrollment summary</h3>
        <p class="subtitle">Providers enrolled in each public finder. Manage individual enrollments from each provider's Profile Info tab → Public Listings section.</p>
        <div class="enrollment-grid">
          <div v-for="svc in enrollmentCounts" :key="svc.serviceType" class="enrollment-item">
            <strong>{{ svc.count }}</strong>
            <span>{{ svc.serviceType === 'counseling' ? 'Counselor(s)' : 'Tutor(s)' }} enrolled</span>
            <span v-if="svc.serviceType === 'counseling'">
              <a :href="`/${agencySlug}/find-counselor`" target="_blank" class="enrollment-link">View public page</a>
            </span>
            <span v-else>
              <a :href="`/${agencySlug}/find-tutor`" target="_blank" class="enrollment-link">View public page</a>
            </span>
          </div>
        </div>
      </div>

      <!-- Public link share -->
      <div class="card">
        <h3>Share your booking hub</h3>
        <p class="subtitle">Share this link with clients so they can browse and book directly.</p>
        <div class="share-row">
          <input type="text" :value="hubUrl" readonly class="share-input" @click="copyHubUrl" />
          <button class="btn btn-secondary" @click="copyHubUrl">{{ copied ? 'Copied!' : 'Copy link' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const agencyStore = useAgencyStore();

const agencySlug = computed(() =>
  String(route.params.organizationSlug || agencyStore.currentAgency?.slug || '').trim()
);

const loading = ref(false);
const error = ref('');
const saving = ref(false);
const saveSuccess = ref('');
const saveError = ref('');
const copied = ref(false);
const publicBookingEnabled = ref(false);

const SERVICE_TYPE_DEFS = ['counseling', 'tutoring'];

const serviceTypeConfigs = ref(
  SERVICE_TYPE_DEFS.map((serviceType) => ({
    serviceType,
    isEnabled: false,
    displayName: '',
    introBlurb: '',
    heroImageUrl: '',
    sortOrder: SERVICE_TYPE_DEFS.indexOf(serviceType)
  }))
);

const enrollmentCounts = ref(
  SERVICE_TYPE_DEFS.map((serviceType) => ({ serviceType, count: 0 }))
);

const hubUrl = computed(() => {
  if (!agencySlug.value) return '';
  return `${window.location.origin}/${agencySlug.value}/services`;
});

async function load() {
  if (!agencySlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [hubRes, ...enrollRes] = await Promise.all([
      api.get(`/public/agency-services/${encodeURIComponent(agencySlug.value)}`, { skipAuthRedirect: true }).catch(() => null),
      ...SERVICE_TYPE_DEFS.map((st) =>
        api.get(`/public/agency-services/${encodeURIComponent(agencySlug.value)}/enrollment?serviceType=${st}`, { skipAuthRedirect: true }).catch(() => null)
      )
    ]);

    // Hub + service types
    const existingTypes = hubRes?.data?.serviceTypes || [];
    publicBookingEnabled.value = !!hubRes?.data;

    for (const svc of serviceTypeConfigs.value) {
      const existing = existingTypes.find((st) => st.serviceType === svc.serviceType);
      if (existing) {
        svc.isEnabled = true;
        svc.displayName = existing.displayName || '';
        svc.introBlurb = existing.introBlurb || '';
        svc.heroImageUrl = existing.heroImageUrl || '';
        svc.sortOrder = existing.sortOrder ?? SERVICE_TYPE_DEFS.indexOf(svc.serviceType);
      }
    }

    // Enrollment counts
    enrollRes.forEach((res, idx) => {
      const enrollments = res?.data?.enrollments || [];
      enrollmentCounts.value[idx].count = enrollments.filter((e) => e.is_active).length;
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load settings.';
  } finally {
    loading.value = false;
  }
}

async function saveServiceType(svc) {
  saving.value = true;
  saveSuccess.value = '';
  saveError.value = '';
  try {
    if (!agencySlug.value) throw new Error('No agency selected');
    await api.post(
      `/public/agency-services/${encodeURIComponent(agencySlug.value)}/service-types`,
      {
        serviceType: svc.serviceType,
        displayName: svc.displayName || null,
        introBlurb: svc.introBlurb || null,
        heroImageUrl: svc.heroImageUrl || null,
        isEnabled: svc.isEnabled,
        sortOrder: svc.sortOrder ?? 0
      },
      { skipAuthRedirect: true }
    );
    saveSuccess.value = 'Settings saved.';
    setTimeout(() => (saveSuccess.value = ''), 3000);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save settings.';
  } finally {
    saving.value = false;
  }
}

async function copyHubUrl() {
  if (!hubUrl.value) return;
  try {
    await navigator.clipboard.writeText(hubUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // fallback — select text
  }
}

onMounted(load);
</script>

<style scoped>
.public-services-admin {
  padding: 1.5rem;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.page-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 700; }
.subtitle { color: var(--text-secondary, #6b7280); font-size: 0.875rem; margin: 0; }

.card {
  background: var(--bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 0.875rem;
  padding: 1.25rem;
}

.loading { color: var(--text-secondary, #6b7280); font-size: 0.875rem; }
.error { color: #dc2626; font-size: 0.875rem; }
.success-banner { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; border-radius: 0.5rem; padding: 0.625rem 1rem; font-size: 0.875rem; }
.error-banner { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 0.5rem; padding: 0.625rem 1rem; font-size: 0.875rem; }

/* Status bar */
.status-bar { padding: 0.875rem 1.25rem; }
.status-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; }
.dot--on { background: #16a34a; }
.dot--off { background: #9ca3af; }
.status-note { font-size: 0.8rem; color: #9ca3af; margin-top: 0.35rem; }

/* Service type list */
.service-type-list { display: flex; flex-direction: column; gap: 1rem; }
.service-type-card { transition: border-color 0.15s; }
.service-type-card--active { border-color: #6366f1; }

.stc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.stc-header-left { display: flex; align-items: center; gap: 0.875rem; }
.stc-icon {
  width: 2.75rem; height: 2.75rem;
  border-radius: 0.625rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stc-icon svg { width: 1.375rem; height: 1.375rem; }
.stc-icon--counseling { background: #e8f4f0; color: #3d6b5f; }
.stc-icon--tutoring { background: #eff6ff; color: #1e3a5f; }
.stc-header h3 { font-size: 1rem; font-weight: 700; margin: 0 0 0.15rem; }
.stc-type-label { font-size: 0.8rem; color: #9ca3af; margin: 0; }
.stc-header-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.toggle-label { font-size: 0.8125rem; color: #6b7280; }

/* Toggle switch */
.toggle-switch { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
.toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-slider {
  width: 2.5rem; height: 1.375rem;
  background: #d1d5db;
  border-radius: 1rem;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-slider::after {
  content: '';
  position: absolute;
  width: 1rem; height: 1rem;
  background: #fff;
  border-radius: 50%;
  top: 3px; left: 3px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-switch input:checked + .toggle-slider { background: #6366f1; }
.toggle-switch input:checked + .toggle-slider::after { transform: translateX(1.125rem); }

/* Form */
.stc-body { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #f3f4f6; display: flex; flex-direction: column; gap: 0.875rem; }
.form-row { display: grid; grid-template-columns: 1fr auto; gap: 0.75rem; align-items: end; }
.form-group { display: flex; flex-direction: column; gap: 0.3rem; }
.form-group label { font-size: 0.8125rem; font-weight: 500; color: #374151; }
.hint { font-size: 0.75rem; font-weight: 400; color: #9ca3af; }
.form-group input, .form-group textarea {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.form-group input:focus, .form-group textarea:focus { border-color: #6366f1; }
.stc-actions { display: flex; gap: 0.5rem; }

/* Enrollment summary */
.enrollment-summary h3 { font-size: 1rem; font-weight: 700; margin: 0 0 0.35rem; }
.enrollment-grid { display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 0.875rem; }
.enrollment-item { display: flex; flex-direction: column; gap: 0.2rem; }
.enrollment-item strong { font-size: 1.75rem; font-weight: 800; color: #111827; line-height: 1; }
.enrollment-item span { font-size: 0.8125rem; color: #6b7280; }
.enrollment-link { color: #6366f1; text-decoration: none; font-size: 0.75rem; }
.enrollment-link:hover { text-decoration: underline; }

/* Share */
.share-row { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.share-input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: #f9fafb;
  outline: none;
  cursor: pointer;
  color: #374151;
}

/* Buttons */
.btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: none; text-decoration: none; display: inline-flex; align-items: center; }
.btn-primary { background: #4338ca; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #3730a3; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #fff; border: 1px solid #e5e7eb; color: #374151; }
.btn-secondary:hover { border-color: #d1d5db; background: #f9fafb; }
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
</style>
