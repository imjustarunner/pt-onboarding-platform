<template>
  <div class="pds-page" :style="themeVars">
    <header class="pds-header pds-no-print">
      <div class="pds-brand">
        <img v-if="headerLogo" :src="headerLogo" alt="" class="pds-brand-logo" />
        <div>
          <div class="pds-brand-kicker">{{ agencyName }}</div>
          <div class="pds-brand-title">District schedule</div>
        </div>
      </div>
    </header>

    <section class="pds-hero">
      <div class="pds-hero-row">
        <div>
          <h1>{{ pageTitle }}</h1>
          <p v-if="districtName" class="pds-screen-only">
            {{ districtName }} — schools, providers, and on-site days
          </p>
          <p v-else class="pds-screen-only">Select a district to view provider schedules across all schools.</p>
          <p v-if="districtName" class="pds-print-only pds-print-sub">
            Providers · on-site days · federal fingerprint expiration
          </p>
        </div>
        <div v-if="districtSlug && schools.length" class="pds-toolbar pds-no-print">
          <button
            v-if="canHide && hiddenCount"
            type="button"
            class="pds-btn"
            @click="clearAllHides"
          >
            Show all ({{ hiddenCount }})
          </button>
          <button type="button" class="pds-btn" @click="printPage">Print</button>
        </div>
      </div>
      <p v-if="canHide && districtSlug" class="pds-hide-hint pds-no-print">
        Logged in: use Hide to remove a school or provider from this view and from print (testing). Does not change assignments.
      </p>
    </section>

    <div v-if="loadError" class="pds-banner pds-banner-error">{{ loadError }}</div>
    <div v-else-if="loading" class="pds-loading">Loading schedule…</div>

    <div v-else-if="!districtSlug" class="pds-body">
      <div class="pds-district-grid">
        <router-link
          v-for="d in districts"
          :key="d.slug"
          class="pds-district-card"
          :to="districtRoute(d.slug)"
        >
          <strong>{{ d.name }}</strong>
          <span>{{ d.schoolCount }} {{ d.schoolCount === 1 ? 'school' : 'schools' }}</span>
        </router-link>
      </div>
      <p v-if="!districts.length" class="pds-empty">No district schedules are published yet.</p>
    </div>

    <div v-else class="pds-body">
      <div v-if="!visibleSchools.length" class="pds-empty">
        {{ schools.length ? 'All schools are hidden.' : 'No schools found for this district.' }}
      </div>

      <table v-if="visibleSchools.length" class="pds-table">
        <thead>
          <tr>
            <th class="pds-col-school">School</th>
            <th class="pds-col-provider">Provider</th>
            <th class="pds-col-days">Days</th>
            <th class="pds-col-bg">Fingerprint expires</th>
            <th v-if="canHide" class="pds-col-actions pds-no-print"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="school in visibleSchools" :key="school.id">
            <tr
              v-if="!visibleProviders(school).length"
              class="pds-row pds-row--empty"
            >
              <td class="pds-col-school">
                <div class="pds-school-cell">
                  <span class="pds-school-name">{{ school.name }}</span>
                  <button
                    v-if="canHide"
                    type="button"
                    class="pds-hide-btn pds-no-print"
                    title="Hide school"
                    @click="hideSchool(school.id)"
                  >
                    Hide
                  </button>
                </div>
              </td>
              <td colspan="3" class="pds-muted">No providers scheduled</td>
              <td v-if="canHide" class="pds-no-print"></td>
            </tr>
            <tr
              v-for="(provider, idx) in visibleProviders(school)"
              :key="`${school.id}-${provider.id}`"
              class="pds-row"
            >
              <td class="pds-col-school">
                <div v-if="idx === 0" class="pds-school-cell">
                  <span class="pds-school-name">{{ school.name }}</span>
                  <button
                    v-if="canHide"
                    type="button"
                    class="pds-hide-btn pds-no-print"
                    title="Hide school"
                    @click="hideSchool(school.id)"
                  >
                    Hide
                  </button>
                </div>
              </td>
              <td class="pds-col-provider">{{ provider.displayName }}</td>
              <td class="pds-col-days">{{ formatDays(provider.days) }}</td>
              <td class="pds-col-bg" :class="bgExpiryClass(provider)">
                {{ formatBgExpiry(provider) }}
                <span
                  v-if="provider.federalBackgroundStatusLabel && provider.federalBackgroundExpiresAt"
                  class="pds-bg-status pds-screen-only"
                > · {{ provider.federalBackgroundStatusLabel }}</span>
              </td>
              <td v-if="canHide" class="pds-col-actions pds-no-print">
                <button
                  type="button"
                  class="pds-hide-btn"
                  title="Hide provider at this school"
                  @click="hideProvider(school.id, provider.id)"
                >
                  Hide
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div
        v-if="canHide && (hiddenSchools.length || hiddenProviders.length)"
        class="pds-hidden-panel pds-no-print"
      >
        <strong>Hidden</strong>
        <ul v-if="hiddenSchools.length">
          <li v-for="school in hiddenSchools" :key="`hs-${school.id}`">
            School: {{ school.name }}
            <button type="button" class="pds-link-btn" @click="unhideSchool(school.id)">Show</button>
          </li>
        </ul>
        <ul v-if="hiddenProviders.length">
          <li v-for="row in hiddenProviders" :key="`hp-${row.schoolId}-${row.providerId}`">
            {{ row.providerName }} @ {{ row.schoolName }}
            <button
              type="button"
              class="pds-link-btn"
              @click="unhideProvider(row.schoolId, row.providerId)"
            >Show</button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { resolvePortalSlug } from '../../utils/orgScopedPath';
import { useBrandingStore } from '../../store/branding';
import { useAuthStore } from '../../store/auth';
import schoolLogoGreen from '../../assets/schoolReferral/school-logo-green.png';

const route = useRoute();
const brandingStore = useBrandingStore();
const authStore = useAuthStore();

const agencySlug = computed(() =>
  resolvePortalSlug(route.params, brandingStore.portalHostPortalUrl)
);
const districtSlug = computed(() => String(route.params.districtSlug || '').trim().toLowerCase());

const loading = ref(true);
const loadError = ref('');
const agency = ref(null);
const district = ref(null);
const districts = ref([]);
const schools = ref([]);
const hiddenSchoolIds = ref(new Set());
const hiddenProviderKeys = ref(new Set());

const canHide = computed(() => !!authStore.isAuthenticated);
const agencyName = computed(() => agency.value?.name || 'School schedule');
const districtName = computed(() => district.value?.name || '');
const pageTitle = computed(() => districtName.value || 'Browse districts');
const isItsco = computed(() =>
  agencySlug.value === 'itsco' || String(agency.value?.slug || '').toLowerCase() === 'itsco'
);

const branding = computed(() => agency.value?.branding || {});
const palette = computed(() => branding.value?.colorPalette || {});

const themeVars = computed(() => {
  const primary = palette.value.primary || '#1f6b4a';
  const secondary = palette.value.secondary || '#0f766e';
  const accent = palette.value.accent || '#14b8a6';
  const bg = palette.value.backgroundColor || '#f7faf8';
  const text = palette.value.textPrimary || '#0f172a';
  return {
    '--pds-primary': primary,
    '--pds-primary-soft': `${primary}18`,
    '--pds-secondary': secondary,
    '--pds-accent': accent,
    '--pds-bg': bg,
    '--pds-text': text,
    '--pds-muted': palette.value.textMuted || '#64748b',
    '--pds-border': palette.value.dividerColor || '#dce8e2'
  };
});

const headerLogo = computed(() => {
  if (isItsco.value) return schoolLogoGreen;
  return branding.value?.logoUrl || branding.value?.agencyLogoUrl || schoolLogoGreen;
});

const hideStorageKey = computed(() => {
  const uid = authStore.user?.id || 'anon';
  return `district-schedule-hide:${uid}:${agencySlug.value}:${districtSlug.value}`;
});

const visibleSchools = computed(() =>
  (schools.value || []).filter((s) => !hiddenSchoolIds.value.has(Number(s.id)))
);

const hiddenSchools = computed(() =>
  (schools.value || []).filter((s) => hiddenSchoolIds.value.has(Number(s.id)))
);

const hiddenProviders = computed(() => {
  const out = [];
  for (const school of schools.value || []) {
    for (const provider of school.providers || []) {
      const key = providerHideKey(school.id, provider.id);
      if (!hiddenProviderKeys.value.has(key)) continue;
      out.push({
        schoolId: Number(school.id),
        providerId: Number(provider.id),
        schoolName: school.name,
        providerName: provider.displayName
      });
    }
  }
  return out;
});

const hiddenCount = computed(() => hiddenSchools.value.length + hiddenProviders.value.length);

function providerHideKey(schoolId, providerId) {
  return `${Number(schoolId)}:${Number(providerId)}`;
}

function visibleProviders(school) {
  return (school?.providers || []).filter(
    (p) => !hiddenProviderKeys.value.has(providerHideKey(school.id, p.id))
  );
}

function loadHideState() {
  hiddenSchoolIds.value = new Set();
  hiddenProviderKeys.value = new Set();
  if (!canHide.value || !districtSlug.value) return;
  try {
    const raw = localStorage.getItem(hideStorageKey.value);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    hiddenSchoolIds.value = new Set(
      (Array.isArray(parsed?.schools) ? parsed.schools : []).map(Number).filter(Boolean)
    );
    hiddenProviderKeys.value = new Set(
      (Array.isArray(parsed?.providers) ? parsed.providers : []).map(String).filter(Boolean)
    );
  } catch {
    /* ignore */
  }
}

function persistHideState() {
  if (!canHide.value || !districtSlug.value) return;
  try {
    localStorage.setItem(
      hideStorageKey.value,
      JSON.stringify({
        schools: [...hiddenSchoolIds.value],
        providers: [...hiddenProviderKeys.value]
      })
    );
  } catch {
    /* ignore */
  }
}

function hideSchool(schoolId) {
  const next = new Set(hiddenSchoolIds.value);
  next.add(Number(schoolId));
  hiddenSchoolIds.value = next;
  persistHideState();
}

function unhideSchool(schoolId) {
  const next = new Set(hiddenSchoolIds.value);
  next.delete(Number(schoolId));
  hiddenSchoolIds.value = next;
  persistHideState();
}

function hideProvider(schoolId, providerId) {
  const next = new Set(hiddenProviderKeys.value);
  next.add(providerHideKey(schoolId, providerId));
  hiddenProviderKeys.value = next;
  persistHideState();
}

function unhideProvider(schoolId, providerId) {
  const next = new Set(hiddenProviderKeys.value);
  next.delete(providerHideKey(schoolId, providerId));
  hiddenProviderKeys.value = next;
  persistHideState();
}

function clearAllHides() {
  hiddenSchoolIds.value = new Set();
  hiddenProviderKeys.value = new Set();
  persistHideState();
}

function districtRoute(slug) {
  if (route.meta?.flatDistrictSchedule) {
    return { name: 'FlatPublicDistrictSchedule', params: { districtSlug: slug } };
  }
  return {
    name: 'PublicDistrictSchedule',
    params: { organizationSlug: agencySlug.value, districtSlug: slug }
  };
}

function formatDays(days) {
  const list = Array.isArray(days) ? days : [];
  if (!list.length) return '—';
  return list.map((d) => String(d || '').slice(0, 3)).join(', ');
}

function formatBgExpiry(provider) {
  const ymd = String(provider?.federalBackgroundExpiresAt || '').trim();
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map((part) => parseInt(part, 10));
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function bgExpiryClass(provider) {
  const status = String(provider?.federalBackgroundStatus || '').toLowerCase();
  if (status === 'expired') return 'pds-bg-exp--bad';
  if (status === 'soon') return 'pds-bg-exp--warn';
  return '';
}

function printPage() {
  window.print();
}

async function loadDirectory() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`/public/district-schedule/${encodeURIComponent(agencySlug.value)}`, {
      skipAuthRedirect: true,
      skipGlobalLoading: true
    });
    agency.value = res.data?.agency || null;
    districts.value = Array.isArray(res.data?.districts) ? res.data.districts : [];
    district.value = null;
    schools.value = [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load districts';
  } finally {
    loading.value = false;
  }
}

async function loadSchedule() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(
      `/public/district-schedule/${encodeURIComponent(agencySlug.value)}/${encodeURIComponent(districtSlug.value)}`,
      { skipAuthRedirect: true, skipGlobalLoading: true }
    );
    agency.value = res.data?.agency || null;
    district.value = res.data?.district || null;
    schools.value = Array.isArray(res.data?.schools) ? res.data.schools : [];
    loadHideState();
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load district schedule';
    schools.value = [];
  } finally {
    loading.value = false;
  }
}

async function load() {
  if (!agencySlug.value) {
    loadError.value = 'Organization not found';
    loading.value = false;
    return;
  }
  if (districtSlug.value) await loadSchedule();
  else await loadDirectory();
}

onMounted(load);
watch([agencySlug, districtSlug], load);
watch(
  () => authStore.isAuthenticated,
  () => {
    if (districtSlug.value) loadHideState();
  }
);
</script>

<style scoped>
.pds-page {
  min-height: 100vh;
  background: var(--pds-bg);
  color: var(--pds-text);
}
.pds-header {
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--pds-border);
  background: #fff;
}
.pds-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  max-width: 1100px;
  margin: 0 auto;
}
.pds-brand-logo {
  width: 44px;
  height: 44px;
  object-fit: contain;
}
.pds-brand-kicker {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--pds-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pds-brand-title {
  font-size: 1rem;
  font-weight: 700;
}
.pds-hero {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem 1.25rem 0.5rem;
}
.pds-hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.pds-hero h1 {
  margin: 0 0 0.25rem;
  font-size: clamp(1.25rem, 2.5vw, 1.65rem);
}
.pds-hero p {
  margin: 0;
  color: var(--pds-muted);
  font-size: 0.9rem;
}
.pds-hide-hint {
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
  color: var(--pds-muted);
}
.pds-toolbar {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.pds-btn {
  border: 1px solid var(--pds-border);
  background: #fff;
  color: var(--pds-text);
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.pds-btn:hover {
  border-color: var(--pds-primary);
}
.pds-body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0.5rem 1.25rem 2rem;
}
.pds-district-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.85rem;
}
.pds-district-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid var(--pds-border);
  background: #fff;
  color: inherit;
  text-decoration: none;
}
.pds-district-card:hover {
  border-color: var(--pds-primary);
}
.pds-district-card span {
  font-size: 0.85rem;
  color: var(--pds-muted);
}
.pds-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--pds-border);
  border-radius: 10px;
  overflow: hidden;
  font-size: 0.9rem;
}
.pds-table th {
  text-align: left;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--pds-muted);
  font-weight: 700;
  padding: 0.45rem 0.55rem;
  border-bottom: 1px solid var(--pds-border);
  background: #f8fafc;
}
.pds-table td {
  padding: 0.35rem 0.55rem;
  border-bottom: 1px solid var(--pds-border);
  vertical-align: middle;
}
.pds-row:last-child td {
  border-bottom: none;
}
.pds-school-cell {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.pds-school-name {
  font-weight: 700;
}
.pds-col-days {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.pds-col-bg {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.pds-col-actions {
  width: 1%;
  white-space: nowrap;
}
.pds-bg-status {
  color: var(--pds-muted);
  font-size: 0.8rem;
}
.pds-bg-exp--bad {
  color: #b91c1c;
  font-weight: 600;
}
.pds-bg-exp--warn {
  color: #b45309;
  font-weight: 600;
}
.pds-hide-btn {
  border: 1px solid var(--pds-border);
  background: #fff;
  color: var(--pds-muted);
  border-radius: 6px;
  padding: 0.15rem 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.pds-hide-btn:hover {
  color: #b91c1c;
  border-color: #fecaca;
}
.pds-hidden-panel {
  margin-top: 1rem;
  padding: 0.75rem 0.9rem;
  border: 1px dashed var(--pds-border);
  border-radius: 10px;
  background: #fff;
  font-size: 0.85rem;
}
.pds-hidden-panel ul {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
}
.pds-hidden-panel li {
  margin: 0.2rem 0;
}
.pds-link-btn {
  border: none;
  background: none;
  color: var(--pds-primary);
  font-weight: 600;
  cursor: pointer;
  padding: 0 0.25rem;
  font-size: inherit;
}
.pds-loading,
.pds-empty,
.pds-muted {
  color: var(--pds-muted);
}
.pds-banner {
  max-width: 1100px;
  margin: 0.75rem auto 0;
  padding: 0.75rem 1rem;
  border-radius: 10px;
}
.pds-banner-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
.pds-print-only {
  display: none;
}

@media print {
  @page {
    margin: 0.4in;
  }
  .pds-no-print,
  .pds-screen-only {
    display: none !important;
  }
  .pds-print-only {
    display: block !important;
  }
  .pds-page {
    min-height: auto;
    background: #fff !important;
    color: #000 !important;
  }
  .pds-hero {
    padding: 0 0 0.25rem;
  }
  .pds-hero h1 {
    font-size: 14pt;
    margin: 0;
  }
  .pds-print-sub {
    font-size: 8pt;
    color: #333 !important;
    margin: 0.1rem 0 0.35rem !important;
  }
  .pds-body {
    max-width: none;
    padding: 0;
  }
  .pds-table {
    border: 1px solid #000;
    border-radius: 0;
    font-size: 8.5pt;
  }
  .pds-table th {
    background: #fff !important;
    color: #000 !important;
    border-bottom: 1px solid #000;
    padding: 0.15rem 0.25rem;
    font-size: 7.5pt;
  }
  .pds-table td {
    border-bottom: 1px solid #ccc;
    padding: 0.12rem 0.25rem;
    color: #000 !important;
  }
  .pds-school-name {
    font-weight: 700;
  }
  .pds-bg-exp--bad,
  .pds-bg-exp--warn {
    color: #000 !important;
    font-weight: 700;
  }
  .pds-muted,
  .pds-empty {
    color: #333 !important;
  }
}
</style>
