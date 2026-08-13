<template>
  <div class="container sph-page">
    <header class="sph-header">
      <div>
        <h1>Provider Fall Update</h1>
        <p class="sph-sub muted">
          Complete your fall update — reminders, events, materials, schedule, and client fall confirmation — in one place.
          When this school year closes, the next year is shown and you can still view the archived year.
        </p>
      </div>
      <div v-if="status" class="sph-status">
        <label class="sph-year-picker">
          <span class="muted tiny">School year</span>
          <select v-model="selectedSchoolYear" @change="onYearChange">
            <option v-for="y in yearOptions" :key="y.schoolYear" :value="y.schoolYear">
              {{ y.schoolYear }}{{ y.status === 'disabled' ? ' (archived)' : '' }}
            </option>
          </select>
        </label>
        <div class="sph-status-pct">{{ status.sectionPercent || 0 }}%</div>
        <div class="muted tiny">{{ status.isArchivedView ? 'Archived' : (status.cycle?.status === 'finalized' ? 'Completed' : 'In progress') }}</div>
      </div>
    </header>

    <div v-if="banner" class="sph-banner" :class="banner.kind">
      {{ banner.text }}
      <button v-if="status?.showPulse" type="button" class="btn btn-secondary btn-sm" @click="dismiss">Dismiss reminder</button>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="unavailable" class="muted">{{ unavailable }}</div>
    <template v-else>
      <div class="sph-cards">
        <router-link
          v-for="card in cards"
          :key="card.key"
          class="sph-card"
          :class="{ 'sph-card--pulse': status?.showPulse && !sectionDone(card.key) }"
          :to="flowTo(card.key)"
        >
          <div class="sph-card-icon" aria-hidden="true">{{ card.icon }}</div>
          <h2 class="sph-card-title">
            {{ card.title }}
            <span v-if="sectionDone(card.key)" class="done-badge">Done</span>
          </h2>
          <p class="sph-card-desc muted">{{ card.description }}</p>
          <span class="sph-card-cta">Open {{ card.shortTitle.toLowerCase() }} →</span>
        </router-link>
      </div>

      <div class="sph-continue">
        <router-link class="btn btn-primary" :to="flowTo()">Continue step-by-step →</router-link>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { SECTION_META } from '../../utils/providerYearUpdate';

const route = useRoute();
const agencyStore = useAgencyStore();
const loading = ref(true);
const status = ref(null);
const sections = ref([]);
const error = ref('');
const selectedSchoolYear = ref('');

const agencyId = computed(() =>
  Number(agencyStore.currentAgencyId || agencyStore.currentAgency?.id || 0)
);

const orgPrefix = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}` : '';
});

const cards = [
  { ...SECTION_META[0], icon: '✅' },
  { ...SECTION_META[1], icon: '🎉' },
  { ...SECTION_META[2], icon: '📦' },
  { ...SECTION_META[3], icon: '🪪' },
  { ...SECTION_META[4], icon: '📅' },
  { ...SECTION_META[5], icon: '👥' }
];

const unavailable = computed(() => {
  if (error.value) return error.value;
  if (status.value?.available === false) {
    if (status.value.reason === 'not_pushed') return 'Provider Fall Update has not been pushed yet.';
    if (status.value.reason === 'no_school_assignments') return 'You do not have active school assignments.';
    return 'Provider Fall Update is not available.';
  }
  return '';
});

const banner = computed(() => {
  if (!status.value?.available) return null;
  if (status.value.isArchivedView) {
    return { kind: 'ok', text: `Viewing archived ${status.value.schoolYear || selectedSchoolYear.value} Fall Update. Switch years to continue the current update.` };
  }
  if (status.value.cycle?.status === 'finalized') {
    return { kind: 'ok', text: 'You have completed the Provider Fall Update. You can still revisit any section.' };
  }
  if (status.value.showPulse) {
    return { kind: 'pulse', text: 'Please complete your Provider Fall Update before the school year starts.' };
  }
  return null;
});

const yearOptions = computed(() => {
  const rows = Array.isArray(status.value?.availableYears) ? status.value.availableYears : [];
  if (rows.length) return rows;
  const y = status.value?.schoolYear || status.value?.cycle?.schoolYear;
  return y ? [{ schoolYear: y, status: status.value?.isArchivedView ? 'disabled' : 'pushed' }] : [];
});

function flowTo(section) {
  const base = `${orgPrefix.value}/provider/year-update/flow`;
  const query = {};
  if (section) query.section = section;
  if (selectedSchoolYear.value) query.schoolYear = selectedSchoolYear.value;
  return { path: base, query };
}

function onYearChange() {
  load();
}

function sectionDone(key) {
  const s = sections.value.find((x) => x.sectionKey === key);
  return Boolean(s?.reviewed || s?.completed);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (!agencyId.value) {
      error.value = 'Select an agency to continue.';
      return;
    }
    if (route.query.schoolYear) {
      selectedSchoolYear.value = String(route.query.schoolYear);
    }
    const params = { agencyId: agencyId.value };
    if (selectedSchoolYear.value) params.schoolYear = selectedSchoolYear.value;
    const [st, me] = await Promise.all([
      api.get('/provider-year-update/me/status', { params }),
      api.get('/provider-year-update/me', { params }).catch(() => null),
    ]);
    status.value = st.data;
    if (!selectedSchoolYear.value) {
      selectedSchoolYear.value = st.data?.schoolYear || st.data?.cycle?.schoolYear || '';
    }
    if (me?.data?.sections) sections.value = me.data.sections;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function dismiss() {
  try {
    await api.post('/provider-year-update/me/dismiss', { agencyId: agencyId.value });
    await load();
  } catch {
    /* ignore */
  }
}

onMounted(load);
</script>

<style scoped>
.sph-page {
  padding-top: 1rem;
  padding-bottom: 2.5rem;
  max-width: 960px;
}
.sph-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.sph-header h1 {
  margin: 0 0 8px;
  font-size: 1.65rem;
  color: #c2410c;
}
.sph-sub {
  margin: 0;
  max-width: 42rem;
  line-height: 1.45;
  font-size: 0.95rem;
}
.sph-status {
  text-align: right;
  display: grid;
  gap: 6px;
  justify-items: end;
}
.sph-year-picker {
  display: grid;
  gap: 2px;
  text-align: left;
}
.sph-year-picker select {
  min-width: 160px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
}
.sph-status-pct {
  font-size: 1.75rem;
  font-weight: 700;
  color: #0c4a6e;
}
.sph-banner {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.sph-banner.pulse {
  background: #ffedd5;
  color: #9a3412;
  animation: pyu-banner-pulse 1.2s ease-in-out 3;
}
.sph-banner.ok {
  background: #dcfce7;
  color: #166534;
}
@keyframes pyu-banner-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(194, 65, 12, 0.25); }
  50% { box-shadow: 0 0 0 6px rgba(194, 65, 12, 0); }
}
.sph-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
  margin-top: 22px;
}
.sph-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 20px 18px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #fff;
  text-decoration: none;
  color: inherit;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.sph-card:hover {
  border-color: #c2410c;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
}
.sph-card--pulse {
  animation: pyu-card-pulse 1.1s ease-in-out 4;
  border-color: #fdba74;
}
@keyframes pyu-card-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.015); }
}
.sph-card-icon { font-size: 1.75rem; line-height: 1; }
.sph-card-title {
  margin: 4px 0 0;
  font-size: 1.15rem;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.done-badge {
  font-size: 0.7rem;
  background: #dcfce7;
  color: #166534;
  padding: 2px 6px;
  border-radius: 999px;
}
.sph-card-desc {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  flex: 1;
}
.sph-card-cta {
  margin-top: 6px;
  font-weight: 700;
  font-size: 0.9rem;
  color: #c2410c;
}
.sph-continue {
  margin-top: 22px;
}
.muted { color: #64748b; }
.tiny { font-size: 0.8rem; }
</style>
