<template>
  <div class="pu-admin">
    <header class="head">
      <div>
        <h1>Provider Update</h1>
        <p class="muted">Modular staff updates with toggleable sections, email from People Ops, time tracking, and payroll submit.</p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn" @click="tab = 'handbook'">Handbook Updates</button>
        <button type="button" class="btn primary" @click="startCompose">New push</button>
      </div>
    </header>

    <nav class="tabs">
      <button type="button" :class="{ active: tab === 'pushes' }" @click="tab = 'pushes'">Past pushes</button>
      <button type="button" :class="{ active: tab === 'compose' }" @click="tab = 'compose'">Compose</button>
      <button type="button" :class="{ active: tab === 'handbook' }" @click="tab = 'handbook'">Handbook Updates</button>
      <button type="button" :class="{ active: tab === 'questions' }" @click="loadQuestions(); tab = 'questions'">
        Handbook Q&amp;A
      </button>
    </nav>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="success" class="ok">{{ success }}</p>

    <!-- Past pushes -->
    <section v-if="tab === 'pushes'" class="panel">
      <div class="toolbar">
        <button type="button" class="btn" :disabled="loading" @click="loadPushes">Refresh</button>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Done</th>
            <th>Minutes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pushes" :key="p.id">
            <td>{{ p.title }}</td>
            <td>{{ p.status }}</td>
            <td>{{ formatDate(p.sent_at) }}</td>
            <td>{{ p.finalized_count || 0 }}/{{ p.recipient_count || 0 }}</td>
            <td>{{ Math.round(Number(p.total_active_seconds || 0) / 60) }}</td>
            <td class="row-actions">
              <button type="button" class="btn sm" @click="openPush(p)">View</button>
              <button type="button" class="btn sm" @click="exportPush(p)">Export</button>
              <button
                type="button"
                class="btn sm primary"
                :disabled="!!p.payroll_submitted_at || busy"
                @click="submitPayroll(p)"
              >
                {{ p.payroll_submitted_at ? 'Payroll submitted' : 'Submit for Payroll' }}
              </button>
            </td>
          </tr>
          <tr v-if="!pushes.length"><td colspan="6" class="muted">No pushes yet.</td></tr>
        </tbody>
      </table>

      <div v-if="selectedPush" class="detail">
        <h3>{{ selectedPush.title }} — recipients &amp; testing tokens</h3>
        <p class="muted">
          Sections on: {{ (selectedPush.enabledKeys || []).join(', ') }}. Open a token link to experience that
          provider’s Update (Hogwarts / Demo / CPA / Provider+ included when sent).
        </p>
        <div class="toolbar">
          <label class="check">
            <input v-model="showDemoOnly" type="checkbox" /> Demo / Hogwarts only
          </label>
          <button type="button" class="btn sm" @click="copyAllDemoLinks">Copy demo links</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Role</th>
              <th>Email</th>
              <th>Status</th>
              <th>Sections</th>
              <th>Minutes</th>
              <th>Token link</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredRecipients" :key="r.id">
              <td>
                {{ r.first_name }} {{ r.last_name }}
                <span v-if="Number(r.is_demo_snapshot)" class="badge demo">demo</span>
              </td>
              <td><span class="badge role">{{ r.role_snapshot || '—' }}</span></td>
              <td>{{ r.email }}</td>
              <td>{{ r.status }}</td>
              <td>{{ r.sections_completed }}/{{ r.sections_total }}</td>
              <td>{{ Math.round(Number(r.active_seconds || 0) / 60) }}</td>
              <td class="row-actions">
                <a v-if="r.publicUrl" class="btn sm" :href="r.publicUrl" target="_blank" rel="noopener">Open</a>
                <button v-if="r.publicUrl" type="button" class="btn sm" @click="copyText(r.publicUrl)">Copy</button>
              </td>
            </tr>
            <tr v-if="!filteredRecipients.length">
              <td colspan="7" class="muted">No recipients yet — send the push (include demo testers) to generate tokens.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Compose -->
    <section v-if="tab === 'compose'" class="panel compose glass">
      <div class="compose-top">
        <label class="field grow">
          <span>Push title</span>
          <input v-model="draft.title" class="input" placeholder="Provider Update — August 2026" />
        </label>
        <button type="button" class="btn" @click="previewFullOpen = true">Preview full</button>
      </div>
      <label class="field">
        <span>Internal notes</span>
        <textarea v-model="draft.notes" rows="2" class="input" />
      </label>

      <div class="attach glass-inset">
        <div class="attach-head">
          <div>
            <h3>Admin Update attachment</h3>
            <p class="hint">Pick the monthly Admin Update (e.g. August 2026). It appears as its own step in Provider Update — embedded only there.</p>
          </div>
          <button type="button" class="btn sm" :disabled="busy" @click="createAdminUpdate">+ New Admin Update</button>
        </div>
        <label class="field">
          <span>Attach Admin Update</span>
          <select v-model="draft.attachedAdminUpdateId" class="input" @change="onAttachChange">
            <option :value="null">— Select —</option>
            <option v-for="u in adminUpdates" :key="u.id" :value="u.id">
              {{ u.title }} · {{ u.status }}{{ u.sent_at ? ` · ${formatDate(u.sent_at)}` : '' }}
            </option>
          </select>
        </label>
        <ProviderUpdateAdminUpdateEmbed
          v-if="draft.attachedAdminUpdateId"
          editable
          preview-mode
          mode="auth"
          :agency-id="agencyId"
          :update-id="draft.attachedAdminUpdateId"
          @updated="loadAdminUpdates"
        />
      </div>

      <div class="attach glass-inset">
        <h3>Contract amendment plan</h3>
        <p class="hint">
          For the upcoming Provider Update, use <strong>Job description acknowledgment</strong> so each person
          receives a personalized addendum with their Job Description clause (<code>JOB_DESC_JD_*</code>) and an
          agreement to those duties. Legacy mode still supports a static document template ID.
        </p>
        <label class="field">
          <span>Amendment type</span>
          <select v-model="draft.amendmentPlan.mode" class="input">
            <option value="job_description_acknowledgment">Job description acknowledgment (per-person JD clause)</option>
            <option value="document_template">Custom document template (legacy)</option>
          </select>
        </label>
        <div class="row wrap">
          <label class="field">
            <span>Effective date</span>
            <input v-model="draft.amendmentPlan.effectiveDate" type="date" class="input" />
          </label>
          <label class="field grow">
            <span>Title</span>
            <input v-model="draft.amendmentPlan.title" class="input" placeholder="August 2026 Job Description Acknowledgment" />
          </label>
        </div>
        <p v-if="draft.amendmentPlan.mode === 'job_description_acknowledgment'" class="hint">
          Uses contract config <code>itsco_job_description_acknowledgment_addendum</code> — resolves each employee’s JD
          from their hiring profile or current title, then embeds the matching <code>JOB_DESC_JD_*</code> clause.
        </p>
        <div v-else class="row wrap">
          <label class="field grow">
            <span>Document template ID</span>
            <input v-model="draft.amendmentPlan.documentTemplateId" class="input" placeholder="e.g. template id" />
          </label>
        </div>
        <label class="field">
          <span>Who sees Amendments step</span>
          <select v-model="draft.audience.amendments.mode" class="input">
            <option value="all">All recipients of this push</option>
            <option value="selected">Only selected people</option>
          </select>
        </label>
        <div v-if="draft.audience.amendments.mode === 'selected'" class="picker">
          <label v-for="p in eligibleProviders" :key="'am-' + p.provider_user_id" class="check">
            <input v-model="draft.audience.amendments.userIds" type="checkbox" :value="p.provider_user_id" />
            {{ p.first_name }} {{ p.last_name }}
            <span class="badge role">{{ p.role || '—' }}</span>
            <span v-if="p.is_demo" class="badge demo">{{ p.account_group || 'demo' }}</span>
          </label>
        </div>
        <a class="link" :href="documentsAdminHref" target="_blank" rel="noopener">Open Documents library →</a>
      </div>

      <div class="attach glass-inset">
        <h3>Client Fall action items</h3>
        <p class="hint">
          Auto mode shows this step only for providers who currently have school clients with open Fall action items
          (confirmation, assign day, etc.). Or force all / selected.
        </p>
        <label class="field">
          <span>Who sees Client Fall Update step</span>
          <select v-model="draft.audience.client_fall_update.mode" class="input">
            <option value="auto">Auto — only providers with current action-item clients</option>
            <option value="all">All recipients</option>
            <option value="selected">Only selected people</option>
          </select>
        </label>
        <div v-if="draft.audience.client_fall_update.mode === 'selected'" class="picker">
          <label v-for="p in eligibleProviders" :key="'cf-' + p.provider_user_id" class="check">
            <input v-model="draft.audience.client_fall_update.userIds" type="checkbox" :value="p.provider_user_id" />
            {{ p.first_name }} {{ p.last_name }}
            <span class="badge role">{{ p.role || '—' }}</span>
          </label>
        </div>
      </div>

      <div class="attach glass-inset">
        <h3>Send audience</h3>
        <p class="hint">
          Includes school-assigned providers plus Demo / Hogwarts testers (provider, provider+, CPA, intern) so you can
          open each role’s token.
        </p>
        <label class="field">
          <span>Send to</span>
          <select v-model="sendMode" class="input">
            <option value="all">Everyone eligible (school + demo testers)</option>
            <option value="demo">Demo / Hogwarts testers only</option>
            <option value="selected">Selected people only</option>
          </select>
        </label>
        <div v-if="sendMode !== 'all'" class="picker">
          <label v-for="p in sendPickerList" :key="'send-' + p.provider_user_id" class="check">
            <input v-model="selectedSendIds" type="checkbox" :value="p.provider_user_id" />
            {{ p.first_name }} {{ p.last_name }}
            <span class="badge role">{{ p.role || '—' }}</span>
            <span v-if="p.is_demo" class="badge demo">{{ p.account_group || 'demo' }}</span>
          </label>
        </div>
      </div>

      <h3>Pages &amp; sections (default on)</h3>
      <p class="hint">
        Overview shows these as pages. Admin Update / Handbook / Amendments stand alone; User Updates, Profile, and
        School Client bundle several items on one page.
      </p>
      <div class="section-list">
        <div v-for="page in pageCatalog" :key="page.key" class="page-group glass-inset">
          <div class="page-group-head">
            <div>
              <strong>{{ page.title }}</strong>
              <p class="hint">{{ page.alone ? 'Standalone page' : `Bundled page · ${page.sectionKeys.length} items` }}</p>
            </div>
            <button type="button" class="btn sm" @click="previewKey = previewKey === page.key ? '' : page.key">
              {{ previewKey === page.key ? 'Hide preview' : 'Preview page' }}
            </button>
          </div>
          <div class="page-toggles">
            <label v-for="s in sectionsForPage(page)" :key="s.key" class="toggle">
              <input v-model="draft.config[s.key]" type="checkbox" />
              <span>{{ s.title }}</span>
            </label>
          </div>
          <ProviderUpdateLivePreview
            v-if="previewKey === page.key"
            :sections="enabledSectionsForPage(page)"
            :initial-page-key="page.key"
            :agency-id="agencyId"
            :admin-update-id="draft.attachedAdminUpdateId"
          />
        </div>
      </div>

      <div class="compose-actions">
        <button type="button" class="btn" :disabled="busy" @click="saveDraft">Save draft</button>
        <button type="button" class="btn" @click="previewFullOpen = true">Preview full</button>
        <button type="button" class="btn primary" :disabled="busy" @click="saveAndSend">
          {{ busy ? 'Sending…' : 'Send to providers' }}
        </button>
      </div>
      <p class="muted">
        Email: from People Ops (po@itsco.health) · reply-to technology@itsco.health · subject
        “Provider Update : Response Needed”
      </p>
    </section>

    <Teleport to="body">
      <div v-if="previewFullOpen" class="full-modal" @click.self="previewFullOpen = false">
        <div class="full-shell">
          <div class="full-top">
            <div>
              <strong>Preview full</strong>
              <p class="muted">Provider Update overview with currently enabled sections</p>
            </div>
            <button type="button" class="btn" @click="previewFullOpen = false">Close</button>
          </div>
          <ProviderUpdateLivePreview
            overview-mode
            :sections="enabledPreviewSections"
            :agency-id="agencyId"
            :admin-update-id="draft.attachedAdminUpdateId"
          />
        </div>
      </div>
    </Teleport>

    <!-- Handbook admin -->
    <section v-if="tab === 'handbook'" class="panel">
      <WorkplaceHandbookAdmin
        :agency-id="agencyId"
        :admin-update-id="draft.attachedAdminUpdateId"
        :push-id="draft.id"
      />
    </section>

    <!-- Questions -->
    <section v-if="tab === 'questions'" class="panel">
      <table class="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Asker</th>
            <th>Section</th>
            <th>Question</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="q in questions" :key="q.id">
            <td>{{ formatDate(q.created_at) }}</td>
            <td>{{ q.first_name }} {{ q.last_name }}</td>
            <td>{{ q.section_title || '—' }}</td>
            <td>{{ q.question_text }}</td>
            <td>{{ q.status }}</td>
          </tr>
          <tr v-if="!questions.length"><td colspan="5" class="muted">No handbook questions yet.</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../../services/api';
import { PROVIDER_UPDATE_SECTIONS, PROVIDER_UPDATE_PAGES, defaultSectionConfig } from '../../utils/providerUpdate';
import WorkplaceHandbookAdmin from '../handbook/WorkplaceHandbookAdmin.vue';
import ProviderUpdateLivePreview from '../provider/ProviderUpdateLivePreview.vue';
import ProviderUpdateAdminUpdateEmbed from '../provider/ProviderUpdateAdminUpdateEmbed.vue';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  organizationSlug: { type: String, default: '' },
  agencyName: { type: String, default: '' }
});

const tab = ref('pushes');
const catalog = PROVIDER_UPDATE_SECTIONS;
const pageCatalog = PROVIDER_UPDATE_PAGES.map((p) => ({
  ...p,
  alone: p.sectionKeys.length === 1
}));
const pushes = ref([]);
const recipients = ref([]);
const selectedPush = ref(null);
const questions = ref([]);
const adminUpdates = ref([]);
const eligibleProviders = ref([]);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const success = ref('');
const previewKey = ref('');
const previewFullOpen = ref(false);
const showDemoOnly = ref(false);
const sendMode = ref('all');
const selectedSendIds = ref([]);
const draft = reactive({
  id: null,
  title: 'Provider Update',
  notes: '',
  config: defaultSectionConfig(),
  attachedAdminUpdateId: null,
  audience: {
    amendments: { mode: 'all', userIds: [] },
    client_fall_update: { mode: 'auto', userIds: [] }
  },
  amendmentPlan: {
    mode: 'job_description_acknowledgment',
    contractConfigSlug: 'itsco_job_description_acknowledgment_addendum',
    documentTemplateId: '',
    effectiveDate: '',
    title: ''
  }
});

const enabledPreviewSections = computed(() => catalog.filter((s) => draft.config[s.key]));

function sectionsForPage(page) {
  return catalog.filter((s) => page.sectionKeys.includes(s.key));
}
function enabledSectionsForPage(page) {
  return sectionsForPage(page).filter((s) => draft.config[s.key]);
}

const filteredRecipients = computed(() => {
  const rows = recipients.value || [];
  if (!showDemoOnly.value) return rows;
  return rows.filter((r) => Number(r.is_demo_snapshot) === 1);
});

const sendPickerList = computed(() => {
  if (sendMode.value === 'demo') {
    return eligibleProviders.value.filter((p) => Number(p.is_demo) === 1);
  }
  return eligibleProviders.value;
});

const documentsAdminHref = computed(() => {
  const slug = props.organizationSlug ? `/${props.organizationSlug}` : '';
  return `${slug}/admin/documents`;
});

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    success.value = 'Link copied.';
  } catch {
    success.value = text;
  }
}

function copyAllDemoLinks() {
  const links = filteredRecipients.value
    .filter((r) => r.publicUrl)
    .map((r) => `${r.first_name} ${r.last_name} (${r.role_snapshot || ''}): ${r.publicUrl}`)
    .join('\n');
  copyText(links || 'No demo links yet.');
}

async function loadEligibleProviders() {
  try {
    const res = await api.get('/provider-update/eligible-providers', {
      params: { agencyId: props.agencyId, includeDemo: '1' }
    });
    eligibleProviders.value = res.data?.providers || [];
  } catch {
    eligibleProviders.value = [];
  }
}

async function loadAdminUpdates() {
  try {
    const res = await api.get('/provider-update/admin-updates', {
      params: { agencyId: props.agencyId }
    });
    adminUpdates.value = res.data?.updates || [];
  } catch {
    adminUpdates.value = [];
  }
}

async function createAdminUpdate() {
  busy.value = true;
  try {
    const period = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const res = await api.post('/provider-update/admin-updates', {
      agencyId: Number(props.agencyId),
      title: `${period} Admin Updates`
    });
    await loadAdminUpdates();
    draft.attachedAdminUpdateId = res.data?.id || null;
    success.value = 'Admin Update created and attached.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not create Admin Update';
  } finally {
    busy.value = false;
  }
}

function onAttachChange() {
  /* embed reloads via updateId watch */
}

async function loadPushes() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/provider-update/pushes', { params: { agencyId: props.agencyId } });
    pushes.value = res.data?.pushes || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load pushes';
  } finally {
    loading.value = false;
  }
}

async function openPush(p) {
  selectedPush.value = p;
  const res = await api.get(`/provider-update/pushes/${p.id}`, { params: { agencyId: props.agencyId } });
  selectedPush.value = res.data?.push || p;
  recipients.value = res.data?.recipients || [];
}

function startCompose() {
  draft.id = null;
  draft.title = 'Provider Update';
  draft.notes = '';
  draft.config = defaultSectionConfig();
  draft.attachedAdminUpdateId = null;
  draft.audience = {
    amendments: { mode: 'all', userIds: [] },
    client_fall_update: { mode: 'auto', userIds: [] }
  };
  draft.amendmentPlan = {
    mode: 'job_description_acknowledgment',
    contractConfigSlug: 'itsco_job_description_acknowledgment_addendum',
    documentTemplateId: '',
    effectiveDate: '',
    title: ''
  };
  sendMode.value = 'all';
  selectedSendIds.value = [];
  tab.value = 'compose';
  loadAdminUpdates();
  loadEligibleProviders();
}

function pushPayload() {
  const audience = {
    amendments: {
      mode: draft.audience.amendments.mode,
      userIds: [...draft.audience.amendments.userIds]
    },
    client_fall_update: {
      mode: draft.audience.client_fall_update.mode,
      userIds: [...draft.audience.client_fall_update.userIds]
    }
  };
  const plan = (() => {
    const mode = String(draft.amendmentPlan.mode || 'job_description_acknowledgment');
    const effectiveDate = draft.amendmentPlan.effectiveDate || null;
    const title = draft.amendmentPlan.title || (mode === 'job_description_acknowledgment'
      ? 'Job Description Acknowledgment'
      : 'Contract amendment');
    if (!effectiveDate && mode !== 'job_description_acknowledgment' && !draft.amendmentPlan.documentTemplateId) {
      return null;
    }
    if (mode === 'document_template') {
      if (!draft.amendmentPlan.documentTemplateId) return null;
      return {
        mode: 'document_template',
        documentTemplateId: Number(draft.amendmentPlan.documentTemplateId) || draft.amendmentPlan.documentTemplateId,
        effectiveDate,
        title
      };
    }
    return {
      mode: 'job_description_acknowledgment',
      contractConfigSlug: draft.amendmentPlan.contractConfigSlug || 'itsco_job_description_acknowledgment_addendum',
      effectiveDate,
      title
    };
  })();
  return {
    agencyId: Number(props.agencyId),
    title: draft.title,
    notes: draft.notes,
    sectionConfig: draft.config,
    attachedAdminUpdateId: draft.attachedAdminUpdateId || null,
    sectionAudience: audience,
    amendmentPlan: plan
  };
}

function resolveSendIds() {
  if (sendMode.value === 'all') return null;
  if (sendMode.value === 'demo') {
    return eligibleProviders.value.filter((p) => Number(p.is_demo) === 1).map((p) => p.provider_user_id);
  }
  return [...selectedSendIds.value];
}

async function saveDraft() {
  busy.value = true;
  error.value = '';
  try {
    if (draft.id) {
      const res = await api.put(`/provider-update/pushes/${draft.id}`, pushPayload());
      draft.id = res.data.id;
      draft.attachedAdminUpdateId = res.data.attached_admin_update_id || draft.attachedAdminUpdateId;
    } else {
      const res = await api.post('/provider-update/pushes', pushPayload());
      draft.id = res.data.id;
      draft.attachedAdminUpdateId = res.data.attached_admin_update_id || draft.attachedAdminUpdateId;
    }
    success.value = 'Draft saved.';
    await loadPushes();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    busy.value = false;
  }
}

async function saveAndSend() {
  busy.value = true;
  error.value = '';
  success.value = '';
  try {
    if (!draft.attachedAdminUpdateId && draft.config.admin_update) {
      error.value = 'Attach an Admin Update (or turn off the Admin Update section) before sending.';
      return;
    }
    const providerUserIds = resolveSendIds();
    if (providerUserIds && !providerUserIds.length) {
      error.value = 'Select at least one recipient to send.';
      return;
    }
    let pushId = draft.id;
    if (pushId) {
      const res = await api.put(`/provider-update/pushes/${pushId}`, pushPayload());
      pushId = res.data.id;
    } else {
      const res = await api.post('/provider-update/pushes', pushPayload());
      pushId = res.data.id;
      draft.id = pushId;
    }
    const res = await api.post(`/provider-update/pushes/${pushId}/send`, {
      agencyId: Number(props.agencyId),
      orgSlug: props.organizationSlug,
      providerUserIds
    });
    const sent = (res.data?.results || []).filter((r) => r.deliveryStatus === 'sent').length;
    success.value = `Sent (${sent} delivered / ${(res.data?.results || []).length} total). Open Past pushes → View for token links.`;
    tab.value = 'pushes';
    await loadPushes();
    const push = pushes.value.find((p) => Number(p.id) === Number(pushId));
    if (push) await openPush(push);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Send failed';
  } finally {
    busy.value = false;
  }
}

async function exportPush(p) {
  const res = await api.get(`/provider-update/pushes/${p.id}/export`, {
    params: { agencyId: props.agencyId },
    responseType: 'blob'
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `provider-update-${p.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function submitPayroll(p) {
  if (!window.confirm('Create indirect payroll time claims from tracked Provider Update minutes?')) return;
  busy.value = true;
  try {
    const res = await api.post(`/provider-update/pushes/${p.id}/submit-payroll`, {
      agencyId: Number(props.agencyId)
    });
    success.value = `Payroll submitted: ${res.data?.created?.length || 0} claims created, ${res.data?.skipped?.length || 0} skipped.`;
    await loadPushes();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Payroll submit failed';
  } finally {
    busy.value = false;
  }
}

async function loadQuestions() {
  try {
    const res = await api.get('/provider-update/handbook/questions', {
      params: { agencyId: props.agencyId }
    });
    questions.value = res.data?.questions || [];
  } catch {
    questions.value = [];
  }
}

onMounted(() => {
  loadPushes();
  loadAdminUpdates();
  loadEligibleProviders();
});
</script>

<style scoped>
.pu-admin {
  --g: #3d6b4f;
  --line: rgba(15, 23, 42, 0.08);
  padding: 0.5rem 0 2rem;
  background:
    radial-gradient(1200px 400px at 10% -10%, rgba(61, 107, 79, 0.12), transparent 60%),
    radial-gradient(900px 360px at 90% 0%, rgba(14, 116, 144, 0.1), transparent 55%);
}
.head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
.head h1 { margin: 0 0 0.25rem; color: #0f172a; letter-spacing: -0.02em; }
.head-actions, .toolbar, .compose-actions, .row-actions, .compose-top { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; }
.tabs { display: flex; gap: 0.35rem; margin-bottom: 1rem; }
.tabs button {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.65);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  backdrop-filter: blur(8px);
}
.tabs button.active { background: linear-gradient(135deg, #3d6b4f, #2f5540); color: #fff; border-color: transparent; }
.panel, .glass {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1rem;
  backdrop-filter: blur(14px);
}
.glass-inset {
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem;
}
.table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.table th, .table td { text-align: left; padding: 0.5rem 0.4rem; border-bottom: 1px solid rgba(241, 245, 249, 0.9); }
.btn {
  border: 1px solid rgba(61, 107, 79, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: var(--g);
  border-radius: 10px;
  padding: 0.45rem 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.btn.primary {
  background: linear-gradient(135deg, #3d6b4f, #2f5540);
  color: #fff;
  border-color: transparent;
}
.btn.sm { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
.muted { color: #64748b; }
.err { color: #b91c1c; }
.ok { color: var(--g); }
.field { display: grid; gap: 0.3rem; margin-bottom: 0.75rem; }
.field.grow { flex: 1; min-width: 220px; }
.input, textarea.input, select.input {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  background: rgba(255, 255, 255, 0.9);
}
.section-list { display: grid; gap: 0.75rem; margin: 1rem 0; }
.page-group { display: grid; gap: 0.55rem; }
.page-group-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
.page-toggles { display: flex; flex-wrap: wrap; gap: 0.55rem 1rem; }
.section-row { display: grid; gap: 0.35rem; }
.section-row-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.toggle { display: flex; align-items: center; gap: 0.5rem; }
.hint { margin: 0; color: #64748b; font-size: 0.85rem; }
.detail { margin-top: 1.25rem; }
.attach { margin: 1rem 0; display: grid; gap: 0.75rem; }
.attach-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.attach h3 { margin: 0 0 0.25rem; }
.picker {
  display: grid;
  gap: 0.35rem;
  max-height: 220px;
  overflow: auto;
  padding: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.5);
}
.check { display: flex; align-items: center; gap: 0.45rem; font-size: 0.9rem; flex-wrap: wrap; }
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
}
.badge.demo { background: #fef3c7; color: #92400e; }
.badge.role { background: #e0f2fe; color: #075985; }
.row.wrap { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.link { color: var(--g); font-weight: 600; text-decoration: none; font-size: 0.9rem; }
.full-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1rem;
}
.full-shell {
  width: min(1200px, 100%);
  max-height: 92vh;
  overflow: auto;
  background: rgba(248, 250, 252, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 20px;
  padding: 1rem;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
}
.full-top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}
</style>
