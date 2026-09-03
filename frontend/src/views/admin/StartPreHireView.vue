<template>
  <div class="sph">
    <header class="sph-head">
      <div>
        <button type="button" class="sph-back" @click="goBack">← Applicants</button>
        <h1>Start pre-hire</h1>
        <p class="muted">Complete this page, then click Initiate. That sends the portal link and email. Nothing is sent until then.</p>
      </div>
    </header>

    <div v-if="loading" class="muted">Loading candidate…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <section class="sph-card">
        <h2>Candidate</h2>
        <p class="sph-name">{{ candidateName }}</p>
        <p class="muted">{{ candidateEmail }} · {{ jobTitle || 'Role not set' }}</p>
        <p v-if="credentialLabel" class="muted">{{ credentialLabel }}</p>
        <p v-if="locationLabel" class="muted">{{ locationLabel }}</p>
      </section>

      <section class="sph-card">
        <h2>Employment contract</h2>
        <p class="muted">Generated in this flow from agency contract defaults. Pay category is inferred from credential.</p>
        <div class="sph-grid">
          <label>Start date <input v-model="contract.startDate" type="date" /></label>
          <label>Execution date <input v-model="contract.executionDate" type="date" /></label>
          <label>Expiration date <input v-model="contract.expirationDate" type="date" /></label>
          <label>Supervisor(s) <input v-model="contract.supervisor" type="text" /></label>
          <label>License required by <input v-model="contract.licenseBy" type="date" /></label>
          <label>Min days / week <input v-model="contract.minDays" type="number" min="0" max="7" /></label>
          <label>Min hours / week <input v-model="contract.minHours" type="number" min="0" /></label>
          <label>Pay category
            <select v-model="contract.compensationCategory">
              <option value="">Infer from credential</option>
              <option value="1">1 — Unlicensed</option>
              <option value="2">2 — Pre-licensed</option>
              <option value="3">3 — Licensed</option>
            </select>
          </label>
        </div>
        <p v-if="inferredPayLabel" class="muted small">Inferred: {{ inferredPayLabel }}</p>
      </section>

      <section class="sph-card">
        <h2>Pre-hire documents for this job</h2>
        <p class="muted">Only documents attached to this posting (plus agency defaults). The unused document library dump is not listed.</p>
        <div v-if="!jobDocs.length" class="muted">No job-level documents yet. Add them on the job posting, or agency defaults will still apply on Initiate.</div>
        <label v-for="(doc, idx) in jobDocs" :key="doc.id || idx" class="sph-doc">
          <input v-model="doc.selected" type="checkbox" />
          <div>
            <strong>{{ doc.title }}</strong>
            <span class="sph-kind">{{ doc.kind || 'document' }}</span>
            <p v-if="doc.instructions" class="muted small">{{ doc.instructions }}</p>
          </div>
        </label>
        <div class="sph-upload">
          <label>Upload additional file (stored on the employee file)
            <input type="file" @change="onExtraFile" />
          </label>
          <p v-if="extraFileName" class="muted small">{{ extraFileName }}</p>
        </div>
      </section>

      <section v-if="signerAssignments.length" class="sph-card">
        <h2>Internal signers</h2>
        <label v-for="role in signerAssignments" :key="role.id" class="sph-doc">
          <span class="sph-kind">{{ role.roleLabel }}</span>
          <select v-model.number="role.userId" class="input">
            <option :value="null">Skip</option>
            <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
          </select>
        </label>
      </section>

      <p v-if="sendError" class="error">{{ sendError }}</p>
      <div class="sph-actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="sending" @click="initiate">
          {{ sending ? 'Initiating…' : 'Initiate' }}
        </button>
      </div>
      <p v-if="tokenLink" class="sph-ok">
        Portal link created:
        <a :href="tokenLink" target="_blank" rel="noopener">{{ tokenLink }}</a>
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(true);
const sending = ref(false);
const error = ref('');
const sendError = ref('');
const detail = ref(null);
const settings = ref({});
const extraFile = ref(null);
const extraFileName = ref('');
const tokenLink = ref('');
const jobDocs = ref([]);
const inferredPayLabel = ref('');
const inferredCategory = ref(null);
const signerAssignments = ref([]);
const staffUsers = ref([]);
const wizardTokens = ref({});
const contractConfigId = ref(null);
const contractTemplateId = ref(null);

const contract = reactive({
  startDate: '',
  executionDate: new Date().toISOString().slice(0, 10),
  expirationDate: '',
  supervisor: '',
  licenseBy: '',
  minDays: '',
  minHours: '',
  compensationCategory: ''
});

const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}${path}` : path;
};

const agencyId = computed(() => Number(route.query.agencyId || agencyStore.currentAgency?.id || 0));
const userId = computed(() => Number(route.params.userId || 0));
const candidateName = computed(() => {
  const u = detail.value?.user || {};
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Candidate';
});
const candidateEmail = computed(() => detail.value?.user?.personal_email || detail.value?.user?.email || '—');
const jobTitle = computed(() =>
  detail.value?.jobDescription?.title
  || detail.value?.profile?.applied_role
  || ''
);
const credentialLabel = computed(() => {
  const p = detail.value?.profile || {};
  const cred = String(p.credential || wizardTokens.value.CREDENTIAL || '').trim();
  const lic = String(p.license_number || '').trim();
  if (cred && lic) return `${cred} · ${lic}`;
  return cred || lic || '';
});
const locationLabel = computed(() => {
  const jd = detail.value?.jobDescription || {};
  const city = jd.city || '';
  const state = jd.state || '';
  return [city, state].filter(Boolean).join(', ');
});

const goBack = () => router.push(orgPath('/admin/hiring/applicants'));

const onExtraFile = (e) => {
  extraFile.value = e?.target?.files?.[0] || null;
  extraFileName.value = extraFile.value?.name || '';
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [cand, setRes, rolesRes, usersRes, wizardRes] = await Promise.all([
      api.get(`/hiring/candidates/${userId.value}`, { params: { agencyId: agencyId.value } }),
      api.get('/hiring/settings', { params: { agencyId: agencyId.value } }).catch(() => ({ data: {} })),
      api.get('/hiring/signer-roles', { params: { agencyId: agencyId.value } }).catch(() => ({ data: [] })),
      api.get('/users').catch(() => ({ data: [] })),
      api.get(`/contracts/candidates/${userId.value}/wizard-context`, { params: { agencyId: agencyId.value } }).catch(() => ({ data: {} }))
    ]);
    detail.value = cand.data;
    settings.value = setRes.data?.settings || setRes.data || {};
    staffUsers.value = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    signerAssignments.value = roles.map((r) => ({
      id: r.id,
      roleLabel: r.role_label || r.roleLabel,
      userId: r.default_user_id || r.defaultUserId || null,
      fieldKey: r.field_key || null
    }));
    wizardTokens.value = wizardRes.data?.tokens || {};
    contractConfigId.value = wizardRes.data?.suggested?.configId || settings.value.default_contract_config_id || null;
    contractTemplateId.value = wizardRes.data?.suggested?.templateId || settings.value.default_contract_template_id || null;
    if (wizardTokens.value.START_DATE) contract.startDate = String(wizardTokens.value.START_DATE).slice(0, 10);
    if (wizardTokens.value.SUPERVISOR_NAME) contract.supervisor = wizardTokens.value.SUPERVISOR_NAME;
    if (wizardTokens.value.MIN_HOURS) contract.minHours = wizardTokens.value.MIN_HOURS;
    const jd = cand.data?.jobDescription || {};
    const jobConfig = jd.prehireConfig || { documents: [] };
    const defaults = Array.isArray(settings.value.default_prehire_docs) ? settings.value.default_prehire_docs : [];
    const seen = new Set();
    const merged = [];
    for (const d of [...(jobConfig.documents || []), ...defaults]) {
      const id = String(d.id || d.title || '');
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push({
        id: d.id || `doc-${merged.length}`,
        title: d.title || d.name || 'Document',
        kind: d.kind || d.type || 'acknowledgement',
        instructions: d.instructions || '',
        templateId: d.templateId || d.documentTemplateId || null,
        selected: d.selected !== false
      });
    }
    jobDocs.value = merged;
    const cred = String(cand.data?.profile?.credential || wizardTokens.value.CREDENTIAL || '').trim();
    if (cred) {
      try {
        const { data } = await api.get('/contracts/infer-compensation', {
          params: { agencyId: agencyId.value, credential: cred, jobTitle: jobTitle.value }
        });
        inferredCategory.value = data.compensationCategory || null;
        inferredPayLabel.value = data.payCategoryLabel
          ? `Cat ${data.compensationCategory} — ${data.payCategoryLabel}`
          : '';
        if (!contract.compensationCategory && data.compensationCategory) {
          contract.compensationCategory = String(data.compensationCategory);
        }
      } catch { /* ignore */ }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load candidate';
  } finally {
    loading.value = false;
  }
};

const initiate = async () => {
  sendError.value = '';
  sending.value = true;
  try {
    if (extraFile.value) {
      const fd = new FormData();
      fd.append('file', extraFile.value);
      fd.append('title', extraFile.value.name || 'Pre-hire upload');
      fd.append('docType', 'prehire_upload');
      await api.post(`/users/${userId.value}/admin-docs`, fd);
    }
    const templateIds = jobDocs.value
      .filter((d) => d.selected && d.templateId)
      .map((d) => Number(d.templateId))
      .filter(Boolean);
    const tokens = {
      ...wizardTokens.value,
      START_DATE: contract.startDate,
      EXECUTION_DATE: contract.executionDate,
      EXPIRATION_DATE: contract.expirationDate,
      SUPERVISOR_NAME: contract.supervisor,
      LICENSURE_DEADLINE: contract.licenseBy,
      MIN_DAYS_PER_WEEK: contract.minDays,
      MIN_HOURS: contract.minHours,
      CANDIDATE_NAME: candidateName.value,
      JOB_TITLE: jobTitle.value
    };
    const { data } = await api.post(
      `/hiring/candidates/${userId.value}/send-prehire`,
      {
        documentTemplateIds: templateIds,
        selectedJobDocs: jobDocs.value.filter((d) => d.selected),
        signerAssignments: signerAssignments.value
          .filter((s) => s.userId)
          .map((s) => ({ userId: s.userId, roleLabel: s.roleLabel, fieldKey: s.fieldKey })),
        contractTokens: tokens,
        compensationCategory: contract.compensationCategory || inferredCategory.value || null,
        credential: detail.value?.profile?.credential || wizardTokens.value.CREDENTIAL || null,
        contractConfigId: contractConfigId.value,
        contractTemplateId: contractTemplateId.value,
        msgSubject: settings.value.invite_email_subject || null,
        msgBody: settings.value.invite_email_body || null
      },
      { params: { agencyId: agencyId.value } }
    );
    tokenLink.value = data?.passwordlessTokenLink || '';
  } catch (e) {
    sendError.value = e.response?.data?.error?.message || 'Failed to initiate pre-hire';
  } finally {
    sending.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.sph { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
.sph-head h1 { margin: 6px 0 4px; }
.sph-back { background: none; border: 0; color: #1a8c54; font-weight: 700; cursor: pointer; padding: 0; }
.sph-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 18px 20px;
  margin: 16px 0;
}
.sph-name { font-size: 1.2rem; font-weight: 800; margin: 0 0 4px; }
.sph-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.sph-grid label, .sph-upload label { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; font-weight: 650; }
.sph-grid input, .sph-grid select, .input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-weight: 400;
}
.sph-doc {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 0;
  border-top: 1px solid #f3f4f6;
}
.sph-kind {
  margin-left: 8px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.sph-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.sph-ok { color: #1a8c54; font-weight: 650; word-break: break-all; }
.sph-upload { margin-top: 12px; }
.muted { color: #6b7280; }
.small { font-size: 0.82rem; }
.error { color: #b91c1c; font-weight: 650; }
@media (max-width: 720px) { .sph-grid { grid-template-columns: 1fr; } }
</style>
