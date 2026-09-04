<template>
  <div class="srf-page" :style="themeVars">
    <header class="srf-header">
      <div class="srf-brand">
        <img v-if="headerLogo" :src="headerLogo" alt="" class="srf-brand-logo" />
        <span class="srf-brand-title">Digital Enrollment Packet</span>
      </div>
      <div class="srf-header-actions">
        <button type="button" class="srf-link-btn" @click="openSupportModal('help')">
          <span class="srf-help-icon" aria-hidden="true">?</span>
          Help
        </button>
      </div>
    </header>

    <section class="srf-hero">
      <div class="srf-hero-copy">
        <h1>Find Your School</h1>
        <p>Search for your school to begin a Digital Enrollment Packet.</p>
        <div class="srf-search-wrap">
          <span class="srf-search-icon" aria-hidden="true">⌕</span>
          <input
            v-model="query"
            type="search"
            class="srf-search"
            placeholder="Search by school name..."
            autocomplete="off"
          />
        </div>
        <p class="srf-search-hint">
          Start typing to see results. You can also browse by district or alphabetically.
        </p>
      </div>
      <div class="srf-hero-art" aria-hidden="true">
        <img :src="heroArt" alt="" />
      </div>
    </section>

    <div v-if="loadError" class="srf-error">{{ loadError }}</div>
    <div v-else-if="loading" class="srf-loading">Loading schools…</div>

    <div v-else class="srf-body">
      <aside class="srf-sidebar">
        <div class="srf-panel">
          <h2>Browse by District</h2>
          <button
            type="button"
            class="srf-district"
            :class="{ active: !selectedDistrict }"
            @click="selectedDistrict = ''"
          >
            <span>All Districts</span>
            <span class="srf-count">{{ schools.length }}</span>
          </button>
          <button
            v-for="d in districts"
            :key="d.districtName"
            type="button"
            class="srf-district"
            :class="{ active: selectedDistrict === d.districtName }"
            @click="selectedDistrict = d.districtName"
          >
            <span>{{ d.districtName }}</span>
            <span class="srf-count">{{ d.schoolCount }}</span>
          </button>
        </div>

        <div class="srf-panel">
          <h2>Browse Alphabetically</h2>
          <div class="srf-letters">
            <button
              type="button"
              class="srf-letter"
              :class="{ active: !selectedLetter }"
              @click="selectedLetter = ''"
            >
              All
            </button>
            <button
              v-for="letter in alphabet"
              :key="letter"
              type="button"
              class="srf-letter"
              :class="{ active: selectedLetter === letter, muted: !lettersWithSchools.has(letter) }"
              :disabled="!lettersWithSchools.has(letter)"
              @click="selectedLetter = letter"
            >
              {{ letter }}
            </button>
          </div>
        </div>

        <div v-if="contactPhone || contactEmail" class="srf-panel srf-contact-panel">
          <h2>Contact</h2>
          <a v-if="contactPhone" class="srf-contact-line" :href="contactTel">{{ contactPhone }}</a>
          <a v-if="contactEmail" class="srf-contact-line" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
        </div>
      </aside>

      <main class="srf-main">
        <div class="srf-main-head">
          <h2>{{ listTitle }}</h2>
          <div class="srf-filters">
            <select v-model="selectedDistrict" class="srf-select">
              <option value="">All Districts</option>
              <option v-for="d in districts" :key="`sel-${d.districtName}`" :value="d.districtName">
                {{ d.districtName }}
              </option>
            </select>
            <select v-model="sortMode" class="srf-select">
              <option value="az">Sort A-Z</option>
              <option value="za">Sort Z-A</option>
            </select>
          </div>
        </div>

        <div v-if="!filteredSchools.length" class="srf-empty">
          No schools match your search. Try another name or clear filters.
        </div>

        <div v-else class="srf-table-wrap">
          <table class="srf-table">
            <thead>
              <tr>
                <th>School</th>
                <th>District</th>
                <th>Location</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="school in filteredSchools" :key="school.id">
                <td>
                  <div class="srf-school-cell">
                    <div class="srf-school-badge" aria-hidden="true">
                      <img v-if="school.logoUrl" :src="school.logoUrl" alt="" />
                      <span v-else>{{ initialsFor(school.name) }}</span>
                    </div>
                    <strong>{{ school.name }}</strong>
                  </div>
                </td>
                <td>{{ school.district || '—' }}</td>
                <td>{{ school.location || '—' }}</td>
                <td class="srf-actions-cell">
                  <a v-if="intakeUrlFor(school)" class="srf-start-btn" :href="intakeUrlFor(school)">
                    Start Referral
                    <span aria-hidden="true">→</span>
                  </a>
                  <span v-else class="srf-unavailable">Contact to start</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="srf-footer">
          <div class="srf-footer-note">
            <span class="srf-info-icon" aria-hidden="true">i</span>
            <span>Don’t see your school? Contact us for assistance or check back later.</span>
          </div>
          <button type="button" class="srf-contact-support" @click="openSupportModal('want')">
            Contact Support
          </button>
        </footer>
      </main>
    </div>

    <div v-if="showSupportModal" class="srf-modal-backdrop" @click.self="closeSupportModal">
      <div class="srf-modal" role="dialog" aria-modal="true" aria-labelledby="srf-support-title">
        <h3 id="srf-support-title">{{ supportModalTitle }}</h3>
        <p class="srf-modal-sub">{{ supportModalSubtitle }}</p>
        <form class="srf-form" @submit.prevent="submitSupport">
          <input
            v-model="supportForm.website"
            type="text"
            class="srf-honeypot"
            tabindex="-1"
            autocomplete="off"
            aria-hidden="true"
          />
          <label>
            Your name
            <input v-model.trim="supportForm.name" type="text" required maxlength="120" />
          </label>
          <label>
            Email
            <input v-model.trim="supportForm.email" type="email" required maxlength="255" />
          </label>
          <label>
            Message
            <textarea v-model.trim="supportForm.message" rows="4" required maxlength="4000" />
          </label>
          <p v-if="supportError" class="srf-error">{{ supportError }}</p>
          <p v-if="supportSuccess" class="srf-success">{{ supportSuccess }}</p>
          <div class="srf-modal-actions">
            <button type="button" class="srf-btn-secondary" @click="closeSupportModal">Cancel</button>
            <button type="submit" class="srf-btn-primary" :disabled="supportSending">
              {{ supportSending ? 'Sending…' : 'Send message' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import {
  resolveSchoolOnboardingSupportEmail,
  resolveSchoolOnboardingSupportPhone
} from '../../utils/schoolGroupEmailSuggestions';
import { resolvePortalSlug } from '../../utils/orgScopedPath';
import { useBrandingStore } from '../../store/branding';
import schoolLogoGreen from '../../assets/schoolReferral/school-logo-green.png';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const route = useRoute();
const brandingStore = useBrandingStore();
const agencySlug = computed(() =>
  resolvePortalSlug(route.params, brandingStore.portalHostPortalUrl)
);

const loading = ref(true);
const loadError = ref('');
const agency = ref(null);
const schools = ref([]);
const districts = ref([]);

const query = ref('');
const selectedDistrict = ref('');
const selectedLetter = ref('');
const sortMode = ref('az');

const showSupportModal = ref(false);
const supportMode = ref('want');
const supportSending = ref(false);
const supportError = ref('');
const supportSuccess = ref('');
const supportForm = reactive({
  name: '',
  email: '',
  message: '',
  website: ''
});

const isItsco = computed(() => agencySlug.value === 'itsco' || String(agency.value?.slug || '').toLowerCase() === 'itsco');

const branding = computed(() => agency.value?.branding || {});
const palette = computed(() => branding.value?.colorPalette || {});

const themeVars = computed(() => {
  const primary = palette.value.primary || '#1f6b4a';
  const secondary = palette.value.secondary || '#0f766e';
  const accent = palette.value.accent || '#14b8a6';
  const bg = palette.value.backgroundColor || '#f7faf8';
  const text = palette.value.textPrimary || '#0f172a';
  return {
    '--srf-primary': primary,
    '--srf-primary-soft': `${primary}18`,
    '--srf-secondary': secondary,
    '--srf-accent': accent,
    '--srf-bg': bg,
    '--srf-text': text,
    '--srf-muted': palette.value.textMuted || '#64748b',
    '--srf-border': palette.value.dividerColor || '#dce8e2'
  };
});

const headerLogo = computed(() => {
  if (isItsco.value) return schoolLogoGreen;
  return branding.value?.logoUrl || branding.value?.agencyLogoUrl || schoolLogoGreen;
});

const heroArt = computed(() => schoolLogoGreen);

const contactPhoneInfo = computed(() =>
  resolveSchoolOnboardingSupportPhone({
    slug: agency.value?.slug || agencySlug.value,
    phone: agency.value?.phone,
    phone_number: agency.value?.phone,
    phoneExtension: agency.value?.phoneExtension,
    phone_extension: agency.value?.phoneExtension
  })
);
const contactPhone = computed(() => contactPhoneInfo.value?.display || '');
const contactTel = computed(() => {
  const tel = contactPhoneInfo.value?.tel || '';
  return tel ? `tel:${tel}` : '';
});
const contactEmail = computed(() =>
  resolveSchoolOnboardingSupportEmail({
    slug: agency.value?.slug || agencySlug.value,
    supportEmail: agency.value?.supportEmail,
    onboarding_team_email: agency.value?.supportEmail
  })
);

const wantSubject = computed(() => {
  const name = String(agency.value?.name || 'our team').trim();
  if (isItsco.value) return 'We Want ITSCO';
  return `We Want ${name}`;
});

const supportModalTitle = computed(() =>
  supportMode.value === 'want' ? 'Contact Support' : 'Need help?'
);
const supportModalSubtitle = computed(() =>
  supportMode.value === 'want'
    ? `Send a message to ${agency.value?.name || 'our team'}. Subject: ${wantSubject.value}`
    : 'Tell us what you need and we will get back to you.'
);

const lettersWithSchools = computed(() => {
  const set = new Set();
  for (const s of schools.value) {
    const ch = String(s.name || '').trim().charAt(0).toUpperCase();
    if (ch >= 'A' && ch <= 'Z') set.add(ch);
  }
  return set;
});

const filteredSchools = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = schools.value.slice();
  if (selectedDistrict.value) {
    list = list.filter((s) => s.district === selectedDistrict.value);
  }
  if (selectedLetter.value) {
    list = list.filter((s) => String(s.name || '').trim().charAt(0).toUpperCase() === selectedLetter.value);
  }
  if (q) {
    list = list.filter((s) => {
      const hay = `${s.name || ''} ${s.district || ''} ${s.location || ''} ${s.city || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  list.sort((a, b) => {
    const cmp = String(a.name || '').localeCompare(String(b.name || ''));
    return sortMode.value === 'za' ? -cmp : cmp;
  });
  return list;
});

const listTitle = computed(() => {
  if (selectedDistrict.value) return `${selectedDistrict.value} (${filteredSchools.value.length})`;
  if (selectedLetter.value) return `Schools · ${selectedLetter.value} (${filteredSchools.value.length})`;
  if (query.value.trim()) return `Search results (${filteredSchools.value.length})`;
  return `All Schools (${filteredSchools.value.length})`;
});

function initialsFor(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function intakeUrlFor(school) {
  return buildPublicIntakeUrl(school?.intakePublicKey);
}

function openSupportModal(mode = 'want') {
  supportMode.value = mode;
  supportError.value = '';
  supportSuccess.value = '';
  showSupportModal.value = true;
}

function closeSupportModal() {
  showSupportModal.value = false;
}

async function submitSupport() {
  supportError.value = '';
  supportSuccess.value = '';
  supportSending.value = true;
  try {
    await api.post(`/public/school-referral/${encodeURIComponent(agencySlug.value)}/support-tickets`, {
      name: supportForm.name,
      email: supportForm.email,
      message: supportForm.message,
      website: supportForm.website,
      subject: supportMode.value === 'want' ? wantSubject.value : undefined,
      sourceKey: 'public_school_referral'
    });
    supportSuccess.value = 'Thanks — your message was sent. We will follow up by email.';
    supportForm.message = '';
    setTimeout(() => {
      closeSupportModal();
      supportSuccess.value = '';
    }, 2200);
  } catch (e) {
    supportError.value = e?.response?.data?.error?.message || 'Failed to send message. Please try again.';
  } finally {
    supportSending.value = false;
  }
}

async function loadDirectory() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`/public/school-referral/${encodeURIComponent(agencySlug.value)}`);
    agency.value = res.data?.agency || null;
    schools.value = Array.isArray(res.data?.schools) ? res.data.schools : [];
    districts.value = Array.isArray(res.data?.districts) ? res.data.districts : [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load school directory';
    agency.value = null;
    schools.value = [];
    districts.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadDirectory);
</script>

<style scoped>
.srf-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #ffffff 0%, var(--srf-bg, #f7faf8) 42%, #e8f3ee 100%);
  color: var(--srf-text, #0f172a);
  font-family: 'Segoe UI', 'Avenir Next', 'Helvetica Neue', sans-serif;
}

.srf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 28px;
  border-bottom: 1px solid var(--srf-border, #e2e8f0);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 20;
}

.srf-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.srf-brand-logo {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.srf-brand-title {
  font-size: 1.05rem;
}

.srf-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--srf-muted, #64748b);
  font-weight: 600;
  cursor: pointer;
}

.srf-help-icon {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1.5px solid currentColor;
  display: inline-grid;
  place-items: center;
  font-size: 12px;
}

.srf-hero {
  display: grid;
  grid-template-columns: 1.3fr 0.9fr;
  gap: 24px;
  align-items: center;
  padding: 36px 28px 18px;
  max-width: 1200px;
  margin: 0 auto;
}

.srf-hero h1 {
  margin: 0 0 8px;
  font-size: clamp(2rem, 4vw, 3rem);
  letter-spacing: -0.03em;
  color: var(--srf-primary, #1f6b4a);
}

.srf-hero p {
  margin: 0 0 18px;
  color: var(--srf-muted, #64748b);
}

.srf-search-wrap {
  position: relative;
}

.srf-search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--srf-muted, #64748b);
  font-size: 1.1rem;
}

.srf-search {
  width: 100%;
  border: 1px solid var(--srf-border, #e2e8f0);
  border-radius: 999px;
  padding: 14px 18px 14px 42px;
  font-size: 1rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  outline: none;
}

.srf-search:focus {
  border-color: var(--srf-primary, #1f6b4a);
  box-shadow: 0 0 0 4px var(--srf-primary-soft, rgba(29, 78, 216, 0.12));
}

.srf-search-hint {
  margin-top: 10px !important;
  font-size: 0.9rem;
}

.srf-hero-art {
  display: flex;
  justify-content: center;
}

.srf-hero-art img {
  width: min(320px, 100%);
  max-height: 260px;
  object-fit: contain;
  filter: drop-shadow(0 18px 30px rgba(31, 107, 74, 0.18));
}

.srf-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 28px 40px;
}

.srf-panel {
  background: #fff;
  border: 1px solid var(--srf-border, #e2e8f0);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 14px;
}

.srf-panel h2 {
  margin: 0 0 12px;
  font-size: 0.95rem;
}

.srf-district {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: none;
  background: transparent;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: inherit;
}

.srf-district.active,
.srf-district:hover {
  background: var(--srf-primary-soft, rgba(29, 78, 216, 0.12));
  color: var(--srf-primary, #1f6b4a);
}

.srf-count {
  color: var(--srf-muted, #64748b);
  font-size: 0.85rem;
}

.srf-letters {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.srf-letter {
  border: 1px solid var(--srf-border, #e2e8f0);
  background: #fff;
  border-radius: 999px;
  height: 34px;
  cursor: pointer;
  font-weight: 600;
  color: inherit;
}

.srf-letter.active {
  background: var(--srf-primary, #1f6b4a);
  border-color: var(--srf-primary, #1f6b4a);
  color: #fff;
}

.srf-letter.muted {
  opacity: 0.35;
  cursor: not-allowed;
}

.srf-contact-panel .srf-contact-line {
  display: block;
  color: var(--srf-primary, #1f6b4a);
  text-decoration: none;
  margin-bottom: 8px;
  font-weight: 600;
}

.srf-main-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.srf-main-head h2 {
  margin: 0;
  font-size: 1.15rem;
}

.srf-filters {
  display: flex;
  gap: 8px;
}

.srf-select {
  border: 1px solid var(--srf-border, #e2e8f0);
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
}

.srf-table-wrap {
  background: #fff;
  border: 1px solid var(--srf-border, #e2e8f0);
  border-radius: 16px;
  overflow: hidden;
}

.srf-table {
  width: 100%;
  border-collapse: collapse;
}

.srf-table th,
.srf-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--srf-border, #e2e8f0);
  text-align: left;
  vertical-align: middle;
}

.srf-table th {
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--srf-muted, #64748b);
  background: #f8fafc;
}

.srf-school-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.srf-school-badge {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--srf-primary-soft, rgba(29, 78, 216, 0.12));
  color: var(--srf-primary, #1f6b4a);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 700;
  flex: 0 0 auto;
}

.srf-school-badge img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.srf-actions-cell {
  text-align: right;
}

.srf-start-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--srf-primary, #1f6b4a);
  color: #fff;
  text-decoration: none;
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 700;
  white-space: nowrap;
}

.srf-start-btn:hover {
  filter: brightness(1.05);
}

.srf-unavailable {
  color: var(--srf-muted, #64748b);
  font-size: 0.82rem;
  font-weight: 600;
}

.srf-footer {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.srf-footer-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  color: var(--srf-muted, #64748b);
  font-size: 0.92rem;
}

.srf-info-icon {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--srf-primary, #1f6b4a);
  color: #fff;
  display: inline-grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  flex: 0 0 auto;
}

.srf-contact-support {
  border: 1px solid var(--srf-border, #e2e8f0);
  background: #fff;
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
}

.srf-loading,
.srf-empty,
.srf-error {
  max-width: 1200px;
  margin: 16px auto;
  padding: 0 28px;
}

.srf-error {
  color: #b91c1c;
}

.srf-success {
  color: #047857;
}

.srf-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
  padding: 16px;
}

.srf-modal {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
}

.srf-modal h3 {
  margin: 0 0 6px;
}

.srf-modal-sub {
  margin: 0 0 16px;
  color: var(--srf-muted, #64748b);
  font-size: 0.92rem;
}

.srf-form {
  display: grid;
  gap: 12px;
}

.srf-form label {
  display: grid;
  gap: 6px;
  font-size: 0.9rem;
  font-weight: 600;
}

.srf-form input,
.srf-form textarea {
  border: 1px solid var(--srf-border, #e2e8f0);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.srf-honeypot {
  position: absolute;
  left: -9999px;
  opacity: 0;
  height: 0;
  width: 0;
}

.srf-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.srf-btn-primary,
.srf-btn-secondary {
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}

.srf-btn-primary {
  border: none;
  background: var(--srf-primary, #1f6b4a);
  color: #fff;
}

.srf-btn-secondary {
  border: 1px solid var(--srf-border, #e2e8f0);
  background: #fff;
}

@media (max-width: 900px) {
  .srf-hero,
  .srf-body {
    grid-template-columns: 1fr;
  }

  .srf-hero-art {
    order: -1;
  }

  .srf-body {
    padding: 8px 14px calc(28px + env(safe-area-inset-bottom, 0px));
  }

  .srf-page {
    overflow-x: hidden;
  }

  .srf-table-wrap {
    overflow: visible;
    border: 0;
    background: transparent;
  }

  .srf-table,
  .srf-table thead,
  .srf-table tbody,
  .srf-table tr,
  .srf-table th,
  .srf-table td {
    display: block;
    width: 100%;
  }

  .srf-table thead {
    display: none;
  }

  .srf-table tbody {
    display: grid;
    gap: 10px;
  }

  .srf-table tr {
    background: #fff;
    border: 1px solid var(--srf-border, #e2e8f0);
    border-radius: 14px;
    padding: 12px;
    box-sizing: border-box;
  }

  .srf-table td {
    padding: 0;
    border: 0;
  }

  .srf-table td:nth-child(2) {
    margin-top: 6px;
    color: var(--srf-muted, #64748b);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .srf-table th:nth-child(3),
  .srf-table td:nth-child(3) {
    display: none;
  }

  .srf-actions-cell {
    text-align: left;
    margin-top: 12px;
  }

  .srf-start-btn {
    width: 100%;
    justify-content: center;
    min-height: 44px;
    box-sizing: border-box;
  }

  .srf-school-cell {
    align-items: flex-start;
  }
}
</style>
