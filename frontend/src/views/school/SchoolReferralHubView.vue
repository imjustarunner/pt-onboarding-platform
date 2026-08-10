<template>
  <div class="srh-page">
    <header class="srh-header">
      <div>
        <h1>School Referral Hub</h1>
        <p class="muted srh-sub">
          Edit the agency school referral packet (EN/ES), manage ready-to-share digital and printable links,
          and choose which consent steps appear on each school’s digital form.
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

        <section class="srh-card">
          <div class="srh-card-head">
            <h2>Digital form steps</h2>
            <p class="muted">
              Toggle which steps are included on the selected language’s digital intake form.
              Questionnaire fields are not edited here.
            </p>
          </div>
          <div class="srh-step-toolbar">
            <div class="locale-tabs" role="tablist">
              <button
                type="button"
                class="locale-tab"
                :class="{ active: stepsLocale === 'en' }"
                @click="stepsLocale = 'en'"
              >
                English form
              </button>
              <button
                type="button"
                class="locale-tab"
                :class="{ active: stepsLocale === 'es' }"
                @click="stepsLocale = 'es'"
              >
                Spanish form
              </button>
            </div>
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="!activeStepsLink || savingSteps"
              @click="saveStepToggles"
            >
              {{ savingSteps ? 'Saving…' : 'Save step toggles' }}
            </button>
          </div>
          <div v-if="!activeStepsLink" class="muted" style="margin-top:10px;">
            Create a {{ stepsLocale === 'es' ? 'Spanish' : 'English' }} digital form above before configuring steps.
          </div>
          <div v-else class="srh-step-list">
            <label v-for="opt in stepToggleOptions" :key="opt.key" class="srh-step-row">
              <input v-model="stepToggles[opt.key]" type="checkbox" />
              <span>
                <strong>{{ opt.label }}</strong>
                <span class="muted"> — {{ opt.hint }}</span>
              </span>
            </label>
          </div>
          <div v-if="stepsMessage" class="success" style="margin-top:10px;">{{ stepsMessage }}</div>
          <div v-if="stepsError" class="error" style="margin-top:10px;">{{ stepsError }}</div>
          <p class="muted" style="margin-top:12px;">
            Advanced builder:
            <router-link :to="digitalFormsTo">Digital Forms</router-link>
          </p>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
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

const stepsLocale = ref('en');
const stepToggles = reactive({
  questions: true,
  school_roi: true,
  smart_disclosure: true,
  packet_informed_group_consent: false,
  packet_policy_services: false,
  packet_hipaa_notice: false
});
const savingSteps = ref(false);
const stepsMessage = ref('');
const stepsError = ref('');

const stepToggleOptions = [
  { key: 'questions', label: 'Questionnaire', hint: 'existing question steps stay as-is' },
  { key: 'school_roi', label: 'School ROI', hint: 'programmed school release of information' },
  { key: 'smart_disclosure', label: 'Smart Disclosure', hint: 'living disclosure statement' },
  { key: 'packet_informed_group_consent', label: 'Informed + Group Consent', hint: 'live from packet template' },
  { key: 'packet_policy_services', label: 'Policy & Services', hint: 'live from packet template' },
  { key: 'packet_hipaa_notice', label: 'HIPAA Notice', hint: 'live from packet template' }
];

const orgSlug = computed(() => (typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''));
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query?.agencyId || 0));
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/school-operations` : '/school-operations'));
const digitalFormsTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/admin/digital-forms` : '/admin/digital-forms'));

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

const activeStepsLink = computed(() => activeDigitalByLang.value[stepsLocale.value] || null);

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

function normalizeSteps(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function syncTogglesFromLink(link) {
  const steps = normalizeSteps(link?.intake_steps);
  const types = new Set(steps.map((s) => String(s?.type || '').toLowerCase()));
  stepToggles.questions = types.has('questions') || steps.some((s) => s?.type === 'questions' || s?.fields);
  // questions may be represented as question fields without a dedicated type in some forms —
  // treat presence of any questions-typed step OR any step with fields as questionnaire on.
  if (!types.has('questions')) {
    stepToggles.questions = steps.some((s) => Array.isArray(s?.fields) && s.fields.length);
  }
  stepToggles.school_roi = types.has('school_roi');
  stepToggles.smart_disclosure = types.has('smart_disclosure') || types.has('disclosure');
  stepToggles.packet_informed_group_consent = types.has('packet_informed_group_consent');
  stepToggles.packet_policy_services = types.has('packet_policy_services');
  stepToggles.packet_hipaa_notice = types.has('packet_hipaa_notice');
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
    syncTogglesFromLink(activeStepsLink.value);
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

function applyStepToggles(existingSteps) {
  const steps = normalizeSteps(existingSteps).filter((s) => {
    const t = String(s?.type || '').toLowerCase();
    if (t === 'school_roi') return !!stepToggles.school_roi;
    if (t === 'smart_disclosure' || t === 'disclosure') return !!stepToggles.smart_disclosure;
    if (t === 'packet_informed_group_consent') return !!stepToggles.packet_informed_group_consent;
    if (t === 'packet_policy_services') return !!stepToggles.packet_policy_services;
    if (t === 'packet_hipaa_notice') return !!stepToggles.packet_hipaa_notice;
    if (t === 'questions' || Array.isArray(s?.fields)) return !!stepToggles.questions;
    return true;
  });

  const hasType = (type) => steps.some((s) => String(s?.type || '').toLowerCase() === type);
  if (stepToggles.school_roi && !hasType('school_roi')) {
    steps.push({ type: 'school_roi', title: 'School ROI', visibility: 'always' });
  }
  if (stepToggles.smart_disclosure && !hasType('smart_disclosure') && !hasType('disclosure')) {
    steps.push({ type: 'smart_disclosure', title: 'Disclosure Statement', visibility: 'always' });
  }
  if (stepToggles.packet_informed_group_consent && !hasType('packet_informed_group_consent')) {
    steps.push({
      type: 'packet_informed_group_consent',
      label: 'Informed Consent + Group Consent',
      visibility: 'always'
    });
  }
  if (stepToggles.packet_policy_services && !hasType('packet_policy_services')) {
    steps.push({
      type: 'packet_policy_services',
      label: 'Policy and Services Agreement',
      visibility: 'always'
    });
  }
  if (stepToggles.packet_hipaa_notice && !hasType('packet_hipaa_notice')) {
    steps.push({
      type: 'packet_hipaa_notice',
      label: 'HIPAA Privacy Policy and Notice of Privacy Practices',
      visibility: 'always'
    });
  }
  return steps;
}

async function saveStepToggles() {
  const link = activeStepsLink.value;
  if (!link?.id) return;
  savingSteps.value = true;
  stepsMessage.value = '';
  stepsError.value = '';
  try {
    const nextSteps = applyStepToggles(link.intake_steps);
    await api.put(`/intake-links/${link.id}`, {
      title: link.title || 'School referral form',
      description: link.description || '',
      languageCode: link.language_code || stepsLocale.value,
      formType: link.form_type || 'intake',
      scopeType: link.scope_type || 'school',
      organizationId: Number(link.organization_id || selectedSchoolId.value || 0) || undefined,
      isActive: !!link.is_active,
      createClient: !!link.create_client,
      createGuardian: !!link.create_guardian,
      intakeSteps: nextSteps,
      intakeFields: link.intake_fields || undefined,
      allowedDocumentTemplateIds: link.allowed_document_template_ids || undefined,
      customMessages: link.custom_messages || undefined,
      linkedEsFormId: link.linked_es_form_id || null,
      documentTranslationMap: link.document_translation_map || undefined
    });
    stepsMessage.value = 'Step toggles saved.';
    await loadLinks();
  } catch (e) {
    stepsError.value = e?.response?.data?.error?.message || e.message || 'Failed to save steps';
  } finally {
    savingSteps.value = false;
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

watch(stepsLocale, () => {
  syncTogglesFromLink(activeStepsLink.value);
  stepsMessage.value = '';
  stepsError.value = '';
});

watch(activeStepsLink, (link) => {
  syncTogglesFromLink(link);
});

onMounted(loadSchools);
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
.srh-step-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 8px;
}
.locale-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: #f3f4f6;
}
.locale-tab {
  border: 0;
  background: transparent;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.locale-tab.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
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
