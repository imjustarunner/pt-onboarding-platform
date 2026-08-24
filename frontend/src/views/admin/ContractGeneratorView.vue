<template>
  <div class="cg-page">
    <header class="cg-header">
      <div>
        <router-link class="cg-back" :to="peopleOpsRoute">← People Operations</router-link>
        <h1>Contract Generator</h1>
        <p>Editable clauses and configs that replace the Google Sheets employment contract builder.</p>
        <label v-if="canChooseAgency" class="cg-agency-picker">
          Agency
          <select :value="selectedAgencyId" @change="onPickAgency">
            <option v-for="a in agencyChoices" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
      </div>
      <div class="cg-tabs">
        <button type="button" :class="{ active: tab === 'build' }" @click="tab = 'build'">Build contract</button>
        <button type="button" :class="{ active: tab === 'library' }" @click="tab = 'library'">Clause library</button>
      </div>
    </header>

    <div v-if="loading" class="cg-muted">Loading library…</div>
    <div v-else-if="error" class="cg-error">{{ error }}</div>

    <template v-else>
      <!-- Build (spreadsheet-style front page) -->
      <section v-if="tab === 'build'" class="cg-panel">
        <div class="cg-build-toolbar">
          <label>
            Applicant / candidate
            <div class="cg-inline">
              <select v-model="build.candidateUserId" class="cg-candidate-select" @change="onCandidateSelected">
                <option value="">— select applicant —</option>
                <option v-for="c in contractCandidates" :key="c.id" :value="c.id">
                  {{ c.label || `${c.firstName} ${c.lastName}` }}
                </option>
              </select>
              <button type="button" class="cg-btn" :disabled="busy || !build.candidateUserId" @click="loadCandidateContext">
                Reload profile
              </button>
            </div>
          </label>
        </div>

        <div class="cg-sheet">
          <div class="cg-sheet-head">
            <span>Field</span><span>Value</span><span>Notes</span>
          </div>
          <div class="cg-sheet-row">
            <span class="cg-label">Credential</span>
            <div class="cg-credential-field">
              <select v-model="build.credentialKey" @change="onCredentialChanged">
                <option value="">— select credential —</option>
                <option v-for="opt in credentialOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
              </select>
              <input
                v-if="build.credentialKey === 'CUSTOM'"
                v-model="build.credential"
                type="text"
                placeholder="Custom credential text"
                @change="onCredentialChanged"
              />
            </div>
            <span class="cg-note">From profile / resume; drives pay category</span>
          </div>
          <div class="cg-sheet-row">
            <span class="cg-label">1 · Template</span>
            <select v-model="build.templateId">
              <option value="">— select —</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <span class="cg-note">Letterhead / branding wrapper</span>
          </div>
          <div class="cg-sheet-row">
            <span class="cg-label">2 · Configuration</span>
            <select v-model="build.configId" required>
              <option value="">— select —</option>
              <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <span class="cg-note">Clause chain (hourly, FFS, intern, addendum…)</span>
          </div>
          <div class="cg-sheet-row">
            <span class="cg-label">3 · Pay level</span>
            <select v-model="build.compensationLevelKey" @change="applyCompensationLevel">
              <option value="">— select —</option>
              <option
                v-for="lvl in compensationLevels"
                :key="`${lvl.category}-${lvl.level}`"
                :value="`${lvl.category}:${lvl.level}`"
              >
                Cat {{ lvl.category }} / Lvl {{ lvl.level }} — {{ lvl.label || 'Unlabeled' }}
              </option>
            </select>
            <span class="cg-note">Pulls direct/indirect rates from payroll compensation table</span>
          </div>
          <div class="cg-sheet-row">
            <span class="cg-label">4 · Job description clause</span>
            <select v-model="build.jobDescClauseKey">
              <option v-for="jd in jobDescClauses" :key="jd.key" :value="jd.key">{{ jd.key }} — {{ jd.title || 'Duties' }}</option>
            </select>
            <span class="cg-note">Maps to JOB_DESC_* from job title / JD</span>
          </div>
          <div class="cg-sheet-row">
            <span class="cg-label">Assigned office</span>
            <select v-model="build.officeLocationId" @change="onOfficeChanged">
              <option value="">— select office —</option>
              <option v-for="office in offices" :key="office.id" :value="office.id">
                {{ office.name }}{{ office.address ? ` — ${office.address}` : '' }}
              </option>
            </select>
            <span class="cg-note">Included as Assigned Office clause</span>
          </div>
          <div class="cg-sheet-row cg-sheet-row--readonly">
            <span class="cg-label">Company name</span>
            <span class="cg-readonly">{{ build.tokens.COMPANY_NAME || '—' }}</span>
            <span class="cg-note">Selected agency</span>
          </div>
          <div class="cg-sheet-row cg-sheet-row--readonly">
            <span class="cg-label">Company address</span>
            <span class="cg-readonly">{{ build.tokens.COMPANY_ADDRESS || '—' }}</span>
            <span class="cg-note">From agency profile</span>
          </div>
          <div class="cg-sheet-row"><span class="cg-label">Candidate name</span><input v-model="build.tokens.CANDIDATE_NAME" /><span class="cg-note">Legal name</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Job title</span><input v-model="build.tokens.JOB_TITLE" /><span class="cg-note">From applied job / JD</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Service focus</span><input v-model="build.tokens.SERVICE_FOCUS" /><span class="cg-note">From JD tags or profile</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Role label</span><input v-model="build.tokens.ROLE_LABEL" /><span class="cg-note">Provider, Student, Facilitator…</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Execution date</span><input v-model="build.tokens.EXECUTION_DATE" type="text" /><span class="cg-note">Date contract is sent</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Start date</span><input v-model="build.tokens.START_DATE" type="text" /><span class="cg-note">Proposed start</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Expiration date</span><input v-model="build.tokens.EXPIRATION_DATE" type="text" /><span class="cg-note">Offer expiry (often +7–14 days)</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Supervisor</span><input v-model="build.tokens.SUPERVISOR_NAME" /><span class="cg-note" /></div>
          <div class="cg-sheet-row"><span class="cg-label">Min hours</span><input v-model="build.tokens.MIN_HOURS" /><span class="cg-note">e.g. Ten (10) Hours</span></div>
          <div class="cg-sheet-row"><span class="cg-label">License type</span><input v-model="build.tokens.LICENSE_TYPE" /><span class="cg-note">Credential label + degree</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Licensure deadline</span><input v-model="build.tokens.LICENSURE_DEADLINE" /><span class="cg-note">For contingency configs</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Licensing board</span><input v-model="build.tokens.LICENSING_BOARD" /><span class="cg-note" /></div>
          <div class="cg-sheet-row"><span class="cg-label">Direct rate</span><input v-model="build.tokens.DIRECT_RATE" /><span class="cg-note">Hourly / from pay level</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Indirect rate</span><input v-model="build.tokens.INDIRECT_RATE" /><span class="cg-note">Hourly / from pay level</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Adjustment reason</span><input v-model="build.tokens.ADJUSTMENT_REASON" /><span class="cg-note">Addendum only</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Original agreement date</span><input v-model="build.tokens.ORIGINAL_AGREEMENT_DATE" /><span class="cg-note">Addendum only</span></div>
          <div class="cg-sheet-row"><span class="cg-label">Internship end</span><input v-model="build.tokens.INTERNSHIP_END_DATE" /><span class="cg-note">Intern addendum</span></div>
          <div class="cg-sheet-row"><span class="cg-label">University</span><input v-model="build.tokens.UNIVERSITY_NAME" /><span class="cg-note">Practicum / intern</span></div>
        </div>

        <div class="cg-actions">
          <button type="button" class="cg-btn" :disabled="busy || !canBuild" @click="preview">Preview contract</button>
          <button type="button" class="cg-btn primary" :disabled="busy || !canBuild" @click="generate">Generate &amp; assign for e-sign</button>
        </div>
        <p v-if="wizardMsg" class="cg-ok">{{ wizardMsg }}</p>
        <p v-if="wizardErr" class="cg-error">{{ wizardErr }}</p>
        <div v-if="previewHtml" class="cg-preview" v-html="previewHtml"></div>
      </section>

      <!-- Library admin -->
      <section v-else class="cg-panel">
        <div class="cg-library-tabs">
          <button type="button" :class="{ active: libraryTab === 'configs' }" @click="libraryTab = 'configs'">Configs ({{ configs.length }})</button>
          <button type="button" :class="{ active: libraryTab === 'clauses' }" @click="libraryTab = 'clauses'">Clauses ({{ clauses.length }})</button>
          <button type="button" :class="{ active: libraryTab === 'templates' }" @click="libraryTab = 'templates'">Templates ({{ templates.length }})</button>
        </div>

        <template v-if="libraryTab === 'configs'">
          <div v-for="c in configs" :key="c.id" class="cg-card">
            <strong>{{ c.name }}</strong>
            <div class="cg-muted">{{ c.slug }} · {{ c.pay_mode }} · {{ (c.clause_keys || []).length }} clauses</div>
          </div>
        </template>
        <template v-else-if="libraryTab === 'clauses'">
          <div v-for="cl in clauses" :key="cl.id" class="cg-card">
            <div class="cg-card-head">
              <strong>{{ cl.clause_key }}</strong>
              <span class="cg-muted">{{ cl.title }}</span>
              <button type="button" class="cg-link" @click="editClause(cl)">Edit</button>
            </div>
            <div v-if="editingClauseId === cl.id" class="cg-form">
              <input v-model="clauseDraft.title" placeholder="Title" />
              <textarea v-model="clauseDraft.bodyHtml" rows="8" />
              <button type="button" class="cg-btn" @click="saveClause">Save clause</button>
            </div>
          </div>
        </template>
        <template v-else>
          <div v-for="t in templates" :key="t.id" class="cg-card">
            <strong>{{ t.name }}</strong>
            <div class="cg-muted">{{ t.font_family || 'default font' }}</div>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { pickDefaultAgencyChoiceId } from '../../utils/peopleOpsAgencyPicker.js';
import { resolveHostImpliedPortalSlug } from '../../utils/orgScopedPath.js';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const route = useRoute();

const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || [])
    .filter(Boolean)
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const canChooseAgency = computed(() => agencyChoices.value.length > 1);
const userPickedAgency = ref(false);
const selectedAgencyId = ref('');

function resolvePickerAgencyId() {
  return pickDefaultAgencyChoiceId({
    choices: agencyChoices.value,
    currentAgency: agencyStore.currentAgency,
    routeSlug: route.params.organizationSlug || '',
    hostSlug: resolveHostImpliedPortalSlug(brandingStore)
  });
}

watch(
  [agencyChoices, () => agencyStore.currentAgency?.id, () => route.params.organizationSlug],
  () => {
    if (userPickedAgency.value) return;
    const next = resolvePickerAgencyId();
    if (next && next !== selectedAgencyId.value) selectedAgencyId.value = next;
  },
  { immediate: true }
);

function onPickAgency(e) {
  userPickedAgency.value = true;
  selectedAgencyId.value = e.target.value;
}

const agencyId = computed(() => {
  const fromPicker = Number(selectedAgencyId.value);
  if (Number.isFinite(fromPicker) && fromPicker > 0) return fromPicker;
  const fromQuery = Number(route.query.agencyId);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  const fromCurrent = Number(agencyStore.currentAgency?.id);
  if (Number.isFinite(fromCurrent) && fromCurrent > 0) return fromCurrent;
  return null;
});

const effectiveSlug = computed(() => {
  const routeSlug = String(route.params.organizationSlug || '').trim().toLowerCase();
  if (routeSlug) return routeSlug;
  const agency = agencyChoices.value.find((a) => String(a.id) === String(selectedAgencyId.value));
  return String(agency?.portal_url || agency?.portalUrl || agency?.slug || '').trim().toLowerCase();
});

const peopleOpsRoute = computed(() =>
  effectiveSlug.value ? `/${effectiveSlug.value}/people-operations` : '/people-operations'
);

const tab = ref('build');
const libraryTab = ref('configs');
const loading = ref(false);
const error = ref('');
const busy = ref(false);
const templates = ref([]);
const clauses = ref([]);
const configs = ref([]);
const compensationLevels = ref([]);
const jobDescClauses = ref([]);
const contractCandidates = ref([]);
const offices = ref([]);
const credentialOptions = ref([]);

const build = ref({
  candidateUserId: route.query.candidateUserId || '',
  credential: '',
  credentialKey: '',
  officeLocationId: '',
  templateId: '',
  configId: '',
  compensationCategory: 3,
  compensationLevel: 1,
  compensationLevelKey: '',
  jobDescClauseKey: 'JOB_DESC_LPC',
  tokens: {
    COMPANY_NAME: '',
    COMPANY_ADDRESS: '',
    CANDIDATE_NAME: '',
    JOB_TITLE: '',
    SERVICE_FOCUS: '',
    EXECUTION_DATE: '',
    START_DATE: '',
    EXPIRATION_DATE: '',
    ROLE_LABEL: 'Provider',
    SUPERVISOR_NAME: '',
    MIN_HOURS: '',
    LICENSE_TYPE: '',
    LICENSURE_DEADLINE: '',
    LICENSING_BOARD: 'The Department of Regulatory Agencies (DORA)',
    DIRECT_RATE: '',
    INDIRECT_RATE: '',
    ADJUSTMENT_REASON: '',
    ORIGINAL_AGREEMENT_DATE: '',
    INTERNSHIP_END_DATE: '',
    UNIVERSITY_NAME: '',
    ASSIGNED_OFFICE_NAME: '',
    ASSIGNED_OFFICE_ADDRESS: '',
    DEGREE: ''
  }
});

const canBuild = computed(() => Boolean(build.value.candidateUserId && build.value.configId));
const editingClauseId = ref(null);
const clauseDraft = ref({ title: '', bodyHtml: '' });
const previewHtml = ref('');
const wizardMsg = ref('');
const wizardErr = ref('');

function applyAgencyDefaults(agency = null) {
  if (!agency) return;
  build.value.tokens.COMPANY_NAME = agency.name || build.value.tokens.COMPANY_NAME;
  build.value.tokens.COMPANY_ADDRESS = agency.address || build.value.tokens.COMPANY_ADDRESS;
}

function resolveCredentialText() {
  if (build.value.credentialKey === 'CUSTOM') return String(build.value.credential || '').trim();
  const opt = credentialOptions.value.find((o) => o.key === build.value.credentialKey);
  return opt?.label || String(build.value.credential || '').trim();
}

function syncCredentialKeyFromText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) {
    build.value.credentialKey = '';
    build.value.credential = '';
    return;
  }
  const upper = raw.toUpperCase();
  const match = credentialOptions.value.find((o) => upper.includes(o.key));
  if (match) {
    build.value.credentialKey = match.key;
    build.value.credential = match.label;
    return;
  }
  build.value.credentialKey = 'CUSTOM';
  build.value.credential = raw;
}

function applyOfficeTokens(officeId) {
  const office = offices.value.find((o) => String(o.id) === String(officeId));
  build.value.tokens.ASSIGNED_OFFICE_NAME = office?.name || '';
  build.value.tokens.ASSIGNED_OFFICE_ADDRESS = office?.address || '';
}

function applyTokensToBuild(tokens = {}) {
  const t = build.value.tokens;
  for (const key of Object.keys(t)) {
    if (tokens[key] != null && tokens[key] !== '') t[key] = tokens[key];
  }
  if (tokens.EMPLOYEE_FULL_NAME && !t.CANDIDATE_NAME) t.CANDIDATE_NAME = tokens.EMPLOYEE_FULL_NAME;
  if (tokens.UNIVERSITY && !t.UNIVERSITY_NAME) t.UNIVERSITY_NAME = tokens.UNIVERSITY;
  if (tokens.CREDENTIAL) syncCredentialKeyFromText(tokens.CREDENTIAL);
  if (tokens.ASSIGNED_OFFICE_ID) build.value.officeLocationId = tokens.ASSIGNED_OFFICE_ID;
}

function applyCompensationLevel() {
  const [cat, lvl] = String(build.value.compensationLevelKey || '').split(':').map((n) => Number(n));
  if (!cat || !lvl) return;
  build.value.compensationCategory = cat;
  build.value.compensationLevel = lvl;
  const row = compensationLevels.value.find((r) => Number(r.category) === cat && Number(r.level) === lvl);
  if (!row) return;
  if (row.direct_rate != null) build.value.tokens.DIRECT_RATE = `$${Number(row.direct_rate).toFixed(2)}`;
  if (row.indirect_rate != null) build.value.tokens.INDIRECT_RATE = `$${Number(row.indirect_rate).toFixed(2)}`;
}

async function loadContractCandidates() {
  if (!agencyId.value) {
    contractCandidates.value = [];
    return;
  }
  try {
    const { data } = await api.get('/contracts/candidates', { params: { agencyId: agencyId.value, limit: 300 } });
    contractCandidates.value = data.candidates || [];
  } catch {
    contractCandidates.value = [];
  }
}

async function inferCompensationFromCredential() {
  if (!agencyId.value) return;
  const credential = resolveCredentialText();
  if (!credential) return;
  try {
    const { data } = await api.get('/contracts/infer-compensation', {
      params: {
        agencyId: agencyId.value,
        credential,
        jobTitle: build.value.tokens.JOB_TITLE,
        degree: build.value.tokens.DEGREE
      }
    });
    if (data.compensationCategory) {
      build.value.compensationCategory = data.compensationCategory;
      build.value.compensationLevel = data.compensationLevel || 1;
      build.value.compensationLevelKey = `${build.value.compensationCategory}:${build.value.compensationLevel}`;
      applyCompensationLevel();
    }
    if (data.licenseType) build.value.tokens.LICENSE_TYPE = data.licenseType;
    if (data.licensingBoard) build.value.tokens.LICENSING_BOARD = data.licensingBoard;
    if (data.roleLabel) build.value.tokens.ROLE_LABEL = data.roleLabel;
  } catch {
    /* ignore */
  }
}

async function onCredentialChanged() {
  const credential = resolveCredentialText();
  build.value.credential = credential;
  await inferCompensationFromCredential();
}

function onOfficeChanged() {
  applyOfficeTokens(build.value.officeLocationId);
}

async function onCandidateSelected() {
  if (!build.value.candidateUserId) return;
  await loadCandidateContext();
}

async function loadCandidateContext() {
  if (!agencyId.value || !build.value.candidateUserId) return;
  wizardErr.value = '';
  busy.value = true;
  try {
    const params = {
      agencyId: agencyId.value,
      credential: resolveCredentialText() || undefined,
      officeLocationId: build.value.officeLocationId || undefined
    };
    const { data } = await api.get(`/contracts/candidates/${build.value.candidateUserId}/wizard-context`, { params });
    compensationLevels.value = data.compensationLevels || compensationLevels.value;
    if (data.jobDescClauses?.length) jobDescClauses.value = data.jobDescClauses;
    if (data.offices?.length) offices.value = data.offices;
    if (data.credentialOptions?.length) credentialOptions.value = [...data.credentialOptions, { key: 'CUSTOM', label: 'Custom / other…' }];
    if (data.agency) applyAgencyDefaults(data.agency);
    if (data.suggested?.templateId) build.value.templateId = data.suggested.templateId;
    if (data.suggested?.configId) build.value.configId = data.suggested.configId;
    if (data.suggested?.jobDescClauseKey) build.value.jobDescClauseKey = data.suggested.jobDescClauseKey;
    if (data.suggested?.compensationCategory) build.value.compensationCategory = data.suggested.compensationCategory;
    if (data.suggested?.compensationLevel) build.value.compensationLevel = data.suggested.compensationLevel;
    if (data.suggested?.officeLocationId) build.value.officeLocationId = data.suggested.officeLocationId;
    build.value.compensationLevelKey = `${build.value.compensationCategory}:${build.value.compensationLevel}`;
    applyTokensToBuild(data.tokens || {});
    applyOfficeTokens(build.value.officeLocationId);
    applyCompensationLevel();
    wizardMsg.value = `Loaded ${data.tokens?.CANDIDATE_NAME || 'candidate'} — job, credential, pay level, and office prefilled.`;
  } catch (e) {
    wizardErr.value = e?.response?.data?.error?.message || e.message || 'Failed to load candidate';
  } finally {
    busy.value = false;
  }
}

async function loadLibrary() {
  loading.value = true;
  error.value = '';
  if (!agencyId.value) {
    loading.value = false;
    error.value = 'Select an agency to load contract templates.';
    return;
  }
  try {
    const { data } = await api.get('/contracts/library', { params: { agencyId: agencyId.value } });
    templates.value = data.templates || [];
    clauses.value = data.clauses || [];
    configs.value = data.configs || [];
    compensationLevels.value = data.compensationLevels || [];
    offices.value = data.offices || [];
    credentialOptions.value = [...(data.credentialOptions || []), { key: 'CUSTOM', label: 'Custom / other…' }];
    applyAgencyDefaults(data.agency);
    jobDescClauses.value = (data.clauses || [])
      .filter((c) => String(c.clause_key || '').startsWith('JOB_DESC_'))
      .map((c) => ({ key: c.clause_key, title: c.title }));
    if (!build.value.templateId && templates.value[0]) build.value.templateId = templates.value[0].id;
    if (!build.value.configId && configs.value[0]) build.value.configId = configs.value[0].id;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

function buildPayload() {
  const office = offices.value.find((o) => String(o.id) === String(build.value.officeLocationId));
  return {
    agencyId: agencyId.value,
    configId: Number(build.value.configId),
    templateId: build.value.templateId ? Number(build.value.templateId) : null,
    compensationCategory: build.value.compensationCategory,
    compensationLevel: build.value.compensationLevel,
    jobDescClauseKey: build.value.jobDescClauseKey,
    credential: resolveCredentialText(),
    officeLocationId: build.value.officeLocationId ? Number(build.value.officeLocationId) : null,
    tokens: {
      ...build.value.tokens,
      JOB_DESC_CLAUSE_KEY: build.value.jobDescClauseKey,
      ASSIGNED_OFFICE_NAME: office?.name || build.value.tokens.ASSIGNED_OFFICE_NAME,
      ASSIGNED_OFFICE_ADDRESS: office?.address || build.value.tokens.ASSIGNED_OFFICE_ADDRESS
    }
  };
}

function editClause(cl) {
  editingClauseId.value = cl.id;
  clauseDraft.value = { title: cl.title, bodyHtml: cl.body_html };
}

async function saveClause() {
  await api.patch(`/contracts/clauses/${editingClauseId.value}`, {
    agencyId: agencyId.value,
    ...clauseDraft.value
  });
  editingClauseId.value = null;
  await loadLibrary();
}

async function preview() {
  wizardErr.value = '';
  wizardMsg.value = '';
  busy.value = true;
  try {
    const { data } = await api.post(
      `/contracts/candidates/${build.value.candidateUserId}/preview`,
      buildPayload()
    );
    previewHtml.value = data.html || '';
    if (data.unresolvedTokens?.length) {
      wizardMsg.value = `Preview ready. Unresolved tokens: ${data.unresolvedTokens.join(', ')}`;
    } else {
      wizardMsg.value = 'Preview ready.';
    }
  } catch (e) {
    wizardErr.value = e?.response?.data?.error?.message || e.message;
  } finally {
    busy.value = false;
  }
}

async function generate() {
  wizardErr.value = '';
  wizardMsg.value = '';
  busy.value = true;
  try {
    const { data } = await api.post(
      `/contracts/candidates/${build.value.candidateUserId}/generate`,
      buildPayload()
    );
    previewHtml.value = data.html || previewHtml.value;
    wizardMsg.value = `Assigned as task #${data.task?.id || data.taskId}. Generation #${data.generationId}.`;
  } catch (e) {
    wizardErr.value = e?.response?.data?.error?.message || e.message;
  } finally {
    busy.value = false;
  }
}

watch(agencyId, (id) => {
  if (id) {
    loadLibrary().then(() => {
      loadContractCandidates().then(() => {
        if (build.value.candidateUserId) loadCandidateContext();
      });
    });
    return;
  }
  loading.value = false;
  templates.value = [];
  clauses.value = [];
  configs.value = [];
  contractCandidates.value = [];
  offices.value = [];
  error.value = agencyChoices.value.length
    ? 'Select an agency to load contract templates.'
    : '';
}, { immediate: true });

onMounted(async () => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin' && !agencyStore.agencies?.length) {
    await agencyStore.fetchAgencies().catch(() => {});
  } else if (!agencyStore.userAgencies?.length && !agencyStore.agencies?.length) {
    await agencyStore.fetchUserAgencies().catch(() => {});
  }
  if (route.query.candidateUserId) {
    build.value.candidateUserId = route.query.candidateUserId;
    tab.value = 'build';
  }
});
</script>

<style scoped>
.cg-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
.cg-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.cg-back {
  display: inline-block;
  margin-bottom: 8px;
  color: #2563eb;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}
.cg-back:hover { text-decoration: underline; }
.cg-header h1 { margin: 0 0 6px; font-size: 22px; }
.cg-header p { margin: 0; color: #64748b; }
.cg-agency-picker {
  display: grid;
  gap: 4px;
  margin-top: 12px;
  font-size: 13px;
  color: #475569;
  max-width: 280px;
}
.cg-agency-picker select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.cg-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.cg-tabs button {
  border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer;
}
.cg-tabs button.active { background: #0f172a; color: #fff; border-color: #0f172a; }
.cg-panel { display: grid; gap: 12px; }
.cg-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #fff; }
.cg-card-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cg-form { display: grid; gap: 8px; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 14px; background: #f8fafc; }
.cg-form input, .cg-form select, .cg-form textarea {
  border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font: inherit;
}
.cg-form label { display: grid; gap: 4px; font-size: 13px; color: #475569; }
.cg-btn {
  justify-self: start; border: none; border-radius: 8px; padding: 8px 14px;
  background: #e2e8f0; cursor: pointer; font-weight: 600;
}
.cg-btn.primary { background: #2563eb; color: #fff; }
.cg-actions { display: flex; gap: 8px; }
.cg-muted { color: #94a3b8; font-size: 13px; }
.cg-error { color: #dc2626; }
.cg-ok { color: #16a34a; }
.cg-link { background: none; border: none; color: #2563eb; cursor: pointer; }
.cg-preview {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fff; overflow: auto;
}
.cg-build-toolbar { margin-bottom: 16px; }
.cg-build-toolbar label { display: grid; gap: 6px; font-size: 13px; color: #475569; font-weight: 600; }
.cg-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cg-candidate-select { min-width: 320px; flex: 1; }
.cg-credential-field { display: grid; gap: 8px; }
.cg-sheet-row--readonly { background: #fafafa; }
.cg-readonly { font-size: 14px; color: #334155; padding: 8px 2px; }
.cg-sheet {
  border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #fff;
  margin-bottom: 16px;
}
.cg-sheet-head, .cg-sheet-row {
  display: grid; grid-template-columns: 180px 1fr 220px; gap: 10px; align-items: center;
  padding: 10px 12px; border-bottom: 1px solid #f1f5f9;
}
.cg-sheet-head { background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; }
.cg-sheet-row input, .cg-sheet-row select {
  width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font: inherit;
}
.cg-label { font-weight: 600; color: #334155; font-size: 13px; }
.cg-note { font-size: 12px; color: #94a3b8; }
.cg-library-tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.cg-library-tabs button {
  border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer;
}
.cg-library-tabs button.active { background: #0f172a; color: #fff; border-color: #0f172a; }
</style>
