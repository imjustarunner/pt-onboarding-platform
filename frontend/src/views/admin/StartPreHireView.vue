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
        <p class="muted">Generated in this flow from the selected contract config (or agency default). Pay category is inferred from credential.</p>
        <div v-if="!contractConfigs.length && !libraryContractTemplateId" class="sph-warn">
          No contract config is set up for this tenant yet. Create one in Contract Generator (or pick a library contract template in Hiring &amp; Pre-Hire settings). Initiate will still send the portal link, but the hire will not get a contract step until that is configured.
        </div>
        <label v-if="contractConfigs.length" class="sph-config">
          Contract config
          <select v-model.number="contractConfigId" class="input">
            <option :value="null">Use agency / job default</option>
            <option v-for="c in contractConfigs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
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
        <p class="muted">
          Pulled from this candidate’s job posting (Careers → edit posting → Pre-hire documents),
          plus agency defaults. Titles come from those settings — you don’t re-enter them here.
        </p>
        <div v-if="!jobDocs.length" class="sph-empty-docs">
          <p class="muted">No job-level documents yet.</p>
          <p class="muted small">
            Add them on the job posting under <strong>Pre-hire documents for this job</strong>
            (or set agency defaults in Hiring &amp; Pre-Hire settings). They’ll appear here on Initiate.
          </p>
          <router-link
            v-if="careersEditPath"
            class="sph-careers-link"
            :to="careersEditPath"
          >Open job posting settings</router-link>
        </div>
        <label v-for="(doc, idx) in jobDocs" :key="doc.id || idx" class="sph-doc">
          <input v-model="doc.selected" type="checkbox" />
          <div>
            <strong>{{ doc.title }}</strong>
            <span class="sph-kind">{{ docKindLabel(doc.kind) }}</span>
            <p v-if="doc.instructions" class="muted small">{{ doc.instructions }}</p>
          </div>
        </label>
        <div class="sph-upload">
          <label>Upload additional files (stored on the employee file)
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*" @change="onExtraFiles" />
          </label>
          <p class="muted small">
            You can select multiple files. Titles default from each filename (editable below).
          </p>
          <ul v-if="extraFiles.length" class="sph-extra-list">
            <li v-for="(f, idx) in extraFiles" :key="`${f.name}-${idx}`" class="sph-extra-item">
              <label>Title
                <input v-model="f.title" type="text" class="input" :placeholder="f.name" />
              </label>
              <div class="sph-extra-meta">
                <span class="muted small">{{ f.name }}</span>
                <button type="button" class="sph-extra-remove" @click="removeExtraFile(idx)">Remove</button>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section class="sph-card">
        <h2>Internal signers (cosigners)</h2>
        <p class="muted">Each selected person gets a countersign to-do after the candidate signs the employment contract (and other signature docs).</p>
        <div v-if="!signerAssignments.length" class="muted small" style="margin-bottom:10px;">
          No signer roles configured yet.
          <router-link :to="settingsPath">Add roles in Hiring &amp; Pre-Hire settings</router-link>,
          or add an ad-hoc signer below.
        </div>
        <label v-for="role in signerAssignments" :key="role.id" class="sph-doc">
          <span class="sph-kind">{{ role.roleLabel }}</span>
          <select v-model.number="role.userId" class="input">
            <option :value="null">Skip</option>
            <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
          </select>
        </label>
        <label class="sph-doc">
          <span class="sph-kind">+ Add signer</span>
          <select v-model.number="adhocSignerUserId" class="input">
            <option :value="null">None</option>
            <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
          </select>
        </label>
      </section>

      <p v-if="sendError" class="error">{{ sendError }}</p>
      <p v-if="contractWarning" class="sph-warn">{{ contractWarning }}</p>
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
      <p v-if="tokenLink && contractTaskId" class="sph-ok">Employment contract task #{{ contractTaskId }} assigned to the candidate.</p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { mapSignerRolesWithDefaults } from '../../utils/hiringSignerDefaults.js';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(true);
const sending = ref(false);
const error = ref('');
const sendError = ref('');
const contractWarning = ref('');
const detail = ref(null);
const settings = ref({});
const extraFiles = ref([]);
const tokenLink = ref('');
const jobDocs = ref([]);
const inferredPayLabel = ref('');
const inferredCategory = ref(null);
const signerAssignments = ref([]);
const staffUsers = ref([]);
const adhocSignerUserId = ref(null);
const wizardTokens = ref({});
const contractConfigId = ref(null);
const contractBuilderTemplateId = ref(null);
const libraryContractTemplateId = ref(null);
const contractConfigs = ref([]);
const contractTaskId = ref(null);

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

const careersEditPath = computed(() => {
  const q = agencyId.value ? `?agencyId=${agencyId.value}` : '';
  return orgPath(`/admin/careers${q}`);
});

const settingsPath = computed(() => {
  const q = agencyId.value ? `?agencyId=${agencyId.value}&category=workflow&item=hiring-prehire` : '?category=workflow&item=hiring-prehire';
  return orgPath(`/admin/settings${q}`);
});

const docKindLabel = (kind) => {
  switch (String(kind || '').toLowerCase()) {
    case 'company_document': return 'company document';
    case 'upload': return 'candidate upload';
    case 'print_only': return 'printable';
    case 'reference': return 'external link';
    case 'acknowledgement': return 'job description sign';
    default: return kind || 'document';
  }
};

const goBack = () => router.push(orgPath('/admin/hiring/applicants'));

const titleFromFilename = (name) =>
  String(name || 'Document').replace(/\.[^.]+$/, '').trim() || 'Document';

const onExtraFiles = (e) => {
  const picked = Array.from(e?.target?.files || []);
  if (!picked.length) return;
  const next = [...extraFiles.value];
  for (const file of picked) {
    next.push({
      file,
      name: file.name,
      title: titleFromFilename(file.name)
    });
  }
  extraFiles.value = next;
  if (e?.target) e.target.value = '';
};

const removeExtraFile = (idx) => {
  extraFiles.value = extraFiles.value.filter((_, i) => i !== idx);
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
    signerAssignments.value = mapSignerRolesWithDefaults(roles, staffUsers.value);
    wizardTokens.value = wizardRes.data?.tokens || {};
    contractConfigs.value = Array.isArray(wizardRes.data?.configs) ? wizardRes.data.configs : [];
    contractConfigId.value = wizardRes.data?.suggested?.configId
      || settings.value.default_contract_config_id
      || null;
    contractBuilderTemplateId.value = wizardRes.data?.suggested?.templateId || null;
    libraryContractTemplateId.value = settings.value.default_contract_template_id || null;
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
  contractWarning.value = '';
  contractTaskId.value = null;
  sending.value = true;
  try {
    for (const item of extraFiles.value) {
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('title', String(item.title || '').trim() || titleFromFilename(item.name));
      fd.append('docType', 'prehire_upload');
      await api.post(`/users/${userId.value}/admin-docs/upload`, fd);
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
    const signers = [
      ...signerAssignments.value
        .filter((s) => s.userId)
        .map((s) => ({ userId: s.userId, roleLabel: s.roleLabel, fieldKey: s.fieldKey })),
      ...(adhocSignerUserId.value
        ? [{ userId: adhocSignerUserId.value, roleLabel: 'Cosigner', fieldKey: null }]
        : [])
    ];
    const { data } = await api.post(
      `/hiring/candidates/${userId.value}/send-prehire`,
      {
        documentTemplateIds: templateIds,
        selectedJobDocs: jobDocs.value.filter((d) => d.selected),
        signerAssignments: signers,
        contractTokens: tokens,
        compensationCategory: contract.compensationCategory || inferredCategory.value || null,
        credential: detail.value?.profile?.credential || wizardTokens.value.CREDENTIAL || null,
        contractConfigId: contractConfigId.value,
        contractBuilderTemplateId: contractBuilderTemplateId.value,
        libraryContractTemplateId: libraryContractTemplateId.value,
        msgSubject: settings.value.invite_email_subject || null,
        msgBody: settings.value.invite_email_body || null
      },
      { params: { agencyId: agencyId.value } }
    );
    tokenLink.value = data?.passwordlessTokenLink || '';
    contractTaskId.value = data?.contractTaskId || null;
    contractWarning.value = data?.contractWarning || '';
    extraFiles.value = [];
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
  margin: 10px 0;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.sph-empty-docs {
  padding: 10px 0 4px;
}
.sph-careers-link {
  display: inline-block;
  margin-top: 8px;
  color: #1a8c54;
  font-weight: 700;
  text-decoration: none;
}
.sph-careers-link:hover { text-decoration: underline; }
.sph-extra-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sph-extra-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
}
.sph-extra-item label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 650;
}
.sph-extra-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
.sph-extra-remove {
  border: 0;
  background: none;
  color: #b91c1c;
  font-weight: 650;
  cursor: pointer;
  font-size: 0.8rem;
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
.sph-warn {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 8px 0 14px;
  font-size: 0.9rem;
}
.sph-config { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; font-weight: 650; }
.sph-config .input { font-weight: 400; }
.sph-upload { margin-top: 12px; }
.muted { color: #6b7280; }
.small { font-size: 0.82rem; }
.error { color: #b91c1c; font-weight: 650; }
@media (max-width: 720px) { .sph-grid { grid-template-columns: 1fr; } }
</style>
