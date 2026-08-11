<template>
  <div class="srh-page">
    <header class="srh-header">
      <div>
        <h1>School Referral Hub</h1>
        <p class="muted srh-sub">
          Edit the agency printable packet (EN/ES) and manage each school’s shareable digital + printable links.
          The questionnaire itself lives on Master School Form (agency-wide, live inheritance).
        </p>
      </div>
      <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to School Operations</router-link>
    </header>

    <div v-if="loadError" class="error">{{ loadError }}</div>
    <div v-else-if="loadingSchools" class="muted">Loading schools…</div>
    <template v-else>
      <section class="srh-card">
        <label class="srh-label" for="srh-school">School</label>
        <select id="srh-school" v-model="selectedSchoolId" class="srh-select">
          <option disabled value="">Select a school…</option>
          <option v-for="s in schools" :key="s.id" :value="String(s.id)">
            {{ s.name }}
          </option>
        </select>
      </section>

      <template v-if="selectedSchoolId">
        <section class="srh-card">
          <div class="srh-card-head">
            <h2>Packet template (agency-wide)</h2>
            <p class="muted">
              Legal text is shared across schools for this agency. School name/staff merge when the packet is generated.
              Spanish is a first-pass translation — review before production use.
            </p>
          </div>
          <SchoolPacketTemplateEditor
            :school-organization-id="selectedSchoolId"
            :initial-locale="packetLocale"
          />
        </section>

        <section class="srh-card">
          <div class="srh-card-head">
            <h2>Ready-to-share links</h2>
            <p class="muted">Digital EN/ES intake forms and printable EN/ES packets for {{ selectedSchoolName }}.</p>
          </div>

          <div v-if="linksError" class="error">{{ linksError }}</div>
          <div v-else-if="loadingLinks" class="muted">Loading links…</div>
          <div v-else class="srh-links-grid">
            <div v-for="lane in linkLanes" :key="lane.key" class="srh-link-tile">
              <div class="srh-link-title">{{ lane.title }}</div>
              <div class="muted srh-link-desc">{{ lane.desc }}</div>
              <div v-if="lane.kind === 'printable'" class="srh-link-row">
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  :disabled="printableLoadingLang === lane.lang"
                  @click="openPrintable(lane.lang)"
                >
                  {{ printableLoadingLang === lane.lang ? 'Generating…' : `View ${lane.short} PDF` }}
                </button>
              </div>
              <div v-else-if="lane.url" class="srh-link-row">
                <input class="srh-link-input" :value="lane.url" readonly />
                <button class="btn btn-secondary btn-sm" type="button" @click="copyText(lane.url)">Copy</button>
                <a class="btn btn-primary btn-sm" :href="lane.url" target="_blank" rel="noreferrer">Open</a>
              </div>
              <div v-else class="srh-link-missing">
                <span class="muted">No {{ lane.short }} digital form yet.</span>
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  :disabled="creatingLang === lane.lang"
                  @click="createDigitalLink(lane.lang)"
                >
                  {{ creatingLang === lane.lang ? 'Creating…' : `Create ${lane.short} form` }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="srh-card srh-master-card">
          <div class="srh-card-head">
            <h2>Master School Form</h2>
            <p class="muted">
              Agency-wide questionnaire and consents (EN/ES). School links above inherit it live — edit the form on its own page so you never leave for Digital Forms.
            </p>
          </div>
          <div class="srh-step-toolbar">
            <div v-if="masterLoading" class="muted">Loading…</div>
            <div v-else-if="masterError" class="error">{{ masterError }}</div>
            <div v-else class="srh-master-meta">
              <strong>{{ masterTitle || 'School Referral Master' }}</strong>
              <span class="version-pill">V{{ masterVersion || 1 }}</span>
              <span class="muted">{{ masterStepCount }} step(s)</span>
            </div>
            <router-link class="btn btn-primary btn-sm" :to="masterSchoolFormTo">
              Open Master School Form
            </router-link>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import SchoolPacketTemplateEditor from '../../components/school/redesign/SchoolPacketTemplateEditor.vue';

const route = useRoute();
const agencyStore = useAgencyStore();

const loadingSchools = ref(true);
const loadError = ref('');
const schools = ref([]);
const selectedSchoolId = ref('');
const packetLocale = ref('en');

const loadingLinks = ref(false);
const linksError = ref('');
const intakeLinks = ref([]);
const creatingLang = ref('');
const printableLoadingLang = ref('');

const masterLoading = ref(false);
const masterError = ref('');
const masterTitle = ref('');
const masterVersion = ref(null);
const masterStepCount = ref(0);

const orgSlug = computed(() => (typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''));
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query?.agencyId || 0));
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/school-operations` : '/school-operations'));
const masterSchoolFormTo = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/master-school-form` : '/admin/master-school-form'
);

const selectedSchoolName = computed(() => {
  const id = Number(selectedSchoolId.value || 0);
  return schools.value.find((s) => Number(s.id) === id)?.name || 'this school';
});

const activeDigitalByLang = computed(() => {
  const out = { en: null, es: null };
  for (const link of intakeLinks.value || []) {
    const lang = String(link.language_code || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
    if (!link.is_active) continue;
    if (!out[lang]) out[lang] = link;
  }
  // Prefer any link if none active
  for (const link of intakeLinks.value || []) {
    const lang = String(link.language_code || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
    if (!out[lang]) out[lang] = link;
  }
  return out;
});

const linkLanes = computed(() => {
  const en = activeDigitalByLang.value.en;
  const es = activeDigitalByLang.value.es;
  return [
    {
      key: 'digital-en',
      title: 'Digital form — English',
      short: 'English',
      lang: 'en',
      kind: 'digital',
      desc: 'Shareable public intake link (EN)',
      url: en ? buildPublicIntakeUrl(en.public_key || en.publicKey) : '',
      openExternal: true
    },
    {
      key: 'digital-es',
      title: 'Digital form — Spanish',
      short: 'Spanish',
      lang: 'es',
      kind: 'digital',
      desc: 'Shareable public intake link (ES)',
      url: es ? buildPublicIntakeUrl(es.public_key || es.publicKey) : '',
      openExternal: true
    },
    {
      key: 'print-en',
      title: 'Printable packet — English',
      short: 'English',
      lang: 'en',
      kind: 'printable',
      desc: 'Smart printable PDF (EN) — opens a generated PDF',
      url: 'printable:en',
      openExternal: false
    },
    {
      key: 'print-es',
      title: 'Printable packet — Spanish',
      short: 'Spanish',
      lang: 'es',
      kind: 'printable',
      desc: 'Smart printable PDF (ES) — opens a generated PDF',
      url: 'printable:es',
      openExternal: false
    }
  ];
});

async function loadMaster() {
  if (!agencyId.value) return;
  masterLoading.value = true;
  masterError.value = '';
  try {
    const res = await api.get(`/agencies/${agencyId.value}/school-intake-master`, {
      params: { locale: 'en' }
    });
    const m = res.data?.master || null;
    masterTitle.value = m?.title || '';
    masterVersion.value = m?.version ?? null;
    const steps = Array.isArray(m?.intake_steps) ? m.intake_steps : [];
    masterStepCount.value = steps.length;
  } catch (e) {
    masterError.value = e?.response?.data?.error?.message || e.message || 'Failed to load master form';
  } finally {
    masterLoading.value = false;
  }
}

async function loadSchools() {
  loadingSchools.value = true;
  loadError.value = '';
  try {
    if (!agencyId.value) {
      loadError.value = 'No agency context. Open School Operations from an agency portal.';
      return;
    }
    const resp = await api.get(`/agencies/${agencyId.value}/schools`);
    const rows = Array.isArray(resp.data) ? resp.data : [];
    schools.value = rows
      .map((s) => ({
        id: Number(s.school_organization_id ?? s.id ?? 0),
        name: String(s.school_name || s.name || '').trim() || `School #${s.school_organization_id || s.id}`
      }))
      .filter((s) => s.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const qSchool = Number(route.query?.schoolOrganizationId || route.query?.organizationId || 0);
    if (qSchool && schools.value.some((s) => s.id === qSchool)) {
      selectedSchoolId.value = String(qSchool);
    } else if (schools.value.length === 1) {
      selectedSchoolId.value = String(schools.value[0].id);
    }
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e.message || 'Failed to load schools';
  } finally {
    loadingSchools.value = false;
  }
}

async function loadLinks() {
  if (!selectedSchoolId.value) return;
  loadingLinks.value = true;
  linksError.value = '';
  try {
    const res = await api.get(`/school-portal/${selectedSchoolId.value}/intake-links`, {
      params: { includeInactive: '1' }
    });
    intakeLinks.value = Array.isArray(res.data?.links) ? res.data.links : [];
  } catch (e) {
    linksError.value = e?.response?.data?.error?.message || e.message || 'Failed to load links';
    intakeLinks.value = [];
  } finally {
    loadingLinks.value = false;
  }
}

async function createDigitalLink(lang) {
  creatingLang.value = lang;
  linksError.value = '';
  try {
    await api.post(`/school-portal/${selectedSchoolId.value}/intake-links/create`, { languageCode: lang });
    await loadLinks();
  } catch (e) {
    linksError.value = e?.response?.data?.error?.message || e.message || 'Failed to create form';
  } finally {
    creatingLang.value = '';
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
  } catch {
    /* ignore */
  }
}

async function openPrintable(lang) {
  const id = Number(selectedSchoolId.value || 0);
  if (!id) return;
  printableLoadingLang.value = lang;
  linksError.value = '';
  try {
    const res = await api.get(`/school-portal/${id}/printable-packet`, {
      params: { locale: lang, _ts: Date.now() },
      responseType: 'blob',
      timeout: 120000
    });
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    linksError.value = e?.response?.data?.error?.message || e.message || 'Failed to open printable packet';
  } finally {
    printableLoadingLang.value = '';
  }
}

watch(selectedSchoolId, () => {
  loadLinks();
});

watch(agencyId, (id) => {
  if (id) loadMaster();
}, { immediate: true });

onMounted(async () => {
  await loadSchools();
  if (agencyId.value) await loadMaster();
});
</script>

<style scoped>
.srh-page {
  padding: 24px 40px 48px;
  max-width: 1800px;
  margin: 0 auto;
}
.srh-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.srh-sub {
  max-width: 48rem;
  margin: 6px 0 0;
  line-height: 1.45;
}
.srh-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
}
.srh-card-head h2 {
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.srh-label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.srh-select {
  width: min(420px, 100%);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
}
.srh-links-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.srh-link-tile {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fafafa;
}
.srh-link-title {
  font-weight: 700;
}
.srh-link-desc {
  font-size: 12px;
  margin: 4px 0 10px;
}
.srh-link-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.srh-link-input {
  flex: 1 1 140px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
}
.srh-link-missing {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.srh-master-card {
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 55%, #fff 100%);
  border-color: #a7f3d0;
}
.srh-step-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 8px;
}
.srh-master-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.version-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.srh-step-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}
.srh-step-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
}
.muted { color: #6b7280; }
.error { color: #b91c1c; }
.success { color: #047857; }
</style>
