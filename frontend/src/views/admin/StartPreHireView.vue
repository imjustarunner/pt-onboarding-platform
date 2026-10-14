<template>
  <div class="sph">
    <header class="sph-head">
      <div>
        <button type="button" class="sph-back" @click="goBack">← Applicants</button>
        <h1>Start pre-hire</h1>
        <p role="status">{{ draftMessage }}</p><button v-if="draftSaveError" type="button" @click="flushDraft">Retry saving progress</button>
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
        <h2>Agreement and cosigners</h2>
        <p class="muted">Review the person’s information and compensation, then generate the agreement they will receive.</p>
        <p><a :href="contractsPath" target="_blank" rel="noopener">Manage standard agreement terms and pay settings ↗</a> <button type="button" @click="refreshContractLibrary">Refresh contract settings</button></p>
        <div v-if="!contractConfigs.length" class="sph-warn">
          Create a contract configuration in the Contract Generator, then refresh the settings here to prepare and preview this person’s agreement.
        </div>
        <template v-if="agreementBuilder">
          <label class="sph-config">Agreement role<select v-model="agreementVariant" @change="applyAgreementVariant"><option v-for="option in agreementBuilder.options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <p class="muted">One ongoing agreement uses the standard terms, selected service focuses, role duties, and category/level compensation. Practicum and internship use the student training agreement with the same category/level pay system. Changes to compensation do not automatically require a replacement agreement.</p>
          <p v-if="!contractConfigId" class="sph-warn">The standard terms for this agreement role are not configured. Refresh or update the agreement library.</p>
        </template>
        <label v-else-if="contractConfigs.length" class="sph-config">
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
          <label v-if="!agreementBuilder || agreementVariant === 'provider'">License required by <input v-model="contract.licenseBy" type="date" /></label>
          <label>Min hours / week <input v-model="contract.minHours" type="number" min="0" step="any" /><span v-if="contract.minHours !== '' && Number.isFinite(Number(contract.minHours)) && Number(contract.minHours) >= 0" class="muted small">Required available-to-book time: {{ Math.ceil(Number(contract.minHours) * 1.25) }} hours / week. Expected to schedule: {{ Math.ceil(Number(contract.minHours) * 1.25) }} hours / week (25% more, rounded up, to account for no-shows and rescheduling).</span></label>
          <label>Pay category
            <select v-model="contract.compensationCategory">
              <option value="">Choose a category</option>
              <option value="1">1 — Unlicensed</option>
              <option value="2">2 — Pre-licensed</option>
              <option value="3">3 — Licensed</option>
            </select>
          </label>
        </div>
        <div class="sph-grid">
          <label>Pay level<select v-model="contract.compensationLevel"><option value="">Choose a level</option><option v-for="level in 5" :key="level" :value="String(level)">Level {{ level }}{{ levelLabel(level) }}</option></select></label>
          <label>Assigned office<select v-model="officeLocationId" @change="applyOffice"><option :value="null">Select an office</option><optgroup v-for="group in officeGroups" :key="group.city" :label="group.city"><option v-for="office in group.offices" :key="office.id" :value="office.id">{{ office.name }} — {{ office.address }}</option></optgroup></select></label>
        </div>
        <p v-if="officeSource" class="muted">{{ officeSource }}</p>
        <p v-if="selectedCompensation">Category {{ contract.compensationCategory }}, Level {{ contract.compensationLevel }} · Direct: {{ money(selectedCompensation.direct_rate) }} / hour · Indirect: {{ money(selectedCompensation.indirect_rate) }} / hour · FFS base: {{ money(selectedCompensation.ffs_rate) }}</p>
        <p v-else class="sph-warn">Choose a category and level to review compensation. Configure missing rates in contract/pay settings.</p>
        <template v-if="agreementBuilder || contractConfigs.find(c => Number(c.id) === Number(contractConfigId))?.pay_mode === 'ffs'">
          <p v-if="selectedCompensation?.serviceRatesError" class="sph-warn">{{ selectedCompensation.serviceRatesError }}</p>
          <table v-else-if="selectedCompensation?.serviceRates?.length">
            <thead><tr><th>Service code</th><th>Base compensation</th><th v-if="selectedCompensation.serviceRates.some(rate => rate.reduced)">Probation / minimum-workload rate</th><th>Unit</th></tr></thead>
            <tbody><tr v-for="rate in selectedCompensation.serviceRates" :key="rate.code"><td>{{ rate.code }}</td><td>{{ rate.rate }}<template v-if="rate.additionalIndirect"><br />{{ rate.additionalIndirect }}</template></td><td v-if="selectedCompensation.serviceRates.some(rate => rate.reduced)">{{ rate.reduced || rate.rate }}</td><td>{{ rate.unit }}</td></tr></tbody>
          </table>
        </template>
        <p v-if="inferredPayLabel" class="muted small">Inferred: {{ inferredPayLabel }}</p>
        <h3>Contract details</h3>
        <p class="muted">Employer name and address come from the agency profile. Job title and role label come from the job posting. Review these values and complete anything missing before previewing.</p>
        <div class="sph-grid">
          <template v-for="field in contractFields" :key="field.key">
            <ContractServiceFocusSelect v-if="field.key === 'SERVICE_FOCUS'" v-model="contractOverrides.SERVICE_FOCUS" :options="serviceFocusOptions" />
            <label v-else>{{ field.label }}<input v-model="contractOverrides[field.key]" :readonly="['COMPANY_ADDRESS', 'ASSIGNED_OFFICE_NAME', 'ASSIGNED_OFFICE_ADDRESS'].includes(field.key) || (agreementBuilder && field.key === 'ROLE_LABEL')" /></label>
          </template>
          <label v-if="showSchoolDays">Expected school days / week <input v-model="contract.minDays" type="number" min="1" max="7" step="1" /><span class="muted small">Expected days present in the school. Each school day is approximately 8:00 a.m.–3:00 p.m., with roughly seven clients. Applies when school is all or part of the service focus.</span></label>
          <label v-if="agreementBuilder && agreementVariant === 'student'">University / training institution<input v-model="contractOverrides.UNIVERSITY_NAME" /></label>
          <label v-if="agreementBuilder && agreementVariant === 'student'">Starting training phase<select v-model="contractOverrides.TRAINING_START_PHASE"><option value="practicum">Practicum → internship</option><option value="internship">Direct-entry internship</option></select><span class="muted">One agreement covers both phases. Practicum continues into internship unless either party gives written notice of non-continuation, subject to academic requirements and the practicum review.</span></label>
        </div>
        <p v-if="!contractOverrides.COMPANY_ADDRESS" class="sph-warn">The agency’s place-of-business address is missing. Set it in agency settings, then refresh contract settings.</p>
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
        <p>Agreement: {{ agreementBuilder?.options.find(option => option.value === agreementVariant)?.label || contractConfigs.find(c => c.id === contractConfigId)?.name || 'Choose an agreement' }} · {{ contractReviewed ? 'Preview reviewed' : 'Preview must be reviewed' }}</p>
        <p>Compensation: Category {{ contract.compensationCategory || 'not selected' }}, Level {{ contract.compensationLevel || 'not selected' }}</p>
        <p v-if="!contractReviewed || !previewMatches" class="error">Return to Contract &amp; cosigners, update the preview, and confirm you reviewed it.</p>
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
        <button type="button" v-if="setupStep === 3" class="btn btn-primary" :disabled="sending || (!tokenLink && !readyToSend)" @click="tokenLink ? resendInvitation() : initiate()">
          {{ sending ? 'Sending invitation…' : tokenLink ? 'Email portal link again' : 'Prepare and send pre-hire invitation' }}
        </button>
      </div>
      <p v-if="tokenLink" role="status" :class="emailDelivery?.status === 'sent' ? 'sph-ok' : 'sph-warn'">{{ prehireInviteDeliveryMessage(emailDelivery) }}</p>
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
import ContractServiceFocusSelect from '../../components/hiring/ContractServiceFocusSelect.vue';
import JobDescriptionSections from '../../components/careers/JobDescriptionSections.vue';
import HireWorkflowEditor from '../../components/admin/HireWorkflowEditor.vue';
import { computed, onMounted, onBeforeUnmount, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import api from '../../services/api';
import { prehireInviteDeliveryMessage } from '../../utils/prehireInviteDelivery.js';
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
const emailDelivery = ref(null);
const jobDocs = ref([]);
const inferredPayLabel = ref('');
const inferredCategory = ref(null);
const compensationLevels = ref([]), offices = ref([]), officeLocationId = ref(null), officeSource = ref('');
const officeGroups = computed(() => {
  const groups = new Map();
  for (const office of offices.value) {
    const city = [office.city, office.state].filter(Boolean).join(', ') || 'Agency offices';
    if (!groups.has(city)) groups.set(city, []);
    groups.get(city).push(office);
  }
  return [...groups].map(([city, offices]) => ({ city, offices }));
});
const serviceFocusOptions = ref([]), schoolDaysEnabled = ref(false);
const agreementBuilder = ref(null), agreementVariant = ref('');
function applyAgreementVariant() {
  const option = agreementBuilder.value?.options.find(option => option.value === agreementVariant.value);
  contractConfigId.value = option?.configId || null;
  if (option) contractOverrides.ROLE_LABEL = option.roleLabel;
}
const selectedCompensation = computed(() => compensationLevels.value.find(r => Number(r.category) === Number(contract.compensationCategory) && Number(r.level) === Number(contract.compensationLevel)));
const money = value => value == null ? 'Not configured' : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value);
function levelLabel(level) { const row = compensationLevels.value.find(r => Number(r.category) === Number(contract.compensationCategory) && Number(r.level) === level); return row ? ` — ${row.label || money(row.ffs_rate ?? row.direct_rate)}` : ' — not configured'; }
function applyOffice() { contractOverrides.ASSIGNED_OFFICE_ID = officeLocationId.value || ''; const office = offices.value.find(o => Number(o.id) === Number(officeLocationId.value)); contractOverrides.ASSIGNED_OFFICE_NAME = office?.name || ''; contractOverrides.ASSIGNED_OFFICE_ADDRESS = office?.address || ''; officeSource.value = office ? 'Selected office' : ''; }

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
  compensationCategory: '',
  compensationLevel: ''
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
    case 'receipt': return 'View, download & acknowledge receipt';
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

const uploadingFiles = ref(false);
const onExtraFiles = async (e) => {
  const picked = Array.from(e?.target?.files || []);
  if (!picked.length) return;
  uploadingFiles.value = true;
  try {
    for (const file of picked) {
      const title = titleFromFilename(file.name);
      const form = new FormData(); form.append('file', file); form.append('title', title); form.append('docType', 'prehire_upload');
      const { data } = await api.post(`/users/${userId.value}/admin-docs/upload`, form);
      extraFiles.value.push({ id: data?.id || data?.document?.id, name: file.name, title });
    }
    await flushDraft();
  } catch (e) { draftSaveError.value = e.response?.data?.error?.message || 'Could not save the attached file. Select it again to retry.'; }
  finally { uploadingFiles.value = false; }
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
    compensationLevels.value = wizardRes.data?.compensationLevels || [];
    serviceFocusOptions.value = wizardRes.data?.serviceFocusOptions || [];
    schoolDaysEnabled.value = wizardRes.data?.schoolDaysEnabled === true;
    offices.value = wizardRes.data?.offices || [];
    officeLocationId.value = wizardRes.data?.suggested?.officeLocationId || null;
    officeSource.value = wizardTokens.value.ASSIGNED_OFFICE_SOURCE || '';
    contract.compensationCategory = String(wizardRes.data?.suggested?.compensationCategory || '');
    // Require a deliberate level choice; do not silently accept level 1.
    contract.compensationLevel = '';
    for (const field of contractFields) contractOverrides[field.key] = wizardTokens.value[field.key] || '';
    contractOverrides.COMPANY_ADDRESS = wizardRes.data?.agency?.address || wizardTokens.value.COMPANY_ADDRESS || '';
    contractOverrides.UNIVERSITY_NAME = wizardTokens.value.UNIVERSITY_NAME || wizardTokens.value.UNIVERSITY || '';
    const defaultOfficeSource = officeSource.value;
    applyOffice();
    officeSource.value = defaultOfficeSource;
    contractOverrides.JOB_TITLE = wizardTokens.value.JOB_TITLE || jobTitle.value;
    currentPortalLink.value = (await api.get(`/hiring/candidates/${userId.value}/prehire-link`, { params: { agencyId: agencyId.value } }).catch(() => ({ data: {} }))).data?.portalLink || '';
    contractConfigs.value = Array.isArray(wizardRes.data?.configs) ? wizardRes.data.configs : [];
    contractConfigId.value = wizardRes.data?.suggested?.configId
      || settings.value.default_contract_config_id
      || null;
    agreementBuilder.value = wizardRes.data?.agreementBuilder || null;
    if (agreementBuilder.value) { agreementVariant.value = agreementBuilder.value.suggestedVariant; contractOverrides.TRAINING_START_PHASE = agreementBuilder.value.suggestedTrainingStartPhase || 'internship'; applyAgreementVariant(); }
    libraryContractTemplateId.value = settings.value.default_contract_template_id || null;
    if (wizardTokens.value.START_DATE) contract.startDate = String(wizardTokens.value.START_DATE).slice(0, 10);
    if (wizardTokens.value.SUPERVISOR_NAME) contract.supervisor = wizardTokens.value.SUPERVISOR_NAME;
    if (wizardTokens.value.MIN_HOURS) contract.minHours = wizardTokens.value.MIN_HOURS;
    if (wizardTokens.value.MIN_DAYS_PER_WEEK) contract.minDays = wizardTokens.value.MIN_DAYS_PER_WEEK;
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
        if (data.compensationCategory) {
          contract.compensationCategory = String(data.compensationCategory);
        }
      } catch { /* ignore */ }
    }
    await restoreDraft();
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
    await flushDraft();
    if (draftSaveError.value) throw new Error(draftSaveError.value);
    for (const item of extraFiles.value.filter(item => item.file)) {
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
        compensationLevel: contract.compensationLevel,
        officeLocationId: officeLocationId.value,
        compensationCategory: contract.compensationCategory || inferredCategory.value || null,
        credential: contractOverrides.LICENSE_TYPE || detail.value?.profile?.credential || wizardTokens.value.CREDENTIAL || null,
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
    emailDelivery.value = data?.email || null;
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

const resendInvitation = async () => {
  sending.value = true;
  sendError.value = '';
  try {
    const { data } = await api.post(`/hiring/candidates/${userId.value}/email-prehire-link`, {}, { params: { agencyId: agencyId.value } });
    emailDelivery.value = data?.email || null;
    tokenLink.value = data?.passwordlessTokenLink || tokenLink.value;
  } catch (e) {
    sendError.value = e.response?.data?.error?.message || 'Failed to resend invitation.';
  } finally { sending.value = false; }
};

const setupSteps = ['Person & job', 'Pre-hire steps', 'Contract & cosigners', 'Review & invite'];
const setupStep = ref(0), currentPortalLink = ref('');
const builtInSteps = ['Background check authorization', 'Job description · review and sign', 'Employment agreement · review and sign', 'Pre-employment information', 'Professional headshot', 'Workplace handbook · review', 'Final review and submission'];
const contractFields = [{ key: 'COMPANY_NAME', label: 'Employer name' }, { key: 'COMPANY_ADDRESS', label: 'Employer address' }, { key: 'JOB_TITLE', label: 'Job title' }, { key: 'ROLE_LABEL', label: 'Role label' }, { key: 'SERVICE_FOCUS', label: 'Service focus' }, { key: 'LICENSE_TYPE', label: 'License / credential' }, { key: 'ASSIGNED_OFFICE_NAME', label: 'Assigned office' }, { key: 'ASSIGNED_OFFICE_ADDRESS', label: 'Office address' }];
const contractOverrides = reactive({}), contractPreview = ref(null), contractReviewed = ref(false), previewBusy = ref(false), previewError = ref('');
const showSchoolDays = computed(() => schoolDaysEnabled.value && /\bschools?\b/i.test(contractOverrides.SERVICE_FOCUS || ''));
watch(showSchoolDays, visible => { if (!visible) contract.minDays = ''; });
const contractsPath = computed(() => orgPath(`/admin/contracts?agencyId=${agencyId.value}&candidateUserId=${userId.value}`));
const packagesPath = computed(() => orgPath(`/admin/settings?agencyId=${agencyId.value}&category=workflow&item=packages`));
const documentsPath = computed(() => orgPath(`/admin/documents?agencyId=${agencyId.value}`));
const assignedSupervisorName = computed(() => { const u = staffUsers.value.find(u => Number(u.id) === Number(portalWorkflow.value.supervisorUserId)); return u ? `${u.first_name} ${u.last_name}` : ''; });
const contractTokens = computed(() => ({ ...wizardTokens.value, ...contractOverrides,
  AGREEMENT_SELECTION_DRIVEN: agreementBuilder.value ? '1' : '0', AGREEMENT_VARIANT: agreementVariant.value,
  COMPENSATION_CATEGORY: contract.compensationCategory, COMPENSATION_LEVEL: contract.compensationLevel,
  START_DATE: contract.startDate, EXECUTION_DATE: contract.executionDate, EXPIRATION_DATE: contract.expirationDate,
  CANDIDATE_NAME: candidateName.value, EMPLOYEE_FULL_NAME: candidateName.value,
  SUPERVISOR_NAME: includeSupervisor.value ? (assignedSupervisorName.value || contract.supervisor) : '', INCLUDE_SUPERVISION: includeSupervisor.value ? '1' : '0',
  LICENSURE_DEADLINE: contract.licenseBy, MIN_DAYS_PER_WEEK: showSchoolDays.value ? contract.minDays : '', MIN_HOURS: contract.minHours,
  IS_SUPERVISOR: portalWorkflow.value.supervisorRole ? '1' : '0', SUPERVISOR_DUTIES: portalWorkflow.value.supervisorClause || '' }));
const contractFieldKeys = computed(() => ['START_DATE', 'EXECUTION_DATE', 'EXPIRATION_DATE', 'SUPERVISOR_NAME', 'LICENSURE_DEADLINE', 'MIN_DAYS_PER_WEEK', 'MIN_HOURS', ...(agreementBuilder.value && agreementVariant.value === 'student' ? ['UNIVERSITY_NAME', 'UNIVERSITY', 'TRAINING_START_PHASE'] : []), ...contractFields.map(f => f.key)]);
const compactToken = key => key.replaceAll('_', '').toUpperCase();
const additionalContractFields = computed(() => (contractPreview.value?.unresolvedTokens || []).filter(key => !contractFieldKeys.value.some(known => compactToken(known) === compactToken(key))));
function setAdditionalContractField(key, value) {
  const canonical = Object.keys(wizardTokens.value).find(known => known.includes('_') && compactToken(known) === compactToken(key)) || key;
  contractOverrides[key] = value;
  contractOverrides[canonical] = value;
}
const lastPreviewInput = ref('');
const previewMatches = computed(() => lastPreviewInput.value === JSON.stringify(previewInput.value));
const previewInput = computed(() => ({ compensationLevel: contract.compensationLevel, officeLocationId: officeLocationId.value, configId: contractConfigId.value, tokens: contractTokens.value, compensationCategory: contract.compensationCategory || inferredCategory.value, credential: contractOverrides.LICENSE_TYPE || detail.value?.profile?.credential || wizardTokens.value.CREDENTIAL }));
watch(previewInput, () => { contractReviewed.value = false; }, { deep: true });
const missingResources = computed(() => (portalWorkflow.value.resources || []).filter(r => !r.title?.trim() || (r.kind === 'document' ? !r.templateId : r.required !== false && !r.url)));
const readyToSend = computed(() => !uploadingFiles.value && !draftSaveError.value && !missingResources.value.length && contract.compensationCategory && contract.compensationLevel && contractReviewed.value && previewMatches.value && contractPreview.value && !contractPreview.value.unresolvedTokens?.length && portalWorkflow.value.handbookUrl && (!prehirePackageId.value || Number(packageDetails.value?.id) === Number(prehirePackageId.value)));
const chosenSignerNames = computed(() => [...signerAssignments.value.map(s => s.userId), adhocSignerUserId.value].filter(Boolean).map(id => { const u = staffUsers.value.find(u => String(u.id) === String(id)); return u ? `${u.first_name} ${u.last_name}` : ''; }).join(', '));
async function previewContract() {
  if (!contract.compensationCategory || !contract.compensationLevel) { previewError.value = 'Choose a pay category and level before previewing.'; return; }
  if (!officeLocationId.value || !offices.value.some(office => Number(office.id) === Number(officeLocationId.value))) { previewError.value = 'Select the assigned office before previewing.'; return; }
  if (!contractOverrides.COMPANY_ADDRESS) { previewError.value = 'Set the agency’s place-of-business address in agency settings, then refresh contract settings.'; return; }
  if (showSchoolDays.value && (!Number.isInteger(Number(contract.minDays)) || Number(contract.minDays) < 1 || Number(contract.minDays) > 7)) { previewError.value = 'Enter expected school days per week (1–7).'; return; }
  previewBusy.value = true; previewError.value = ''; contractReviewed.value = false;
  const input = JSON.stringify(previewInput.value);
  try { const { data } = await api.post(`/contracts/candidates/${userId.value}/preview`, JSON.parse(input), { params: { agencyId: agencyId.value } }); if (input === JSON.stringify(previewInput.value)) { contractPreview.value = data; lastPreviewInput.value = input; } }
  catch (e) { previewError.value = e.response?.data?.error?.message || 'Could not prepare the contract preview.'; }
  finally { previewBusy.value = false; }
}
async function refreshContractLibrary() {
  try {
    const { data } = await api.get(`/contracts/candidates/${userId.value}/wizard-context`, { params: { agencyId: agencyId.value } });
    contractConfigs.value = data.configs || []; compensationLevels.value = data.compensationLevels || []; offices.value = data.offices || [];
    contractOverrides.COMPANY_ADDRESS = data.agency?.address || data.tokens?.COMPANY_ADDRESS || '';
    if (!offices.value.some(office => Number(office.id) === Number(officeLocationId.value))) officeLocationId.value = data.suggested?.officeLocationId || null;
    applyOffice();
    if (!officeLocationId.value) officeSource.value = data.tokens?.ASSIGNED_OFFICE_SOURCE || '';
    serviceFocusOptions.value = data.serviceFocusOptions || []; schoolDaysEnabled.value = data.schoolDaysEnabled === true;
    agreementBuilder.value = data.agreementBuilder || null;
    if (agreementBuilder.value) { agreementVariant.value ||= agreementBuilder.value.suggestedVariant; contractOverrides.TRAINING_START_PHASE ||= agreementBuilder.value.suggestedTrainingStartPhase || 'internship'; applyAgreementVariant(); }
    contractPreview.value = null; contractReviewed.value = false;
  }
  catch (e) { previewError.value = 'Could not refresh contract settings.'; }
}
watch(() => contractOverrides.LICENSE_TYPE, async credential => {
  if (loading.value || !credential) return;
  try { const { data } = await api.get('/contracts/infer-compensation', { params: { agencyId: agencyId.value, credential, jobTitle: jobTitle.value } });
    if (credential !== contractOverrides.LICENSE_TYPE) return;
    inferredCategory.value = data.compensationCategory; inferredPayLabel.value = data.payCategoryLabel;
    contract.compensationCategory = String(data.compensationCategory || ''); contract.compensationLevel = '';
  } catch { previewError.value = 'Could not infer compensation. Select the category and level explicitly.'; }
});

const draftRevision = ref(0), draftReady = ref(false), draftSaving = ref(false), draftSaveError = ref('');
const draftState = computed(() => ({ contract: { ...contract }, contractOverrides: { ...contractOverrides }, agreementVariant: agreementVariant.value,
  contractConfigId: contractConfigId.value, officeLocationId: officeLocationId.value, includeSupervisor: includeSupervisor.value,
  signerAssignments: signerAssignments.value, adhocSignerUserId: adhocSignerUserId.value,
  prehirePackageId: prehirePackageId.value, packetTemplateId: packetTemplateId.value,
  portalWorkflow: portalWorkflow.value, jobDocs: jobDocs.value, extraFiles: extraFiles.value.map(({ id, name, title }) => ({ id, name, title })), setupStep: setupStep.value }));
const savedDraft = ref('');
let draftTimer, savingDraft;
const draftDirty = computed(() => draftReady.value && JSON.stringify(draftState.value) !== savedDraft.value);
const draftMessage = computed(() => draftSaveError.value || (uploadingFiles.value ? 'Saving attached files…' : draftSaving.value ? 'Saving progress…' : draftDirty.value ? 'Unsaved changes' : draftReady.value ? 'Progress saved. You can return to this candidate later.' : 'Loading saved progress…'));
async function restoreDraft() {
  const { data } = await api.get(`/hiring/candidates/${userId.value}/prehire-draft`, { params: { agencyId: agencyId.value } });
  const agencyAddress = contractOverrides.COMPANY_ADDRESS;
  const d = data?.draft;
  draftRevision.value = Number(data?.revision || 0);
  if (d) {
    if (d.contract) Object.assign(contract, d.contract);
    if (d.contractOverrides) Object.assign(contractOverrides, d.contractOverrides);
    for (const [key, target] of Object.entries({ agreementVariant, contractConfigId, officeLocationId, includeSupervisor, signerAssignments, adhocSignerUserId, prehirePackageId, packetTemplateId, portalWorkflow, jobDocs, extraFiles, setupStep })) {
      if (d[key] !== undefined) target.value = d[key];
    }
    if (agreementBuilder.value) applyAgreementVariant();
    // Always resolve source-owned office/address data against the current agency records.
    contractOverrides.COMPANY_ADDRESS = agencyAddress;
    if (!offices.value.some(o => Number(o.id) === Number(officeLocationId.value))) officeLocationId.value = null;
    applyOffice();
    contractPreview.value = null; contractReviewed.value = false;
  }
  await nextTick();
  savedDraft.value = JSON.stringify(draftState.value); draftReady.value = true;
}
async function flushDraft() {
  clearTimeout(draftTimer);
  while (savingDraft) { await savingDraft; if (draftSaveError.value) return; }
  if (!draftReady.value || JSON.stringify(draftState.value) === savedDraft.value) return;
  const snapshot = JSON.stringify(draftState.value);
  draftSaving.value = true; draftSaveError.value = '';
  savingDraft = api.put(`/hiring/candidates/${userId.value}/prehire-draft`, { draft: JSON.parse(snapshot), revision: draftRevision.value }, { params: { agencyId: agencyId.value } })
    .then(({ data }) => { draftRevision.value = data.revision; savedDraft.value = snapshot; })
    .catch(e => { draftSaveError.value = e.response?.data?.error?.message || 'Progress could not be saved. Retry before leaving this page.'; })
    .finally(() => { draftSaving.value = false; savingDraft = null; });
  await savingDraft;
  if (!draftSaveError.value && JSON.stringify(draftState.value) !== savedDraft.value) await flushDraft();
}
watch(draftState, () => { if (!draftReady.value) return; clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 350); }, { deep: true });
function warnUnsaved(event) { if (draftDirty.value || uploadingFiles.value || draftSaveError.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => window.addEventListener('beforeunload', warnUnsaved));
onBeforeUnmount(() => { clearTimeout(draftTimer); window.removeEventListener('beforeunload', warnUnsaved); void flushDraft(); });
onBeforeRouteLeave(async () => { if (uploadingFiles.value) return false; await flushDraft(); return !draftSaveError.value; });

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
