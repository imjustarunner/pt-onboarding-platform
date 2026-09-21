<template>
  <div class="sph">
    <header class="sph-head">
      <div>
        <button type="button" class="sph-back" @click="goBack">← Applicants</button>
        <h1>Start pre-hire</h1>
        <p class="muted">Prepare one step at a time. Review the complete pre-hire experience before sending the invitation.</p>
      </div>
    </header>

    <div v-if="loading" class="muted">Loading candidate…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <nav class="sph-steps" aria-label="Pre-hire setup"><button v-for="(label, i) in setupSteps" :key="label" type="button" :aria-current="setupStep === i ? 'step' : undefined" @click="setupStep = i"><span>{{ i + 1 }}</span>{{ label }}</button></nav>
      <p class="muted">Step {{ setupStep + 1 }} of {{ setupSteps.length }} · {{ setupSteps[setupStep] }}</p>
      <section v-show="setupStep === 0" class="sph-card">
        <h2>Confirm the person and job</h2>
        <p class="sph-name">{{ candidateName }}</p>
        <p class="muted">{{ candidateEmail }} · {{ jobTitle || 'Role not set' }}</p>
        <p v-if="credentialLabel" class="muted">{{ credentialLabel }}</p>
        <p v-if="locationLabel" class="muted">{{ locationLabel }}</p>
        <a :href="careersEditPath" target="_blank" rel="noopener">Edit the job and its pre-hire defaults ↗</a>
        <JobDescriptionSections v-if="detail?.jobDescription?.descriptionSections" :sections="detail.jobDescription.descriptionSections" :title="jobTitle" show-header compact />
        <p v-else class="sph-description">{{ detail?.jobDescription?.description_text || detail?.jobDescription?.descriptionText }}</p>
        <p v-if="currentPortalLink"><a :href="currentPortalLink" target="_blank" rel="noopener">Open {{ candidateName }}’s current portal ↗</a></p>
      </section>

      <section v-show="setupStep === 1" class="sph-card">
        <h2>Choose the pre-hire steps</h2>
        <p class="muted">A saved setup combines your agency and job defaults. A document collection adds reusable documents. Review the actual contents below; changes here apply to this person.</p>
        <label>Saved pre-hire setup<select v-model="packetTemplateId" @change="applyPacketTemplate"><option value="">Agency and job defaults</option><option v-for="p in settings.hire_packet_templates || []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label>Saved document collection (optional)<select v-model="prehirePackageId"><option :value="null">Individual steps only</option><option v-for="p in packetPackages.filter(p => p.package_type === 'pre_hire')" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <HirePackageContents documents-only :package-id="prehirePackageId" :edit-url="packagesPath" @loaded="onPackageLoaded" />
        <p><a :href="settingsPath" target="_blank" rel="noopener">Edit saved setups and handbook ↗</a></p>
        <h3>Built-in pre-hire steps</h3><ol><li v-for="item in builtInSteps" :key="item">{{ item }}</li></ol>
        <label>Workplace handbook link<input v-model="portalWorkflow.handbookUrl" type="url" placeholder="https://docs.google.com/document/d/…/edit" /></label>
        <a v-if="portalWorkflow.handbookUrl" :href="portalWorkflow.handbookUrl" target="_blank" rel="noopener">Preview handbook ↗</a>

        <label>Assigned supervisor<select v-model="portalWorkflow.supervisorUserId"><option :value="null">Not assigned yet</option><option v-for="u in staffUsers.filter(u => Number(u.id) !== Number(userId) && isSupervisor(u))" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option></select></label>
        <label class="sph-check"><input v-model="portalWorkflow.supervisorRole" type="checkbox" />This hire will perform supervisory duties</label>
        <p v-if="portalWorkflow.supervisorRole" class="muted">Adds the supervisor role, the approved supervisory duties clause to the employment agreement, and the separate supervisor acknowledgement signature step.</p>
        <HireWorkflowEditor v-model="portalWorkflow" :templates="packetDocumentTemplates" phase="pre_hire" :editor-url="documentsPath" heading="Additional pre-hire steps" />
      </section>

      <section v-show="setupStep === 2" class="sph-card">
        <h2>Employment contract and cosigners</h2>
        <p class="muted">Review the person’s information and compensation, then generate the agreement they will receive.</p>
        <p><a :href="contractsPath" target="_blank" rel="noopener">Edit contract templates, clauses and pay settings ↗</a> <button type="button" @click="refreshContractLibrary">Refresh contract settings</button></p>
        <div v-if="!contractConfigs.length" class="sph-warn">
          Create a contract configuration in the Contract Generator, then refresh the settings here to prepare and preview this person’s agreement.
        </div>
        <label v-if="contractConfigs.length" class="sph-config">
          Contract config
          <select v-model.number="contractConfigId" class="input">
            <option :value="null">Choose a contract configuration</option>
            <option v-for="c in contractConfigs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <div class="sph-grid">
          <label>Start date <input v-model="contract.startDate" type="date" /></label>
          <label>Execution date <input v-model="contract.executionDate" type="date" /></label>
          <label>Expiration date <input v-model="contract.expirationDate" type="date" /></label>
          <label class="sph-check">
            <input v-model="includeSupervisor" type="checkbox" />
            Include supervisor on the employment agreement
          </label>
          <label v-if="includeSupervisor">Supervisor(s) <input v-model="contract.supervisor" type="text" /></label>
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
        <h3>Contract details</h3><div class="sph-grid"><label v-for="field in contractFields" :key="field.key">{{ field.label }}<input v-model="contractOverrides[field.key]" /></label></div>
        <p class="muted">Confirm these values against the candidate and your agency records.</p>
        <button type="button" class="btn btn-primary" :disabled="previewBusy || !contractConfigId" @click="previewContract">{{ previewBusy ? 'Preparing preview…' : 'Update contract preview' }}</button>
        <p v-if="previewError" role="alert" class="error">{{ previewError }}</p>
        <p v-if="contractPreview?.unresolvedTokens?.length" class="error">Complete these fields: {{ contractPreview.unresolvedTokens.join(', ') }}</p>
        <div v-if="contractPreview?.unresolvedTokens?.length" class="sph-grid"><label v-for="key in additionalContractFields" :key="key">{{ key.replaceAll('_', ' ') }}<input :value="contractOverrides[key]" @input="setAdditionalContractField(key, $event.target.value)" /></label></div>
        <p v-if="contractPreview && !previewMatches" class="sph-warn">Values changed. Update the preview before reviewing it.</p>
        <iframe v-if="contractPreview" class="sph-preview" :srcdoc="contractPreview.html" sandbox="" title="Candidate employment agreement preview" />
        <label v-if="contractPreview && previewMatches && !contractPreview.unresolvedTokens?.length" class="sph-check"><input v-model="contractReviewed" type="checkbox" />I reviewed this agreement and its values.</label>
      </section>

      <section v-show="setupStep === 1" class="sph-card">
        <h2>Documents for this job</h2>
        <p class="muted">
          Pulled from this candidate’s job posting (Careers → edit posting → Pre-hire documents),
          plus agency defaults. Titles come from those settings — you don’t re-enter them here.
        </p>
        <div v-if="!jobDocs.length" class="sph-empty-docs">
          <p class="muted">No job-level documents yet.</p>
          <p class="muted small">
            Add them on the job posting under <strong>Pre-hire documents for this job</strong>
            (or set agency defaults in Hiring &amp; Pre-Hire settings). Refresh this page after editing the defaults, or add a document step above for this person.
          </p>
          <a :href="careersEditPath" target="_blank" rel="noopener">Edit job documents ↗</a>
        </div>
        <label v-for="(doc, idx) in jobDocs" :key="doc.id || idx" class="sph-doc">
          <input v-model="doc.selected" type="checkbox" />
          <div>
            <strong>{{ doc.title }}</strong>
            <span class="sph-kind">{{ docKindLabel(doc.kind) }}</span>
            <p v-if="doc.instructions" class="muted small">{{ doc.instructions }}</p>
            <a v-if="doc.url" :href="doc.url" target="_blank" rel="noopener">Open document ↗</a>
          </div>
        </label>
        <p><a :href="documentsPath" target="_blank" rel="noopener">Open the stored document library and form editor ↗</a></p>
        <p class="muted small">PDFs with existing form fields can be filled and signed in the portal. Flat or scanned forms need a reusable field layout configured once in the document editor.</p>
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

      <section v-show="setupStep === 2" class="sph-card">
        <h2>Contract cosigners</h2>
        <p class="muted">Each selected employee countersigns this employment contract after the candidate signs.</p>
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

      <section v-show="setupStep === 3" class="sph-card">
        <h2>Review {{ candidateName }}’s pre-hire experience</h2>
        <p>The invitation goes to <strong>{{ candidateEmail }}</strong>. Their portal includes:</p>
        <ol><li v-for="item in builtInSteps" :key="item">{{ item }}</li><li v-for="item in portalWorkflow.resources || []" :key="item.id">{{ item.title }} · {{ item.required === false ? 'Optional' : 'Required' }}</li><li v-for="doc in jobDocs.filter(d => d.selected && d.kind !== 'acknowledgement')" :key="doc.id">{{ doc.title }} · {{ docKindLabel(doc.kind) }}</li></ol>
        <HirePackageContents documents-only :package-id="prehirePackageId" :edit-url="packagesPath" />
        <p>Contract: {{ contractConfigs.find(c => c.id === contractConfigId)?.name || 'Choose a configuration' }} · {{ contractReviewed ? 'Preview reviewed' : 'Preview must be reviewed' }}</p>
        <p>Cosigners: {{ chosenSignerNames || 'None selected' }}</p>
        <p v-if="extraFiles.length">Additional employee files: {{ extraFiles.map(f => f.title || f.name).join(', ') }}</p>
        <p v-if="!portalWorkflow.handbookUrl" class="error">Attach the workplace handbook in step 2.</p>
        <p v-if="missingResources.length" class="error">Attach the missing resources in step 2: {{ missingResources.map(r => r.title || 'Untitled step').join(', ') }}.</p>
        <p v-if="currentPortalLink"><a :href="currentPortalLink" target="_blank" rel="noopener">View the current candidate portal ↗</a></p>
        <p class="muted">The final action prepares their documents and sends their agency portal invitation. Onboarding is prepared separately after pre-hire review.</p>
      </section>
      <p v-if="sendError" class="error">{{ sendError }}</p>
      <p v-if="contractWarning" class="sph-warn">{{ contractWarning }}</p>
      <div class="sph-actions">
        <button type="button" class="btn btn-secondary" @click="setupStep ? setupStep-- : goBack()">{{ setupStep ? 'Back' : 'Cancel' }}</button>
        <button v-if="setupStep < 3" type="button" class="btn btn-primary" @click="setupStep++">Continue →</button>
        <button type="button" v-if="setupStep === 3" class="btn btn-primary" :disabled="sending || !readyToSend" @click="initiate">
          {{ sending ? 'Preparing invitation…' : 'Prepare and send pre-hire invitation' }}
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
import { isSupervisor } from '../../utils/helpers.js';
import HirePackageContents from '../../components/hiring/HirePackageContents.vue';
import JobDescriptionSections from '../../components/careers/JobDescriptionSections.vue';
import HireWorkflowEditor from '../../components/admin/HireWorkflowEditor.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
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
const libraryContractTemplateId = ref(null);
const contractConfigs = ref([]);
const contractTaskId = ref(null);
const portalWorkflow = ref({});
const packetTemplateId = ref('');
const prehirePackageId = ref(null);
const packageDetails = ref(null);
function onPackageLoaded(value) { if (JSON.stringify(value) !== JSON.stringify(packageDetails.value)) packageDetails.value = value; }
const packetPackages = ref([]);
const packetDocumentTemplates = ref([]);
const meaningfulWorkflow = (value) => Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== '' && v != null));
let baseWorkflow = {};
function applyPacketTemplate() {
  const preset = (settings.value.hire_packet_templates || []).find(p => p.id === packetTemplateId.value);
  const resources = new Map((baseWorkflow.resources || []).map(r => [r.id, r]));
  for (const r of preset?.workflow?.resources || []) resources.set(r.id, r);
  portalWorkflow.value = JSON.parse(JSON.stringify({ ...baseWorkflow, ...meaningfulWorkflow(preset?.workflow), resources: [...resources.values()] }));
  prehirePackageId.value = preset?.prehirePackageId || settings.value.default_prehire_package_id || null;
  const excluded = new Set([...(baseWorkflow.excludedResourceIds || []), ...(preset?.workflow?.excludedResourceIds || [])]);
  portalWorkflow.value.resources = (portalWorkflow.value.resources || []).filter(r => r.phase !== 'onboarding' && !excluded.has(r.id)).map(r => ({ ...r, phase: 'pre_hire' }));
  portalWorkflow.value.handbookUrl ||= settings.value.handbook_full_url || '';
}
const includeSupervisor = ref(false);

function localDateToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
const contract = reactive({
  startDate: '',
  executionDate: localDateToday(),
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
  const q = `?agencyId=${agencyId.value}&editJobId=${detail.value?.jobDescription?.id || detail.value?.profile?.job_description_id || ''}`;
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
    const [cand, setRes, rolesRes, usersRes, wizardRes, packagesRes, documentsRes] = await Promise.all([
      api.get(`/hiring/candidates/${userId.value}`, { params: { agencyId: agencyId.value } }),
      api.get('/hiring/settings', { params: { agencyId: agencyId.value } }).catch(() => ({ data: {} })),
      api.get('/hiring/signer-roles', { params: { agencyId: agencyId.value } }).catch(() => ({ data: [] })),
      api.get('/users', { params: { agencyId: agencyId.value, staffOnly: true } }).catch(() => ({ data: [] })),
      api.get(`/contracts/candidates/${userId.value}/wizard-context`, { params: { agencyId: agencyId.value } }).catch(() => ({ data: {} })),
      api.get('/onboarding-packages', { params: { agencyId: agencyId.value } }),
      api.get('/document-templates', { params: { agencyId: agencyId.value, limit: 1000 } })
    ]);
    detail.value = cand.data;
    settings.value = setRes.data?.settings || setRes.data || {};
    staffUsers.value = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    signerAssignments.value = mapSignerRolesWithDefaults(roles, staffUsers.value);
    wizardTokens.value = wizardRes.data?.tokens || {};
    for (const field of contractFields) contractOverrides[field.key] = wizardTokens.value[field.key] || '';
    currentPortalLink.value = (await api.get(`/hiring/candidates/${userId.value}/prehire-link`, { params: { agencyId: agencyId.value } }).catch(() => ({ data: {} }))).data?.portalLink || '';
    contractConfigs.value = Array.isArray(wizardRes.data?.configs) ? wizardRes.data.configs : [];
    contractConfigId.value = wizardRes.data?.suggested?.configId
      || settings.value.default_contract_config_id
      || null;
    libraryContractTemplateId.value = settings.value.default_contract_template_id || null;
    if (wizardTokens.value.START_DATE) contract.startDate = String(wizardTokens.value.START_DATE).slice(0, 10);
    if (wizardTokens.value.SUPERVISOR_NAME) contract.supervisor = wizardTokens.value.SUPERVISOR_NAME;
    if (wizardTokens.value.MIN_HOURS) contract.minHours = wizardTokens.value.MIN_HOURS;
    const jd = cand.data?.jobDescription || {};
    const jobConfig = jd.prehireConfig || { documents: [] };
    packetPackages.value = Array.isArray(packagesRes.data) ? packagesRes.data : [];
    packetDocumentTemplates.value = Array.isArray(documentsRes.data) ? documentsRes.data : documentsRes.data?.templates || documentsRes.data?.data || [];
    const resourceDefaults = new Map((settings.value.portal_workflow?.resources || []).map(r => [r.id, r]));
    for (const r of jobConfig.workflow?.resources || []) resourceDefaults.set(r.id, r);
    baseWorkflow = { ...settings.value.portal_workflow, ...meaningfulWorkflow(jobConfig.workflow), resources: [...resourceDefaults.values()] };
    applyPacketTemplate();
    const defaults = Array.isArray(settings.value.default_prehire_docs) ? settings.value.default_prehire_docs : [];
    const seen = new Set();
    const merged = [];
    for (const d of [...(jobConfig.documents || []), ...defaults.filter(d => !(jobConfig.excludedDocumentIds || []).includes(d.id))]) {
      const id = String(d.id || d.title || '');
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push({
        ...d,
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
  if (!readyToSend.value) return;
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
    const tokens = contractTokens.value;
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
        packetTemplateId: packetTemplateId.value,
        packageId: prehirePackageId.value,
        portalWorkflow: portalWorkflow.value,
        documentTemplateIds: templateIds,
        selectedJobDocs: jobDocs.value.filter((d) => d.selected),
        signerAssignments: signers,
        contractTokens: tokens,
        compensationCategory: contract.compensationCategory || inferredCategory.value || null,
        credential: detail.value?.profile?.credential || wizardTokens.value.CREDENTIAL || null,
        contractConfigId: contractConfigId.value,
        contractPreviewHash: contractPreview.value?.previewHash,
        contractBuilderTemplateId: null,
        libraryContractTemplateId: libraryContractTemplateId.value,
        includeSupervisor: includeSupervisor.value,
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

const setupSteps = ['Person & job', 'Pre-hire steps', 'Contract & cosigners', 'Review & invite'];
const setupStep = ref(0), currentPortalLink = ref('');
const builtInSteps = ['Background check authorization', 'Job description · review and sign', 'Employment agreement · review and sign', 'Choose work email', 'Pre-employment information', 'Professional headshot', 'Workplace handbook · review', 'Final review and submission'];
const contractFields = [{ key: 'COMPANY_NAME', label: 'Employer name' }, { key: 'COMPANY_ADDRESS', label: 'Employer address' }, { key: 'ROLE_LABEL', label: 'Role label' }, { key: 'SERVICE_FOCUS', label: 'Service focus' }, { key: 'LICENSE_TYPE', label: 'License / credential' }, { key: 'ASSIGNED_OFFICE_NAME', label: 'Assigned office' }, { key: 'ASSIGNED_OFFICE_ADDRESS', label: 'Office address' }];
const contractOverrides = reactive({}), contractPreview = ref(null), contractReviewed = ref(false), previewBusy = ref(false), previewError = ref('');
const contractsPath = computed(() => orgPath(`/admin/contracts?agencyId=${agencyId.value}&candidateUserId=${userId.value}`));
const packagesPath = computed(() => orgPath(`/admin/settings?agencyId=${agencyId.value}&category=workflow&item=packages`));
const documentsPath = computed(() => orgPath(`/admin/documents?agencyId=${agencyId.value}`));
const assignedSupervisorName = computed(() => { const u = staffUsers.value.find(u => Number(u.id) === Number(portalWorkflow.value.supervisorUserId)); return u ? `${u.first_name} ${u.last_name}` : ''; });
const contractTokens = computed(() => ({ ...wizardTokens.value, ...contractOverrides,
  START_DATE: contract.startDate, EXECUTION_DATE: contract.executionDate, EXPIRATION_DATE: contract.expirationDate,
  CANDIDATE_NAME: candidateName.value, EMPLOYEE_FULL_NAME: candidateName.value, JOB_TITLE: jobTitle.value,
  SUPERVISOR_NAME: includeSupervisor.value ? (assignedSupervisorName.value || contract.supervisor) : '', INCLUDE_SUPERVISION: includeSupervisor.value ? '1' : '0',
  LICENSURE_DEADLINE: contract.licenseBy, MIN_DAYS_PER_WEEK: contract.minDays, MIN_HOURS: contract.minHours,
  IS_SUPERVISOR: portalWorkflow.value.supervisorRole ? '1' : '0', SUPERVISOR_DUTIES: portalWorkflow.value.supervisorClause || '' }));
const contractFieldKeys = ['START_DATE', 'EXECUTION_DATE', 'EXPIRATION_DATE', 'SUPERVISOR_NAME', 'LICENSURE_DEADLINE', 'MIN_DAYS_PER_WEEK', 'MIN_HOURS', ...contractFields.map(f => f.key)];
const compactToken = key => key.replaceAll('_', '').toUpperCase();
const additionalContractFields = computed(() => (contractPreview.value?.unresolvedTokens || []).filter(key => !contractFieldKeys.some(known => compactToken(known) === compactToken(key))));
function setAdditionalContractField(key, value) {
  const canonical = Object.keys(wizardTokens.value).find(known => known.includes('_') && compactToken(known) === compactToken(key)) || key;
  contractOverrides[key] = value;
  contractOverrides[canonical] = value;
}
const lastPreviewInput = ref('');
const previewMatches = computed(() => lastPreviewInput.value === JSON.stringify(previewInput.value));
const previewInput = computed(() => ({ configId: contractConfigId.value, tokens: contractTokens.value, compensationCategory: contract.compensationCategory || inferredCategory.value, credential: detail.value?.profile?.credential || wizardTokens.value.CREDENTIAL }));
watch(previewInput, () => { contractReviewed.value = false; }, { deep: true });
const missingResources = computed(() => (portalWorkflow.value.resources || []).filter(r => !r.title?.trim() || (r.kind === 'document' ? !r.templateId : r.required !== false && !r.url)));
const readyToSend = computed(() => !missingResources.value.length && contractReviewed.value && previewMatches.value && contractPreview.value && !contractPreview.value.unresolvedTokens?.length && portalWorkflow.value.handbookUrl && (!prehirePackageId.value || Number(packageDetails.value?.id) === Number(prehirePackageId.value)));
const chosenSignerNames = computed(() => [...signerAssignments.value.map(s => s.userId), adhocSignerUserId.value].filter(Boolean).map(id => { const u = staffUsers.value.find(u => String(u.id) === String(id)); return u ? `${u.first_name} ${u.last_name}` : ''; }).join(', '));
async function previewContract() {
  previewBusy.value = true; previewError.value = ''; contractReviewed.value = false;
  const input = JSON.stringify(previewInput.value);
  try { const { data } = await api.post(`/contracts/candidates/${userId.value}/preview`, JSON.parse(input), { params: { agencyId: agencyId.value } }); if (input === JSON.stringify(previewInput.value)) { contractPreview.value = data; lastPreviewInput.value = input; } }
  catch (e) { previewError.value = e.response?.data?.error?.message || 'Could not prepare the contract preview.'; }
  finally { previewBusy.value = false; }
}
async function refreshContractLibrary() {
  try { const { data } = await api.get(`/contracts/candidates/${userId.value}/wizard-context`, { params: { agencyId: agencyId.value } }); contractConfigs.value = data.configs || []; contractPreview.value = null; contractReviewed.value = false; }
  catch (e) { previewError.value = 'Could not refresh contract settings.'; }
}
onMounted(load);
</script>

<style scoped>
.sph { max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }
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
.sph-check {
  display: flex;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 650;
  grid-column: 1 / -1;
}
.sph-check input { width: auto; }
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
.sph-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:24px 0}.sph-steps button{display:flex;gap:8px;align-items:center;padding:12px;border:1px solid #d5e0dc;border-radius:8px;background:white;color:#36564b;font:inherit;font-size:13px}.sph-steps button[aria-current=step]{background:#165c46;color:white}.sph-steps span{font-weight:700}.sph-preview{display:block;width:100%;height:660px;border:1px solid #d5dfdb;border-radius:8px;margin:20px 0;background:white}.sph-description{white-space:pre-line}.sph-card>label:not(.sph-check):not(.sph-doc){display:grid;gap:8px;margin:14px 0}.sph-card select,.sph-card>label input:not([type=checkbox]){padding:10px;border:1px solid #cad8d2;border-radius:6px;font:inherit;max-width:100%;background:white;color:#223d35}.sph-card li{padding:5px 0}.sph-card a{color:#165c46}.sph-actions{background:#fff;padding:16px;border-top:1px solid #d5dfdb}.sph-actions button:disabled{opacity:.5}@media(max-width:720px){.sph-steps{grid-template-columns:1fr 1fr}.sph-preview{height:480px}}
.sph .btn{padding:12px 18px;border-radius:8px;border:1px solid #bfd2c9;font:inherit;font-weight:650;cursor:pointer}.sph .btn-primary{background:#165c46;color:#fff}.sph .btn-secondary{background:white;color:#165c46}.sph-check input,.sph-doc input[type=checkbox]{width:auto;flex:none}.sph-grid label.sph-check{flex-direction:row}.sph-card button:not(.btn):not(.sph-extra-remove){padding:8px 12px;border:1px solid #bfd2c9;border-radius:6px;background:#f5f9f7;color:#165c46;cursor:pointer}
</style>
