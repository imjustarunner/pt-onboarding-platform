<template>
  <div class="container careers-root">
    <div class="header">
      <div>
        <h2>Careers</h2>
        <div class="subtle">Manage active and inactive job postings and their application forms.</div>
      </div>
      <div class="header-actions">
        <div v-if="canChooseAgency" class="agency-picker">
          <label class="agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="input agency-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">
              {{ a.name }}
            </option>
          </select>
        </div>
        <button class="btn btn-secondary" @click="refresh" :disabled="loading">Refresh</button>
      </div>
    </div>
    <div class="panel public-link-panel">
      <div>
        <strong>Public careers page</strong>
        <div class="muted small">{{ publicCareersUrl || 'No agency slug found for this tenant yet.' }}</div>
      </div>
      <div class="row-actions">
        <a
          v-if="publicCareersUrl"
          class="btn btn-secondary btn-sm"
          :href="publicCareersUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open public page
        </a>
        <button class="btn btn-secondary btn-sm" :disabled="!publicCareersUrl" @click="copyPublicCareersUrl">
          Copy public link
        </button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <section class="panel create-panel">
      <h3>Create job posting</h3>
      <div class="form-grid">
        <input v-model="createForm.title" class="input" type="text" placeholder="Job title" />
        <input ref="jobFileRef" class="input" type="file" @change="onCreateFileChange" />
        <input v-model="createForm.city" class="input" type="text" placeholder="City" />
        <input v-model="createForm.state" class="input" type="text" placeholder="State" />
        <input v-model="createForm.postedDate" class="input" type="date" />
        <select v-model="createForm.educationLevel" class="input">
          <option value="">Education level (optional)</option>
          <option v-for="opt in educationLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <label class="checkbox-inline">
          <input v-model="createForm.ongoing" type="checkbox" />
          Ongoing (no deadline)
        </label>
        <input v-model="createForm.applicationDeadline" class="input" type="date" :disabled="createForm.ongoing" />
        <textarea
          v-model="createForm.descriptionText"
          class="textarea"
          rows="4"
          placeholder="Quick description shown on careers page"
          style="grid-column: 1 / -1;"
        />
      </div>
      <div class="actions">
        <button class="btn btn-primary" :disabled="creating || !createForm.title.trim()" @click="createJob">
          {{ creating ? 'Creating…' : 'Create job + application' }}
        </button>
      </div>
    </section>

    <section class="panel jobs-panel">
      <h3>Job postings</h3>
      <div v-if="loading" class="muted">Loading jobs…</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Applicants</th>
            <th>Posted</th>
            <th>Deadline</th>
            <th>Location</th>
            <th>Application form</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in jobRows" :key="row.id">
            <td>
              <div class="name">{{ row.title }}</div>
              <div class="muted small">{{ row.descriptionText || 'No description yet.' }}</div>
            </td>
            <td>
              <span class="pill" :class="row.isActive ? 'pill-active' : 'pill-inactive'">
                {{ row.isActive ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td>
              <div>{{ row.activeApplicantCount }} active</div>
              <div class="muted small">{{ row.inactiveApplicantCount }} inactive</div>
            </td>
            <td>{{ formatDate(row.postedDate) || '—' }}</td>
            <td>{{ row.applicationDeadline ? formatDate(row.applicationDeadline) : 'Ongoing' }}</td>
            <td>{{ [row.city, row.state].filter(Boolean).join(', ') || '—' }}</td>
            <td>
              <template v-if="row.applicationUrl">
                <a :href="row.applicationUrl" target="_blank" rel="noopener noreferrer">Open link</a>
              </template>
              <span v-else class="muted">Not created</span>
            </td>
            <td>
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" @click="openEdit(row)">Edit</button>
                <button class="btn btn-secondary btn-sm" @click="toggleActive(row)">
                  {{ row.isActive ? 'Deactivate' : 'Activate' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="openApplicants(row)">View applicants</button>
                <button class="btn btn-secondary btn-sm" @click="openForm(row)">
                  {{ row.linkId ? 'Form' : 'Create form' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="copyLink(row)" :disabled="!row.applicationUrl">Copy link</button>
              </div>
            </td>
          </tr>
          <tr v-if="jobRows.length === 0">
            <td colspan="8" class="muted">No jobs created yet.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-if="editingRow" class="modal-overlay" @click.self="closeEdit">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit job posting</h3>
          <button class="btn btn-secondary btn-sm" @click="closeEdit">Close</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <input v-model="editForm.title" class="input" type="text" placeholder="Job title" />
            <input ref="editFileRef" class="input" type="file" @change="onEditFileChange" />
            <div v-if="editingRow?.hasFile" class="muted small">
              Current file: {{ editingRow.originalName || 'Uploaded file' }}
              <button type="button" class="btn btn-secondary btn-sm" style="margin-left:8px;" @click="openJobFile(editingRow)">
                View
              </button>
            </div>
            <input v-model="editForm.city" class="input" type="text" placeholder="City" />
            <input v-model="editForm.state" class="input" type="text" placeholder="State" />
            <input v-model="editForm.postedDate" class="input" type="date" />
            <select v-model="editForm.educationLevel" class="input">
              <option value="">Education level (optional)</option>
              <option v-for="opt in educationLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <label class="checkbox-inline">
              <input v-model="editForm.ongoing" type="checkbox" />
              Ongoing (no deadline)
            </label>
            <input v-model="editForm.applicationDeadline" class="input" type="date" :disabled="editForm.ongoing" />
            <textarea
              v-model="editForm.descriptionText"
              class="textarea"
              rows="4"
              placeholder="Quick description shown on careers page"
              style="grid-column: 1 / -1;"
            />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" :disabled="savingEdit || !editForm.title.trim()" @click="saveEdit">
            {{ savingEdit ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const creating = ref(false);
const savingEdit = ref(false);
const error = ref('');
const jobs = ref([]);
const links = ref([]);
const applicantCounts = ref({});

const createForm = ref({
  title: '',
  descriptionText: '',
  postedDate: '',
  applicationDeadline: '',
  ongoing: true,
  city: '',
  state: '',
  educationLevel: '',
  file: null
});
const editForm = ref({
  title: '',
  descriptionText: '',
  postedDate: '',
  applicationDeadline: '',
  ongoing: true,
  city: '',
  state: '',
  educationLevel: '',
  file: null
});
const editingRow = ref(null);
const jobFileRef = ref(null);
const editFileRef = ref(null);

const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || [])
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const canChooseAgency = computed(() => agencyChoices.value.length > 1);
const selectedAgencyId = ref('');
const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  if (!slug) return path;
  return `/${slug}${path}`;
};
const effectiveAgencyId = computed(() => {
  const chosen = Number(selectedAgencyId.value || 0) || null;
  if (chosen) return chosen;
  return Number(agencyStore.currentAgency?.id || authStore.user?.agencyId || 0) || null;
});
const selectedAgency = computed(() =>
  agencyChoices.value.find((a) => Number(a?.id) === Number(effectiveAgencyId.value)) || null
);
const educationLevelOptions = [
  { value: 'bachelors', label: 'Bachelors' },
  { value: 'masters_level_intern', label: 'Masters level intern' },
  { value: 'masters_or_doctoral', label: 'Masters/Doctoral level' }
];
const publicCareersUrl = computed(() => {
  const slug = String(selectedAgency.value?.slug || '').trim();
  if (!slug) return '';
  return `${window.location.origin.replace(/\/$/, '')}/careers/${slug}`;
});

const jobRows = computed(() => {
  const mapByJob = new Map();
  for (const l of links.value || []) {
    const jdId = Number(l.job_description_id || l.jobDescriptionId || 0);
    if (!jdId) continue;
    if (!mapByJob.has(jdId)) mapByJob.set(jdId, l);
  }
  return (jobs.value || [])
    .slice()
    .sort((a, b) => {
      const aActive = a?.isActive ? 1 : 0;
      const bActive = b?.isActive ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''));
    })
    .map((j) => {
    const link = mapByJob.get(Number(j.id)) || null;
    return {
      ...j,
      linkId: link?.id || null,
      linkPublicKey: link?.public_key || link?.publicKey || null,
      applicationUrl: link?.public_key || link?.publicKey ? buildPublicIntakeUrl(link.public_key || link.publicKey) : '',
      activeApplicantCount: Number(applicantCounts.value?.[j.id]?.active || 0),
      inactiveApplicantCount: Number(applicantCounts.value?.[j.id]?.inactive || 0)
    };
  });
});
const formatDate = (v) => {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toLocaleDateString();
};

const onCreateFileChange = (e) => {
  createForm.value.file = e?.target?.files?.[0] || null;
};
const onEditFileChange = (e) => {
  editForm.value.file = e?.target?.files?.[0] || null;
};

const buildDefaultJobApplicationSteps = () => ([
  { id: `step_${Date.now()}_resume`, type: 'upload', label: 'Resume', accept: '.pdf,.doc,.docx,.txt', maxFiles: 1, required: true, visibility: 'always', allowPasteText: true },
  { id: `step_${Date.now()}_cover`, type: 'upload', label: 'Cover Letter', accept: '.pdf,.doc,.docx,.txt', maxFiles: 1, required: false, visibility: 'always', allowPasteText: true },
  {
    id: `step_${Date.now()}_references`,
    type: 'references',
    label: 'Professional references',
    required: true,
    waivable: true,
    minReferences: 3,
    authorizationNotice:
      'By submitting this information, you authorize [tenant] to contact the individuals listed and obtain information regarding your employment history, educational background, professional conduct, and qualifications for employment.'
  }
]);

const loadJobs = async () => {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/job-descriptions', {
    params: { agencyId: effectiveAgencyId.value, includeInactive: 1 }
  });
  jobs.value = Array.isArray(r.data) ? r.data : [];
};

const loadLinks = async () => {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/intake-links');
  links.value = (Array.isArray(r.data) ? r.data : []).filter((l) => (
    String(l.form_type || l.formType || '').toLowerCase() === 'job_application'
    && Number(l.organization_id || l.organizationId || 0) === Number(effectiveAgencyId.value)
  ));
};

const loadApplicantCounts = async () => {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/candidates', { params: { agencyId: effectiveAgencyId.value, stageFilter: 'all', status: 'PROSPECTIVE' } });
  const list = Array.isArray(r.data) ? r.data : [];
  const counts = {};
  for (const row of list) {
    const id = Number(row.job_description_id || 0);
    if (!id) continue;
    if (!counts[id]) counts[id] = { active: 0, inactive: 0 };
    const stage = String(row.stage || '').trim().toLowerCase();
    if (stage === 'not_hired') counts[id].inactive += 1;
    else if (stage !== 'hired') counts[id].active += 1;
  }
  applicantCounts.value = counts;
};

const ensureApplicationLink = async (jobId) => {
  const existing = (links.value || []).find((l) => Number(l.job_description_id || l.jobDescriptionId || 0) === Number(jobId));
  if (existing?.id) return existing;
  const created = await api.post(`/intake-links/from-job/${jobId}`);
  const link = created.data?.link;
  if (link?.id) {
    await api.put(`/intake-links/${link.id}`, {
      intakeSteps: buildDefaultJobApplicationSteps()
    });
  }
  return link || null;
};

const refresh = async () => {
  if (!effectiveAgencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadJobs(), loadLinks(), loadApplicantCounts()]);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load careers data';
  } finally {
    loading.value = false;
  }
};

const createJob = async () => {
  if (!effectiveAgencyId.value) return;
  try {
    creating.value = true;
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('title', String(createForm.value.title || '').trim());
    if (String(createForm.value.descriptionText || '').trim()) fd.append('descriptionText', String(createForm.value.descriptionText || '').trim());
    if (String(createForm.value.postedDate || '').trim()) fd.append('postedDate', String(createForm.value.postedDate || '').trim());
    if (!createForm.value.ongoing && String(createForm.value.applicationDeadline || '').trim()) {
      fd.append('applicationDeadline', String(createForm.value.applicationDeadline || '').trim());
    } else {
      fd.append('applicationDeadline', '');
    }
    if (String(createForm.value.city || '').trim()) fd.append('city', String(createForm.value.city || '').trim());
    if (String(createForm.value.state || '').trim()) fd.append('state', String(createForm.value.state || '').trim());
    if (String(createForm.value.educationLevel || '').trim()) fd.append('educationLevel', String(createForm.value.educationLevel || '').trim());
    if (createForm.value.file) fd.append('file', createForm.value.file);
    const r = await api.post('/hiring/job-descriptions', fd);
    const jobId = Number(r.data?.id || 0);
    if (jobId) await ensureApplicationLink(jobId);
    createForm.value = {
      title: '',
      descriptionText: '',
      postedDate: '',
      applicationDeadline: '',
      ongoing: true,
      city: '',
      state: '',
      educationLevel: '',
      file: null
    };
    if (jobFileRef.value) jobFileRef.value.value = '';
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create job';
  } finally {
    creating.value = false;
  }
};

const openEdit = (row) => {
  editingRow.value = row;
  editForm.value = {
    title: row.title || '',
    descriptionText: row.descriptionText || '',
    postedDate: row.postedDate || '',
    applicationDeadline: row.applicationDeadline || '',
    ongoing: !row.applicationDeadline,
    city: row.city || '',
    state: row.state || '',
    educationLevel: row.educationLevel || '',
    file: null
  };
  if (editFileRef.value) editFileRef.value.value = '';
};
const closeEdit = () => {
  editingRow.value = null;
  editForm.value = {
    title: '',
    descriptionText: '',
    postedDate: '',
    applicationDeadline: '',
    ongoing: true,
    city: '',
    state: '',
    educationLevel: '',
    file: null
  };
};

const saveEdit = async () => {
  if (!editingRow.value?.id || !effectiveAgencyId.value) return;
  try {
    savingEdit.value = true;
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('title', String(editForm.value.title || '').trim());
    fd.append('descriptionText', String(editForm.value.descriptionText || '').trim());
    fd.append('postedDate', String(editForm.value.postedDate || '').trim());
    fd.append('applicationDeadline', editForm.value.ongoing ? '' : String(editForm.value.applicationDeadline || '').trim());
    fd.append('city', String(editForm.value.city || '').trim());
    fd.append('state', String(editForm.value.state || '').trim());
    fd.append('educationLevel', String(editForm.value.educationLevel || '').trim());
    if (editForm.value.file) fd.append('file', editForm.value.file);
    await api.put(`/hiring/job-descriptions/${editingRow.value.id}`, fd);
    closeEdit();
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save job';
  } finally {
    savingEdit.value = false;
  }
};

const toggleActive = async (row) => {
  if (!row?.id || !effectiveAgencyId.value) return;
  try {
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('isActive', row.isActive ? '0' : '1');
    await api.put(`/hiring/job-descriptions/${row.id}`, fd);
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update status';
  }
};
const openJobFile = async (row) => {
  if (!row?.id || !effectiveAgencyId.value) return;
  try {
    const r = await api.get(`/hiring/job-descriptions/${row.id}/view`, {
      params: { agencyId: effectiveAgencyId.value }
    });
    const url = String(r.data?.url || '').trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
};

const openApplicants = (row) => {
  router.push({
    path: orgPath('/admin/hiring'),
    query: { filterJobId: String(row.id) }
  });
};

const openForm = async (row) => {
  if (!row?.id) return;
  try {
    let linkId = Number(row.linkId || 0) || null;
    if (!linkId) {
      const ensured = await ensureApplicationLink(row.id);
      linkId = Number(ensured?.id || 0) || null;
      await refresh();
    }
    if (!linkId) {
      error.value = 'Unable to create/open the digital form for this job.';
      return;
    }
    await router.push({
      path: orgPath('/admin/intake-links'),
      query: {
        editIntakeLinkId: String(linkId),
        jobDescriptionId: String(row.id),
        source: 'careers'
      }
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to open form editor';
  }
};

const copyLink = async (row) => {
  if (!row?.applicationUrl) return;
  try {
    await navigator.clipboard.writeText(row.applicationUrl);
  } catch {
    // ignore clipboard permission failures
  }
};
const copyPublicCareersUrl = async () => {
  if (!publicCareersUrl.value) return;
  try {
    await navigator.clipboard.writeText(publicCareersUrl.value);
  } catch {
    // ignore clipboard permission failures
  }
};

watch(effectiveAgencyId, async (v) => {
  if (!v) return;
  await refresh();
});

onMounted(async () => {
  try {
    if (String(authStore.user?.role || '').toLowerCase() === 'super_admin') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    // best effort
  }
  if (!selectedAgencyId.value && effectiveAgencyId.value) {
    selectedAgencyId.value = String(effectiveAgencyId.value);
  }
  await refresh();
});
</script>

<style scoped>
.careers-root { padding-top: 16px; padding-bottom: 36px; }
.header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.header-actions { display: flex; gap: 8px; align-items: flex-end; }
.subtle { color: #6b7280; font-size: 13px; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
.public-link-panel { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.form-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.input, .textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; font-size: 14px; }
.checkbox-inline { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
.actions { margin-top: 10px; display: flex; gap: 8px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { border-bottom: 1px solid #e5e7eb; padding: 10px; vertical-align: top; text-align: left; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.pill { border-radius: 999px; padding: 2px 8px; font-size: 12px; }
.pill-active { background: #dcfce7; color: #166534; }
.pill-inactive { background: #fee2e2; color: #991b1b; }
.name { font-weight: 600; }
.small { font-size: 12px; }
.muted { color: #6b7280; }
.error-banner { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; justify-content: center; align-items: center; z-index: 90; }
.modal { width: 760px; max-width: 95vw; background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #e5e7eb; }
.modal-body { padding: 12px; }
.modal-actions { display: flex; justify-content: flex-end; padding: 12px; border-top: 1px solid #e5e7eb; }
@media (max-width: 900px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
