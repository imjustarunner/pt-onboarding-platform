<template>
  <div class="container billing-policy-engine">
    <div class="header-row">
      <div>
        <h1>Colorado Billing Rules Engine</h1>
        <p class="subtitle">Policy profiles, rule enforcement, agency activation, and PDF review/publish.</p>
      </div>
      <button class="btn btn-secondary" type="button" @click="loadAll" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="grid">
      <section class="panel">
        <div class="panel-title">Policy Profiles</div>
        <div class="row gap">
          <input v-model="newProfile.policyName" class="input" placeholder="Policy name" />
          <input v-model="newProfile.versionLabel" class="input short" placeholder="Version" />
          <button class="btn btn-secondary btn-sm" @click="createProfile" :disabled="savingProfile">Create</button>
        </div>
        <div class="list">
          <button
            v-for="p in profiles"
            :key="`profile-${p.id}`"
            class="list-item"
            :class="{ active: Number(selectedProfileId) === Number(p.id) }"
            @click="selectProfile(p.id)"
          >
            <div class="strong">{{ p.policy_name }} ({{ p.version_label }})</div>
            <div class="hint">{{ p.state_code }} • {{ p.status }}</div>
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">Agency Activation</div>
        <div class="hint" v-if="!agencyId">Select an agency context to manage activation.</div>
        <template v-else>
          <div class="hint">
            Active profile:
            <strong>{{ activationLabel }}</strong>
          </div>
          <div class="row gap">
            <select v-model.number="activationProfileId" class="input">
              <option :value="0">Select profile</option>
              <option v-for="p in profiles" :key="`activate-${p.id}`" :value="Number(p.id)">
                {{ p.policy_name }} ({{ p.version_label }})
              </option>
            </select>
            <button class="btn btn-secondary btn-sm" @click="activateProfile" :disabled="!activationProfileId || activatingProfile">
              {{ activatingProfile ? 'Saving…' : 'Activate' }}
            </button>
          </div>
          <div class="panel-title mini">Agency Service Code Activation</div>
          <table class="table compact">
            <thead>
              <tr>
                <th>Code</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rule in rules" :key="`agency-code-${rule.id}`">
                <td>{{ rule.service_code }}</td>
                <td>
                  <input
                    type="checkbox"
                    :checked="isCodeEnabled(rule.service_code)"
                    @change="toggleAgencyCode(rule.service_code, $event)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </section>
    </div>

    <section class="panel">
      <div class="panel-title">Rule Editor</div>
      <div class="row gap wrap">
        <input v-model="ruleEditor.serviceCode" class="input short" placeholder="Service code (e.g., H2014)" />
        <input v-model.number="ruleEditor.minMinutes" type="number" class="input tiny" placeholder="Min min" />
        <input v-model.number="ruleEditor.maxMinutes" type="number" class="input tiny" placeholder="Max min" />
        <input v-model.number="ruleEditor.unitMinutes" type="number" class="input tiny" placeholder="Unit min" />
        <input v-model.number="ruleEditor.maxUnitsPerDay" type="number" class="input tiny" placeholder="Max units/day" />
        <select v-model="ruleEditor.unitCalcMode" class="input short">
          <option value="NONE">NONE</option>
          <option value="MEDICAID_8_MINUTE_LADDER">MEDICAID_8_MINUTE_LADDER</option>
          <option value="FIXED_BLOCK">FIXED_BLOCK</option>
        </select>
        <input v-model="ruleEditor.serviceDescription" class="input wide" placeholder="Service description" />
        <button class="btn btn-secondary btn-sm" @click="saveRule" :disabled="!selectedProfileId || savingRule">
          {{ savingRule ? 'Saving…' : 'Save rule' }}
        </button>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Description</th>
            <th>Duration</th>
            <th>Units</th>
            <th>Daily Cap</th>
            <th>Citations</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in rules" :key="`rule-${rule.id}`" @click="hydrateRuleEditor(rule)" class="clickable">
            <td>{{ rule.service_code }}</td>
            <td>{{ rule.service_description || '-' }}</td>
            <td>{{ rule.min_minutes || '-' }} - {{ rule.max_minutes || '-' }}</td>
            <td>{{ rule.unit_calc_mode }} / {{ rule.unit_minutes || '-' }}</td>
            <td>{{ rule.max_units_per_day || '-' }}</td>
            <td>{{ citationPreview(rule.sources) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel">
      <div class="panel-title">PDF Ingestion Review + Publish</div>
      <div class="row gap wrap">
        <input ref="uploadInput" type="file" accept=".pdf,.txt" />
        <button class="btn btn-secondary btn-sm" @click="uploadPolicyPdf" :disabled="!selectedProfileId || uploading">
          {{ uploading ? 'Uploading…' : 'Upload + Extract' }}
        </button>
        <button class="btn btn-secondary btn-sm" @click="loadJobs" :disabled="loadingJobs">
          {{ loadingJobs ? 'Loading…' : 'Refresh jobs' }}
        </button>
      </div>
      <table class="table compact">
        <thead>
          <tr>
            <th>Job</th>
            <th>Profile</th>
            <th>Status</th>
            <th>Candidates</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in jobs" :key="`job-${job.id}`" :class="{ active: Number(selectedJobId) === Number(job.id) }">
            <td>#{{ job.id }}</td>
            <td>{{ job.policy_name }} ({{ job.version_label }})</td>
            <td>{{ job.review_status }}</td>
            <td>{{ job.candidate_count }}</td>
            <td>
              <button class="btn btn-secondary btn-sm" @click="selectJob(job.id)">Review</button>
              <button class="btn btn-secondary btn-sm" style="margin-left: 6px;" @click="deleteJob(job.id)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="jobDetail" class="job-detail">
        <div class="row split">
          <h3>Job #{{ jobDetail.id }} candidates</h3>
          <div class="row gap">
            <button class="btn btn-secondary btn-sm" @click="deleteJob(jobDetail.id)">Delete job</button>
            <button class="btn btn-secondary btn-sm" @click="publishJob" :disabled="publishingJob">
              {{ publishingJob ? 'Publishing…' : 'Publish approved candidates' }}
            </button>
          </div>
        </div>
        <details style="margin-bottom: 10px;">
          <summary class="strong">Extracted manual text preview</summary>
          <pre class="extract-preview">{{ String(jobDetail.extracted_text || '').slice(0, 6000) || 'No extracted text.' }}</pre>
        </details>
        <table class="table compact">
          <thead>
            <tr>
              <th>Code</th>
              <th>Basis</th>
              <th>Duration</th>
              <th>Calc mode</th>
              <th>Units/day</th>
              <th>Eligibility hint</th>
              <th>Status</th>
              <th>Citation</th>
              <th>Extracted line</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in jobDetail.candidates || []" :key="`cand-${c.id}`">
              <td>{{ c.service_code }}</td>
              <td>{{ billingBasisLabel(editFor(c)) }}</td>
              <td class="row gap wrap">
                <input v-model.number="editFor(c).minMinutes" type="number" class="input tiny" placeholder="Min" />
                <input v-model.number="editFor(c).maxMinutes" type="number" class="input tiny" placeholder="Max" />
              </td>
              <td class="row gap wrap">
                <select v-model="editFor(c).unitCalcMode" class="input short">
                  <option value="NONE">NONE</option>
                  <option value="MEDICAID_8_MINUTE_LADDER">MEDICAID_8_MINUTE_LADDER</option>
                  <option value="FIXED_BLOCK">FIXED_BLOCK</option>
                </select>
                <input v-model.number="editFor(c).unitMinutes" type="number" class="input tiny" placeholder="Unit min" />
              </td>
              <td>
                <input v-model.number="editFor(c).maxUnitsPerDay" type="number" class="input tiny" placeholder="Cap/day" />
              </td>
              <td class="row gap wrap">
                <select v-model="editFor(c).credentialTier" class="input short">
                  <option value="">- tier -</option>
                  <option value="qbha">qbha</option>
                  <option value="bachelors">bachelors</option>
                  <option value="intern_plus">intern_plus</option>
                </select>
                <select v-model="editFor(c).providerType" class="input short">
                  <option value="">- provider -</option>
                  <option value="qbha">qbha</option>
                  <option value="bachelors">bachelors</option>
                  <option value="intern">intern</option>
                  <option value="licensed">licensed</option>
                </select>
              </td>
              <td>
                <select v-model="editFor(c).status" class="input short">
                  <option value="PENDING">PENDING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </td>
              <td class="citation">{{ c.source_snippet || '-' }}</td>
              <td class="citation">{{ c.raw_text_line || '-' }}</td>
              <td class="row gap">
                <button class="btn btn-secondary btn-sm" @click="reviewCandidate(c, editFor(c).status || 'PENDING')">Save</button>
                <button class="btn btn-secondary btn-sm" @click="reviewCandidate(c, 'APPROVED')">Approve</button>
                <button class="btn btn-secondary btn-sm" @click="reviewCandidate(c, 'REJECTED')">Reject</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const loading = ref(false);
const error = ref('');

const profiles = ref([]);
const selectedProfileId = ref(0);
const rules = ref([]);
const newProfile = ref({ policyName: 'Colorado Medicaid Behavioral Health Manual', versionLabel: '' });

const activationProfileId = ref(0);
const agencyActivation = ref(null);
const agencyCodeActivation = ref([]);

const ruleEditor = ref({
  serviceCode: '',
  serviceDescription: '',
  minMinutes: null,
  maxMinutes: null,
  unitMinutes: 15,
  unitCalcMode: 'MEDICAID_8_MINUTE_LADDER',
  maxUnitsPerDay: null
});

const jobs = ref([]);
const selectedJobId = ref(0);
const jobDetail = ref(null);
const candidateEdits = ref({});
const uploadInput = ref(null);

const savingProfile = ref(false);
const activatingProfile = ref(false);
const savingRule = ref(false);
const loadingJobs = ref(false);
const uploading = ref(false);
const publishingJob = ref(false);

const activationLabel = computed(() => {
  const p = agencyActivation.value?.effectiveProfile || null;
  if (!p) return 'none';
  return `${p.policy_name} (${p.version_label})`;
});

const citationPreview = (sources) => {
  if (!Array.isArray(sources) || !sources.length) return '-';
  const first = sources[0];
  return first?.citationSnippet ? String(first.citationSnippet).slice(0, 80) : (first?.sourceFileName || 'source');
};

const isCodeEnabled = (serviceCode) => {
  const code = String(serviceCode || '').trim().toUpperCase();
  const row = (agencyCodeActivation.value || []).find((r) => String(r.service_code || '').toUpperCase() === code);
  if (!row) return true;
  return Boolean(row.is_enabled);
};

const loadProfiles = async () => {
  const r = await api.get('/billing-policy/profiles', { params: { stateCode: 'CO' } });
  profiles.value = Array.isArray(r.data?.profiles) ? r.data.profiles : [];
  if (!selectedProfileId.value && profiles.value.length) {
    selectedProfileId.value = Number(profiles.value[0].id);
  }
};

const loadRules = async () => {
  if (!selectedProfileId.value) {
    rules.value = [];
    return;
  }
  const r = await api.get(`/billing-policy/profiles/${selectedProfileId.value}/rules`);
  rules.value = Array.isArray(r.data?.rules) ? r.data.rules : [];
};

const loadActivation = async () => {
  if (!agencyId.value) {
    agencyActivation.value = null;
    agencyCodeActivation.value = [];
    return;
  }
  const r = await api.get(`/billing-policy/agency/${agencyId.value}/activation`);
  agencyActivation.value = r.data || null;
  agencyCodeActivation.value = Array.isArray(r.data?.serviceCodeActivation) ? r.data.serviceCodeActivation : [];
  activationProfileId.value = Number(r.data?.effectiveProfile?.id || r.data?.activation?.billing_policy_profile_id || 0) || 0;
};

const loadJobs = async () => {
  loadingJobs.value = true;
  try {
    const r = await api.get('/billing-policy/ingestion/jobs', {
      params: selectedProfileId.value ? { profileId: selectedProfileId.value } : {}
    });
    jobs.value = Array.isArray(r.data?.jobs) ? r.data.jobs : [];
  } finally {
    loadingJobs.value = false;
  }
};

const selectJob = async (jobId) => {
  selectedJobId.value = Number(jobId || 0);
  if (!selectedJobId.value) {
    jobDetail.value = null;
    candidateEdits.value = {};
    return;
  }
  const r = await api.get(`/billing-policy/ingestion/jobs/${selectedJobId.value}`);
  jobDetail.value = r.data?.job || null;
  const nextEdits = {};
  for (const c of (jobDetail.value?.candidates || [])) {
    nextEdits[c.id] = {
      serviceDescription: c.service_description || '',
      minMinutes: c.min_minutes ?? null,
      maxMinutes: c.max_minutes ?? null,
      unitMinutes: c.unit_minutes ?? null,
      unitCalcMode: c.unit_calc_mode || 'NONE',
      maxUnitsPerDay: c.max_units_per_day ?? null,
      credentialTier: c.credential_tier || '',
      providerType: c.provider_type || '',
      reviewNotes: c.review_notes || '',
      status: c.status || 'PENDING'
    };
  }
  candidateEdits.value = nextEdits;
};

const loadAll = async () => {
  loading.value = true;
  error.value = '';
  try {
    await loadProfiles();
    await loadRules();
    await loadActivation();
    await loadJobs();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load billing policy engine';
  } finally {
    loading.value = false;
  }
};

const selectProfile = async (profileId) => {
  selectedProfileId.value = Number(profileId || 0);
  await loadRules();
  await loadJobs();
};

const hydrateRuleEditor = (rule) => {
  ruleEditor.value = {
    serviceCode: rule?.service_code || '',
    serviceDescription: rule?.service_description || '',
    minMinutes: rule?.min_minutes ?? null,
    maxMinutes: rule?.max_minutes ?? null,
    unitMinutes: rule?.unit_minutes ?? null,
    unitCalcMode: rule?.unit_calc_mode || 'NONE',
    maxUnitsPerDay: rule?.max_units_per_day ?? null
  };
};

const createProfile = async () => {
  if (!newProfile.value.policyName || !newProfile.value.versionLabel) return;
  savingProfile.value = true;
  try {
    await api.post('/billing-policy/profiles', {
      stateCode: 'CO',
      policyName: newProfile.value.policyName,
      versionLabel: newProfile.value.versionLabel,
      status: 'DRAFT'
    });
    newProfile.value.versionLabel = '';
    await loadProfiles();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create profile';
  } finally {
    savingProfile.value = false;
  }
};

const activateProfile = async () => {
  if (!agencyId.value || !activationProfileId.value) return;
  activatingProfile.value = true;
  try {
    await api.put(`/billing-policy/agency/${agencyId.value}/activation`, { profileId: activationProfileId.value });
    await loadActivation();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to activate profile';
  } finally {
    activatingProfile.value = false;
  }
};

const toggleAgencyCode = async (serviceCode, event) => {
  if (!agencyId.value) return;
  const isEnabled = Boolean(event?.target?.checked);
  try {
    await api.put(`/billing-policy/agency/${agencyId.value}/service-codes/${encodeURIComponent(serviceCode)}`, { isEnabled });
    await loadActivation();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update service code activation';
  }
};

const saveRule = async () => {
  if (!selectedProfileId.value || !ruleEditor.value.serviceCode) return;
  savingRule.value = true;
  try {
    await api.post(`/billing-policy/profiles/${selectedProfileId.value}/rules`, {
      serviceCode: ruleEditor.value.serviceCode,
      serviceDescription: ruleEditor.value.serviceDescription || null,
      minMinutes: ruleEditor.value.minMinutes,
      maxMinutes: ruleEditor.value.maxMinutes,
      unitMinutes: ruleEditor.value.unitMinutes,
      unitCalcMode: ruleEditor.value.unitCalcMode,
      maxUnitsPerDay: ruleEditor.value.maxUnitsPerDay
    });
    await loadRules();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save rule';
  } finally {
    savingRule.value = false;
  }
};

const uploadPolicyPdf = async () => {
  if (!selectedProfileId.value) return;
  const file = uploadInput.value?.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    await api.post(`/billing-policy/profiles/${selectedProfileId.value}/ingestion/upload`, form);
    if (uploadInput.value) uploadInput.value.value = '';
    await loadJobs();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to upload policy document';
  } finally {
    uploading.value = false;
  }
};

const reviewCandidate = async (candidate, status) => {
  try {
    const edit = editFor(candidate);
    await api.post(`/billing-policy/ingestion/candidates/${candidate.id}/review`, {
      status,
      serviceDescription: String(edit.serviceDescription || '').trim() || null,
      minMinutes: edit.minMinutes ?? null,
      maxMinutes: edit.maxMinutes ?? null,
      unitMinutes: edit.unitMinutes ?? null,
      unitCalcMode: String(edit.unitCalcMode || 'NONE').toUpperCase(),
      maxUnitsPerDay: edit.maxUnitsPerDay ?? null,
      credentialTier: String(edit.credentialTier || '').trim() || null,
      providerType: String(edit.providerType || '').trim() || null,
      reviewNotes: String(edit.reviewNotes || '').trim() || null
    });
    if (selectedJobId.value) await selectJob(selectedJobId.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to review candidate';
  }
};

const publishJob = async () => {
  if (!selectedJobId.value) return;
  publishingJob.value = true;
  try {
    await api.post(`/billing-policy/ingestion/jobs/${selectedJobId.value}/publish`, {
      agencyId: agencyId.value || null
    });
    await selectJob(selectedJobId.value);
    await loadRules();
    await loadActivation();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to publish candidates';
  } finally {
    publishingJob.value = false;
  }
};

const deleteJob = async (jobId) => {
  const id = Number(jobId || 0);
  if (!id) return;
  const ok = window.confirm(`Delete ingestion job #${id}? This removes extracted candidates for this manual upload.`);
  if (!ok) return;
  try {
    await api.delete(`/billing-policy/ingestion/jobs/${id}`);
    if (Number(selectedJobId.value) === id) {
      selectedJobId.value = 0;
      jobDetail.value = null;
    }
    await loadJobs();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete ingestion job';
  }
};

const billingBasisLabel = (candidate) => {
  const mode = String(candidate?.unitCalcMode || candidate?.unit_calc_mode || '').toUpperCase();
  if (mode === 'NONE') return 'Encounter';
  if (mode === 'MEDICAID_8_MINUTE_LADDER') return 'Unit (8-15)';
  if (mode === 'FIXED_BLOCK') return 'Unit (fixed)';
  return (candidate?.maxUnitsPerDay || candidate?.max_units_per_day) ? 'Day' : '-';
};

const editFor = (candidate) => {
  const id = Number(candidate?.id || 0);
  if (!id) return {};
  if (!candidateEdits.value[id]) {
    candidateEdits.value[id] = {
      serviceDescription: candidate?.service_description || '',
      minMinutes: candidate?.min_minutes ?? null,
      maxMinutes: candidate?.max_minutes ?? null,
      unitMinutes: candidate?.unit_minutes ?? null,
      unitCalcMode: candidate?.unit_calc_mode || 'NONE',
      maxUnitsPerDay: candidate?.max_units_per_day ?? null,
      credentialTier: candidate?.credential_tier || '',
      providerType: candidate?.provider_type || '',
      reviewNotes: candidate?.review_notes || '',
      status: candidate?.status || 'PENDING'
    };
  }
  return candidateEdits.value[id];
};

onMounted(loadAll);
</script>

<style scoped>
.billing-policy-engine { padding-bottom: 24px; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
h1 { margin: 0; }
.subtitle { margin: 4px 0 0; color: #6b7280; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.panel { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; margin-bottom: 14px; }
.panel-title { font-weight: 600; margin-bottom: 8px; }
.panel-title.mini { margin-top: 12px; font-size: 0.95rem; }
.row { display: flex; align-items: center; }
.row.split { justify-content: space-between; }
.row.gap { gap: 8px; }
.row.wrap { flex-wrap: wrap; }
.input { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; min-width: 160px; }
.input.short { width: 140px; min-width: 140px; }
.input.tiny { width: 110px; min-width: 110px; }
.input.wide { min-width: 280px; flex: 1; }
.list { display: grid; gap: 8px; max-height: 220px; overflow: auto; }
.list-item { text-align: left; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fff; cursor: pointer; }
.list-item.active { border-color: #3b82f6; background: #eff6ff; }
.strong { font-weight: 600; }
.hint { color: #6b7280; font-size: 0.9rem; }
.error { color: #b91c1c; margin-bottom: 10px; }
.table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.table th, .table td { border-bottom: 1px solid #eef2f7; padding: 8px; text-align: left; vertical-align: top; }
.table.compact th, .table.compact td { padding: 6px; }
.clickable { cursor: pointer; }
.citation { max-width: 360px; white-space: normal; }
.job-detail { margin-top: 12px; border-top: 1px dashed #d1d5db; padding-top: 12px; }
.extract-preview {
  max-height: 220px;
  overflow: auto;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  white-space: pre-wrap;
  margin-top: 8px;
}
@media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
</style>
