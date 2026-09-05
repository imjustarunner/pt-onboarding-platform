<template>
  <div class="container aes-page">
    <header class="page-header">
      <div>
        <h1>Email Settings</h1>
        <p class="muted aes-sub">
          {{ agencyName || 'This agency' }} — manage automated emails, sender identities, and what sends vs. queues for approval.
        </p>
      </div>
      <div class="header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="commsTo">Communications Center</router-link>
        <button class="btn btn-primary btn-sm" type="button" :disabled="savingAgency || loading" @click="saveAgencySettings">
          {{ savingAgency ? 'Saving…' : 'Save agency settings' }}
        </button>
      </div>
    </header>

    <div v-if="!agencyId" class="error">No agency context. Open this page from an organization.</div>
    <div v-else-if="loading" class="loading">Loading email settings…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <p v-if="saveSuccess" class="success">{{ saveSuccess }}</p>
      <p v-if="saveError" class="error">{{ saveError }}</p>

      <section class="aes-banner" :class="form.schoolRoiEmailsRequireApproval ? 'warn' : 'ok'">
        <div>
          <strong>School ROI / release emails</strong>
          <span v-if="form.schoolRoiEmailsRequireApproval"> queue for approval in Automation before they send.</span>
          <span v-else> send immediately when triggered.</span>
        </div>
        <label class="aes-toggle">
          <input v-model="form.schoolRoiEmailsRequireApproval" type="checkbox" />
          Require approval
        </label>
      </section>

      <section class="aes-banner" :class="fallbackCount ? 'warn' : 'ok'">
        <div>
          <strong>{{ fallbackCount }} email type{{ fallbackCount === 1 ? '' : 's' }} using fallback From</strong>
          <span> — those sends queue in Communications for individual approval until you assign a tenant identity.</span>
        </div>
        <button v-if="fallbackCount" class="btn btn-secondary btn-sm" type="button" @click="filterStatus = 'fallback'">Show them</button>
      </section>

      <section class="aes-chrome" :class="htmlChromeComplete ? 'ok' : 'warn'">
        <header class="aes-chrome-head">
          <div>
            <strong>HTML email header &amp; footer</strong>
            <span v-if="htmlChromeComplete"> — complete. All HTML emails for this tenant use these banners.</span>
            <span v-else> — required to complete the tenant email profile. Upload both before going live.</span>
          </div>
        </header>
        <p class="aes-chrome-help">
          Use wide PNG banners (~1200×280 header, ~1200×220 footer). ITSCO’s live art is the reference —
          leave a clear center band in the footer for Support / Reply / Unsubscribe links.
        </p>
        <div class="aes-chrome-grid">
          <div class="aes-chrome-card">
            <h3>Header</h3>
            <img
              v-if="chromePreview.headerUrl"
              :src="chromePreview.headerUrl"
              alt="Email header preview"
              class="aes-chrome-img"
            />
            <img
              v-else-if="chromeMeta.exampleHeaderUrl"
              :src="chromeMeta.exampleHeaderUrl"
              alt="ITSCO example header"
              class="aes-chrome-img example"
            />
            <p v-if="!chromePreview.headerUrl" class="muted">Showing ITSCO example until you upload.</p>
            <label class="btn btn-secondary btn-sm aes-upload-btn">
              {{ chromeUploading === 'header' ? 'Uploading…' : 'Upload header' }}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden :disabled="!!chromeUploading" @change="onChromeUpload('header', $event)" />
            </label>
            <details class="aes-prompt">
              <summary>LLM prompt for header art</summary>
              <pre>{{ chromeMeta.llmHeaderPrompt || '' }}</pre>
              <button type="button" class="btn btn-ghost btn-sm" @click="copyText(chromeMeta.llmHeaderPrompt)">Copy prompt</button>
            </details>
          </div>
          <div class="aes-chrome-card">
            <h3>Footer</h3>
            <img
              v-if="chromePreview.footerUrl"
              :src="chromePreview.footerUrl"
              alt="Email footer preview"
              class="aes-chrome-img"
            />
            <img
              v-else-if="chromeMeta.exampleFooterUrl"
              :src="chromeMeta.exampleFooterUrl"
              alt="ITSCO example footer"
              class="aes-chrome-img example"
            />
            <p v-if="!chromePreview.footerUrl" class="muted">Showing ITSCO example until you upload. Keep the center clear for links.</p>
            <label class="btn btn-secondary btn-sm aes-upload-btn">
              {{ chromeUploading === 'footer' ? 'Uploading…' : 'Upload footer' }}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden :disabled="!!chromeUploading" @change="onChromeUpload('footer', $event)" />
            </label>
            <details class="aes-prompt">
              <summary>LLM prompt for footer art</summary>
              <pre>{{ chromeMeta.llmFooterPrompt || '' }}</pre>
              <button type="button" class="btn btn-ghost btn-sm" @click="copyText(chromeMeta.llmFooterPrompt)">Copy prompt</button>
            </details>
          </div>
        </div>
      </section>

      <div class="aes-toolbar">
        <input v-model.trim="search" type="search" placeholder="Search emails, triggers, From…" />
        <select v-model="filterStatus">
          <option value="">All status</option>
          <option value="fallback">Needs From (fallback)</option>
          <option value="configured">Configured</option>
          <option value="off">Disabled</option>
        </select>
        <select v-model="filterCategory">
          <option value="">All categories</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>

      <div class="aes-workspace">
        <aside class="aes-list">
          <header class="aes-list-head">
            <h2>Automated emails</h2>
            <span class="muted">{{ filteredRows.length }}</span>
          </header>
          <button
            v-for="row in filteredRows"
            :key="row.id"
            type="button"
            class="aes-list-item"
            :class="{ active: selectedId === row.id, fallback: row.usesFallback }"
            @click="selectedId = row.id"
          >
            <div class="aes-list-title">
              <strong>{{ row.label }}</strong>
              <span class="aes-pill" :class="row.usesFallback ? 'warn' : (row.enabled === false ? 'off' : 'ok')">
                {{ row.usesFallback ? 'Needs From' : (row.enabled === false ? 'Off' : 'Enabled') }}
              </span>
            </div>
            <small class="aes-list-cat">{{ row.category }}</small>
            <small>{{ row.triggerKind }} · {{ row.kind === 'template' ? 'Template' : 'Trigger' }}</small>
            <small class="aes-from" :class="{ hot: row.usesFallback }">{{ row.fromSummary }}</small>
            <small class="aes-list-desc">{{ row.description }}</small>
          </button>
          <p v-if="!filteredRows.length" class="muted aes-empty">No emails match this filter.</p>
        </aside>

        <section v-if="selected" class="aes-detail">
          <header class="aes-detail-head">
            <div>
              <p class="muted aes-kicker">{{ selected.category }}</p>
              <h2>{{ selected.label }}</h2>
            </div>
            <label v-if="selected.kind === 'trigger'" class="aes-toggle">
              <input v-model="selected.enabled" type="checkbox" />
              Enabled
            </label>
          </header>

          <p class="aes-desc">{{ selected.description }}</p>

          <dl class="aes-meta">
            <dt>When it sends</dt>
            <dd>{{ selected.trigger }}</dd>
            <dt>Trigger type</dt>
            <dd>{{ selected.triggerKind }}</dd>
            <dt v-if="selected.recommendedFromHint">Recommended From</dt>
            <dd v-if="selected.recommendedFromHint">{{ selected.recommendedFromHint }}</dd>
          </dl>

          <div v-if="selected.sourceLinks?.length" class="aes-links">
            <span class="muted">Opens from</span>
            <router-link
              v-for="link in selected.sourceLinks"
              :key="link.path"
              class="aes-link"
              :to="orgPath(link.path)"
            >
              {{ link.label }} →
            </router-link>
          </div>

          <div v-if="selected.junkMailNote" class="aes-note">
            Recipients are told to check Junk / Spam and mark the sender as safe.
          </div>

          <div v-if="selected.usesFallback" class="aes-note warn">
            No tenant From is assigned. Sends of this type currently queue in
            <router-link :to="pendingTo">Communications › Automation (pending)</router-link>
            for individual approval instead of going out from a fallback mailbox.
          </div>

          <label class="aes-field">
            <span>Sent from</span>
            <select v-model="selected.senderIdentityId">
              <option value="">{{ selected.isFallbackDefault ? 'Not assigned (fallback — queued)' : 'Not assigned — queue for approval' }}</option>
              <optgroup v-if="recommendedSenders.length" label="Tenant identities">
                <option v-for="s in recommendedSenders" :key="s.id" :value="String(s.id)">
                  {{ formatSenderLabel(s) }} — {{ s.from_email }}
                </option>
              </optgroup>
              <optgroup v-if="discouragedSenders.length" label="Avoid (AI / routing)">
                <option v-for="s in discouragedSenders" :key="`bad-${s.id}`" :value="String(s.id)">
                  {{ formatSenderLabel(s) }} — {{ s.from_email }}
                </option>
              </optgroup>
            </select>
            <small v-if="isAiSenderId(selected.senderIdentityId)" class="hot">
              AI mailboxes land in spam. Pick notifications@ or a staff/school alias instead.
            </small>
          </label>

          <label v-if="selected.kind === 'trigger'" class="aes-toggle block">
            <input v-model="selected.requireApproval" type="checkbox" />
            <span>Require approval before send</span>
          </label>

          <label v-if="selected.kind === 'trigger'" class="aes-toggle block">
            <input v-model="selected.channels.email" type="checkbox" />
            <span>Send email (in-app alerts stay on)</span>
          </label>

          <label v-if="selected.kind === 'trigger'" class="aes-field">
            <span>Subject override (optional)</span>
            <input v-model.trim="selected.subjectOverride" type="text" maxlength="255" placeholder="Leave blank to use the default subject" />
          </label>

          <template v-if="selected.kind === 'template'">
            <div class="aes-template-bar">
              <label class="aes-field aes-field-grow">
                <span>Template</span>
                <select v-model="currentTemplateId" @change="onSelectTemplate">
                  <option v-if="!templateOptions.length" value="">No templates yet</option>
                  <option v-for="tpl in templateOptions" :key="tpl.id" :value="String(tpl.id)">
                    {{ tpl.name }}{{ Number(tpl.is_default) === 1 ? ' · current' : '' }}{{ tpl.agency_id ? '' : ' · platform' }}
                  </option>
                </select>
              </label>
              <button class="btn btn-secondary btn-sm" type="button" :disabled="templateSaving" @click="createTemplateVariant">
                New template
              </button>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="!currentTemplateId || templateSaving"
                @click="setCurrentTemplate"
              >
                Set as current
              </button>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="!canDeleteTemplate || templateSaving"
                @click="deleteCurrentTemplate"
              >
                Delete
              </button>
            </div>
            <div v-if="templateLoading" class="muted">Loading template…</div>
            <div v-else-if="templateError" class="error">{{ templateError }}</div>
            <template v-else>
              <p v-if="!templateOptions.length" class="muted aes-set-meta">
                No template yet for this email. Fill in the name, subject, and body below, then save — or click New template.
              </p>
              <label class="aes-field">
                <span>Template name</span>
                <input v-model.trim="draftName" type="text" />
              </label>
              <label class="aes-field">
                <span>Subject</span>
                <input v-model="draftSubject" type="text" />
              </label>
              <label class="aes-field">
                <span>Email body</span>
                <textarea v-model="draftBody" rows="12" class="aes-body" />
              </label>
              <p class="muted aes-vars">
                Variables:
                <button
                  v-for="token in TEMPLATE_VARS"
                  :key="token"
                  type="button"
                  class="aes-var"
                  @click="insertVariable(token)"
                >{{ token }}</button>
              </p>
              <p v-if="loadedTemplate && !loadedTemplate.agency_id" class="muted aes-set-meta">
                This is a platform template. Saving or setting it current creates an {{ agencyName || 'agency' }} copy.
              </p>
            </template>
          </template>

          <div class="aes-test-row">
            <label class="aes-field">
              <span>Test email (no live token)</span>
              <input v-model.trim="testTo" type="email" placeholder="you@itsco.health" />
            </label>
            <button class="btn btn-secondary btn-sm" type="button" :disabled="testing || !testTo" @click="sendTest">
              {{ testing ? 'Sending test…' : 'Send test email' }}
            </button>
          </div>
          <p v-if="testMsg" class="success">{{ testMsg }}</p>

          <div class="aes-detail-actions">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="savingSelected"
              @click="saveSelected"
            >
              {{ savingSelected ? 'Saving…' : 'Save this email' }}
            </button>
            <router-link class="btn btn-secondary" :to="pendingTo">Review pending sends</router-link>
          </div>
        </section>

        <aside v-if="selected" class="aes-preview">
          <header class="aes-preview-head">
            <h2>Preview</h2>
            <span class="muted">Sample data · no token</span>
          </header>
          <div class="aes-preview-chrome">
            <div><span>From</span> {{ previewFrom }}</div>
            <div><span>To</span> alex.staff@school.edu</div>
            <div><span>Subject</span> {{ previewSubject }}</div>
          </div>
          <pre class="aes-preview-body">{{ previewBody }}</pre>
        </aside>
      </div>

      <section class="aes-agency">
        <h2>Agency delivery</h2>
        <label class="aes-toggle block">
          <input v-model="form.notificationsEnabled" type="checkbox" />
          Agency email notifications enabled
        </label>
        <p class="muted">When off, automated emails for this agency are blocked (logged as skipped).</p>

        <template v-if="canEditPlatform">
          <h3>Platform delivery</h3>
          <label class="aes-field">
            <span>Delivery mode</span>
            <select v-model="form.platformSendingMode">
              <option value="manual_only">Manual only — nothing auto-sends</option>
              <option value="all">Auto + manual allowed</option>
            </select>
          </label>
          <label class="aes-toggle block">
            <input v-model="form.platformNotificationsEnabled" type="checkbox" />
            Platform email notifications enabled
          </label>
        </template>
        <p v-else class="muted">Platform controls are super-admin only.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { AUTOMATED_EMAIL_CATALOG } from '../../constants/automatedEmailCatalog.js';

const TEMPLATE_VARS = [
  '{{FIRST_NAME}}',
  '{{LAST_NAME}}',
  '{{USERNAME}}',
  '{{AGENCY_NAME}}',
  '{{PORTAL_LOGIN_LINK}}',
  '{{RESET_TOKEN_LINK}}',
  '{{SENDER_NAME}}'
];

const SAMPLE_PARAMS = {
  FIRST_NAME: 'Alex',
  LAST_NAME: 'Staff',
  USERNAME: 'alex.staff@school.edu',
  TEMP_PASSWORD: '[omitted]',
  AGENCY_NAME: '',
  PORTAL_URL: '',
  PORTAL_LOGIN_LINK: 'https://example.com/login',
  RESET_TOKEN_LINK: '[reset link omitted in this preview — no token attached]',
  DOCUMENT_DEADLINE: 'January 15, 2026',
  TRAINING_DEADLINE: 'January 20, 2026',
  SENDER_NAME: '',
  PEOPLE_OPS_EMAIL: '',
  TERMINOLOGY_SETTINGS: ''
};

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const saveError = ref('');
const saveSuccess = ref('');
const savingAgency = ref(false);
const savingSelected = ref(false);
const search = ref('');
const filterStatus = ref('');
const filterCategory = ref('');
const selectedId = ref('');
const senderIdentities = ref([]);
const catalogRows = ref([]);
const loadedTemplate = ref(null);
const templateOptions = ref([]);
const currentTemplateId = ref('');
const templateLoading = ref(false);
const templateSaving = ref(false);
const templateError = ref('');
const draftName = ref('');
const draftSubject = ref('');
const draftBody = ref('');
const testTo = ref('');
const testing = ref(false);
const testMsg = ref('');

const form = ref({
  schoolRoiEmailsRequireApproval: true,
  notificationsEnabled: true,
  platformSendingMode: 'all',
  platformNotificationsEnabled: true,
  defaultSenderIdentityId: '',
  templateSenderIdentityIds: {}
});

const chromeMeta = ref({});
const chromePreview = ref({ headerUrl: '', footerUrl: '' });
const chromeUploading = ref('');
const htmlChromeComplete = computed(
  () => !!(chromePreview.value.headerUrl && chromePreview.value.footerUrl)
);
const orgSlug = computed(() => String(route.params.organizationSlug || '').trim());
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const agencyName = computed(() => agencyStore.currentAgency?.name || agencyStore.currentAgency?.short_name || '');
const canEditPlatform = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const actorName = computed(() => {
  const u = authStore.user;
  return `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || u?.email || 'Admin';
});

const orgPath = (path) => {
  const p = String(path || '');
  if (!orgSlug.value) return p;
  if (p.startsWith('/login') || p.startsWith('/reset-password') || p.startsWith('/careers') || p.startsWith('/join')) {
    return `/${orgSlug.value}${p}`;
  }
  return `/${orgSlug.value}${p}`;
};

const commsTo = computed(() => orgPath('/admin/communications?mode=automation'));
const pendingTo = computed(() => orgPath('/admin/communications?mode=automation&status=pending'));

function isAiMailbox(email) {
  const e = String(email || '').trim().toLowerCase();
  return e === 'ai@plottwistco.com' || e.startsWith('ai@');
}
function isAiSender(identity) {
  if (!identity) return false;
  const key = String(identity.identity_key || '').trim().toLowerCase();
  const email = String(identity.from_email || '').trim().toLowerCase();
  return isAiMailbox(email) || key === 'ai' || key.startsWith('ai_') || key.includes('ai_agent');
}
function isAiSenderId(id) {
  if (!id) return false;
  const found = senderIdentities.value.find((s) => Number(s.id) === Number(id));
  return isAiSender(found);
}
function formatSenderLabel(s) {
  return s?.display_name || s?.identity_key || `Identity #${s?.id}`;
}

const recommendedSenders = computed(() =>
  (senderIdentities.value || []).filter((s) => s.is_active !== 0 && s.is_active !== false && !isAiSender(s))
);
const discouragedSenders = computed(() => (senderIdentities.value || []).filter((s) => isAiSender(s)));

function senderById(id) {
  if (!id) return null;
  return senderIdentities.value.find((s) => Number(s.id) === Number(id)) || null;
}

function fromSummaryFor(senderId, preferredKeys = [], rowKey = '') {
  const s = senderById(senderId);
  if (s) return `${formatSenderLabel(s)} · ${s.from_email}`;
  const preferred = (preferredKeys || []).map((k) => String(k).toLowerCase());
  const match = recommendedSenders.value.find((row) => preferred.includes(String(row.identity_key || '').toLowerCase()));
  if (match) return `Auto: ${match.from_email} (${match.identity_key})`;
  if (rowKey === 'password_reset' || rowKey === 'admin_initiated_password_reset'
    || rowKey === 'school_staff_account_recovery' || rowKey === 'school_staff_portal_access') {
    const notifications = recommendedSenders.value.find((row) =>
      String(row.from_email || '').toLowerCase().startsWith('notifications@')
    );
    if (notifications) return `Auto: ${notifications.from_email}`;
  }
  return 'Fallback — will queue for approval';
}

function usesFallback(senderId, preferredKeys = [], rowKey = '') {
  if (senderId && senderById(senderId)) return false;
  const preferred = (preferredKeys || []).map((k) => String(k).toLowerCase());
  if (recommendedSenders.value.some((row) => preferred.includes(String(row.identity_key || '').toLowerCase()))) {
    return false;
  }
  if (rowKey === 'password_reset' || rowKey === 'admin_initiated_password_reset'
    || rowKey === 'school_staff_account_recovery' || rowKey === 'school_staff_portal_access') {
    return !recommendedSenders.value.some((row) =>
      String(row.from_email || '').toLowerCase().startsWith('notifications@')
    );
  }
  return true;
}

function triggerSourceLinks(triggerKey) {
  const k = String(triggerKey || '');
  if (k.startsWith('payroll')) return [{ label: 'Payroll', path: '/admin/payroll' }];
  if (k.includes('hiring') || k.includes('job')) return [{ label: 'Hiring candidates', path: '/admin/hiring-candidates' }];
  if (k.includes('school')) return [{ label: 'School Operations', path: '/school-operations' }];
  if (k.includes('meeting') || k.includes('schedule')) return [{ label: 'Schedule', path: '/dashboard?tab=my_schedule' }];
  return [{ label: 'Communications › Automation', path: '/admin/communications?mode=automation' }];
}

function buildCatalogRows(triggers) {
  const templates = AUTOMATED_EMAIL_CATALOG.map((entry) => {
    const senderId = entry.key === 'default'
      ? form.value.defaultSenderIdentityId
      : (form.value.templateSenderIdentityIds?.[entry.key] || '');
    return {
      id: `tpl:${entry.key}`,
      kind: 'template',
      key: entry.key,
      category: entry.category,
      label: entry.label,
      description: entry.description,
      trigger: entry.trigger,
      triggerKind: entry.triggerKind,
      sourceLinks: entry.sourceLinks || [],
      preferredKeys: entry.preferredKeys || [],
      recommendedFromHint: entry.recommendedFromHint || '',
      junkMailNote: !!entry.junkMailNote,
      isFallbackDefault: !!entry.isFallbackDefault,
      senderIdentityId: senderId ? String(senderId) : '',
      enabled: true,
      requireApproval: entry.key.startsWith('school_roi') ? form.value.schoolRoiEmailsRequireApproval : false,
      channels: { email: true },
      subjectOverride: '',
      fromSummary: fromSummaryFor(senderId, entry.preferredKeys, entry.key),
      usesFallback: usesFallback(senderId, entry.preferredKeys, entry.key)
    };
  });

  const triggerRows = (triggers || []).map((t) => {
    const senderId = t?.agencyOverride?.senderIdentityId || t?.resolved?.senderIdentityId || '';
    const preferred = [];
    return {
      id: `trg:${t.triggerKey}`,
      kind: 'trigger',
      key: t.triggerKey,
      category: 'Notification triggers',
      label: t.name || t.triggerKey,
      description: t.description || 'Automated notification email from a system trigger.',
      trigger: t.description || `Fires when the "${t.name || t.triggerKey}" event happens.`,
      triggerKind: 'Event-based',
      sourceLinks: triggerSourceLinks(t.triggerKey),
      preferredKeys: preferred,
      recommendedFromHint: '',
      junkMailNote: false,
      isFallbackDefault: false,
      senderIdentityId: senderId ? String(senderId) : '',
      enabled: t.resolved?.enabled !== false,
      requireApproval: !!(t.agencyOverride?.requireApproval ?? t.resolved?.requireApproval),
      channels: {
        email: t.resolved?.channels?.email !== false
      },
      subjectOverride: t.agencyOverride?.subjectOverride || t.resolved?.subjectOverride || '',
      recipients: t.resolved?.recipients || {},
      fromSummary: fromSummaryFor(senderId, preferred, t.triggerKey),
      usesFallback: usesFallback(senderId, preferred, t.triggerKey)
    };
  });

  return [...templates, ...triggerRows];
}

const categories = computed(() => {
  const set = new Set(catalogRows.value.map((r) => r.category).filter(Boolean));
  return [...set];
});

const filteredRows = computed(() => {
  const q = search.value.toLowerCase();
  return catalogRows.value.filter((row) => {
    if (filterCategory.value && row.category !== filterCategory.value) return false;
    if (filterStatus.value === 'fallback' && !row.usesFallback) return false;
    if (filterStatus.value === 'configured' && row.usesFallback) return false;
    if (filterStatus.value === 'off' && row.enabled !== false) return false;
    if (!q) return true;
    const hay = `${row.label} ${row.description} ${row.trigger} ${row.fromSummary} ${row.key} ${row.category}`.toLowerCase();
    return hay.includes(q);
  });
});

const fallbackCount = computed(() => catalogRows.value.filter((r) => r.usesFallback).length);
const selected = computed(() => catalogRows.value.find((r) => r.id === selectedId.value) || filteredRows.value[0] || null);

const canDeleteTemplate = computed(() => {
  const tpl = loadedTemplate.value;
  if (!tpl?.id) return false;
  if (!tpl.agency_id && String(authStore.user?.role || '').toLowerCase() !== 'super_admin') return false;
  return templateOptions.value.length > 1;
});

const previewFrom = computed(() => {
  const s = senderById(selected.value?.senderIdentityId);
  if (s) return `${formatSenderLabel(s)} <${s.from_email}>`;
  return selected.value?.fromSummary || 'Not assigned';
});

function renderTokens(text) {
  const params = {
    ...SAMPLE_PARAMS,
    AGENCY_NAME: agencyName.value || 'ITSCO',
    TERMINOLOGY_SETTINGS: agencyName.value || 'ITSCO',
    SENDER_NAME: actorName.value,
    PEOPLE_OPS_EMAIL: agencyStore.currentAgency?.onboarding_team_email || ''
  };
  let out = String(text || '');
  for (const [key, value] of Object.entries(params)) {
    out = out.replaceAll(`{{${key}}}`, String(value ?? ''));
  }
  return out.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
}

const previewSubject = computed(() => {
  if (selected.value?.kind === 'trigger') {
    return renderTokens(selected.value.subjectOverride || selected.value.label || 'Notification');
  }
  return renderTokens(draftSubject.value || selected.value?.label || '');
});

const previewBody = computed(() => {
  if (selected.value?.kind === 'trigger') {
    return selected.value.description
      || 'This trigger uses a generated notification body. Assign a From identity and optional subject override on the left.';
  }
  return renderTokens(draftBody.value || 'No template body loaded yet.');
});

watch(filteredRows, (rows) => {
  if (selected.value && rows.some((r) => r.id === selected.value.id)) return;
  selectedId.value = rows[0]?.id || '';
});

function applyLoadedTemplate(tpl, row) {
  loadedTemplate.value = tpl || null;
  currentTemplateId.value = tpl?.id ? String(tpl.id) : '';
  draftName.value = tpl?.name || row?.label || '';
  draftSubject.value = tpl?.subject || '';
  draftBody.value = tpl?.body || '';
}

async function loadTemplateForSelection() {
  const row = selected.value;
  loadedTemplate.value = null;
  templateOptions.value = [];
  currentTemplateId.value = '';
  templateError.value = '';
  testMsg.value = '';
  draftName.value = '';
  draftSubject.value = '';
  draftBody.value = '';
  if (!row || row.kind !== 'template' || !agencyId.value) return;
  templateLoading.value = true;
  try {
    const listRes = await api.get('/email-templates/for-type', {
      params: { type: row.key, agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    templateOptions.value = Array.isArray(listRes.data?.templates) ? listRes.data.templates : [];
    const currentId = listRes.data?.currentId;
    const current = templateOptions.value.find((t) => Number(t.id) === Number(currentId))
      || templateOptions.value[0]
      || null;
    if (current) {
      applyLoadedTemplate(current, row);
    } else {
      templateError.value = '';
      draftName.value = row.label;
      draftSubject.value = '';
      draftBody.value = '';
    }
  } catch (e) {
    templateError.value = e?.response?.data?.error?.message || 'No editable template for this email yet.';
  } finally {
    templateLoading.value = false;
  }
}

function onSelectTemplate() {
  const tpl = templateOptions.value.find((t) => String(t.id) === String(currentTemplateId.value));
  if (tpl) applyLoadedTemplate(tpl, selected.value);
}

async function createTemplateVariant() {
  const row = selected.value;
  if (!row || row.kind !== 'template' || !agencyId.value) return;
  templateSaving.value = true;
  templateError.value = '';
  try {
    const response = await api.post('/email-templates', {
      name: `${draftName.value || row.label} (copy)`,
      type: row.key,
      subject: draftSubject.value || `Message from {{AGENCY_NAME}}`,
      body: draftBody.value || 'Hello {{FIRST_NAME}},\n\n{{AGENCY_NAME}}\n',
      agencyId: agencyId.value
    }, { skipGlobalLoading: true });
    await api.post(`/email-templates/${response.data.id}/set-default`, { agencyId: agencyId.value }, { skipGlobalLoading: true });
    await loadTemplateForSelection();
    testMsg.value = 'Created a new template and set it as current.';
  } catch (e) {
    templateError.value = e?.response?.data?.error?.message || 'Failed to create template';
  } finally {
    templateSaving.value = false;
  }
}

async function setCurrentTemplate() {
  if (!currentTemplateId.value || !agencyId.value) return;
  templateSaving.value = true;
  templateError.value = '';
  try {
    await api.post(`/email-templates/${currentTemplateId.value}/set-default`, {
      agencyId: agencyId.value
    }, { skipGlobalLoading: true });
    await loadTemplateForSelection();
    testMsg.value = 'This template is now current for this email type.';
  } catch (e) {
    templateError.value = e?.response?.data?.error?.message || 'Failed to set current template';
  } finally {
    templateSaving.value = false;
  }
}

async function deleteCurrentTemplate() {
  if (!canDeleteTemplate.value || !loadedTemplate.value?.id) return;
  if (!window.confirm('Delete this template? This cannot be undone.')) return;
  templateSaving.value = true;
  templateError.value = '';
  try {
    await api.delete(`/email-templates/${loadedTemplate.value.id}`, { skipGlobalLoading: true });
    await loadTemplateForSelection();
    testMsg.value = 'Template deleted.';
  } catch (e) {
    templateError.value = e?.response?.data?.error?.message || 'Failed to delete template';
  } finally {
    templateSaving.value = false;
  }
}

watch(selectedId, () => {
  void loadTemplateForSelection();
});

function insertVariable(token) {
  draftBody.value = `${draftBody.value || ''}${draftBody.value ? ' ' : ''}${token}`;
}

async function load() {
  if (!agencyId.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [settingsRes, triggersRes, sendersRes] = await Promise.all([
      api.get('/email-settings', { skipGlobalLoading: true }),
      api.get(`/agencies/${agencyId.value}/notification-triggers`, { skipGlobalLoading: true }),
      api.get('/email-senders', { params: { agencyId: agencyId.value }, skipGlobalLoading: true })
    ]);
    const settings = settingsRes.data || {};
    const agencyRow = (settings.agencies || []).find((a) => Number(a.agencyId) === Number(agencyId.value)) || {};
    form.value = {
      schoolRoiEmailsRequireApproval: agencyRow.schoolRoiEmailsRequireApproval !== false,
      notificationsEnabled: agencyRow.notificationsEnabled !== false,
      platformSendingMode: settings.platform?.sendingMode || 'all',
      platformNotificationsEnabled: settings.platform?.notificationsEnabled !== false,
      defaultSenderIdentityId: agencyRow.defaultSenderIdentityId ? String(agencyRow.defaultSenderIdentityId) : '',
      templateSenderIdentityIds: { ...(agencyRow.templateSenderIdentityIds || {}) }
    };
    chromeMeta.value = settings.htmlEmailChrome || {};
    chromePreview.value = {
      headerUrl: agencyRow.htmlEmailHeaderUrl || chromeMeta.value.headerUrl || '',
      footerUrl: agencyRow.htmlEmailFooterUrl || chromeMeta.value.footerUrl || ''
    };
    try {
      const { data: chrome } = await api.get('/email-settings/html-chrome', {
        params: { agencyId: agencyId.value },
        skipGlobalLoading: true
      });
      chromeMeta.value = { ...chromeMeta.value, ...chrome };
      chromePreview.value = {
        headerUrl: chrome.headerUrl || chromePreview.value.headerUrl || '',
        footerUrl: chrome.footerUrl || chromePreview.value.footerUrl || ''
      };
    } catch {
      /* optional */
    }
    senderIdentities.value = Array.isArray(sendersRes.data) ? sendersRes.data : [];
    catalogRows.value = buildCatalogRows(Array.isArray(triggersRes.data) ? triggersRes.data : []);
    const qType = String(route.query.type || '').trim();
    if (qType) {
      const match = catalogRows.value.find((r) => r.key === qType);
      if (match) selectedId.value = match.id;
    } else if (!selectedId.value && catalogRows.value[0]) {
      selectedId.value = catalogRows.value[0].id;
    }
    await loadTemplateForSelection();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load email settings';
  } finally {
    loading.value = false;
  }
}

function collectTemplateSenderIds() {
  const ids = {};
  for (const row of catalogRows.value) {
    if (row.kind !== 'template') continue;
    const raw = String(row.senderIdentityId || '').trim();
    if (row.key === 'default') {
      form.value.defaultSenderIdentityId = raw;
      continue;
    }
    if (raw) ids[row.key] = Number(raw);
  }
  return ids;
}

async function saveTemplateDraft(row) {
  if (row.kind !== 'template') return;
  const subject = String(draftSubject.value || '').trim();
  const body = String(draftBody.value || '').trim();
  if (!subject || !body) return;
  const name = String(draftName.value || row.label).trim();
  const existing = loadedTemplate.value;
  if (existing?.id && existing.agency_id && Number(existing.agency_id) === Number(agencyId.value)) {
    const response = await api.put(`/email-templates/${existing.id}`, { name, subject, body }, { skipGlobalLoading: true });
    loadedTemplate.value = response.data;
    const opt = templateOptions.value.find((t) => Number(t.id) === Number(existing.id));
    if (opt) {
      opt.name = response.data.name;
      opt.subject = response.data.subject;
      opt.body = response.data.body;
    }
    return;
  }
  const response = await api.post('/email-templates', {
    name,
    type: row.key,
    subject,
    body,
    agencyId: agencyId.value
  }, { skipGlobalLoading: true });
  loadedTemplate.value = response.data;
  if (response.data?.id) {
    await api.post(`/email-templates/${response.data.id}/set-default`, {
      agencyId: agencyId.value
    }, { skipGlobalLoading: true });
  }
  await loadTemplateForSelection();
}

async function saveAgencySettings() {
  if (!agencyId.value) return;
  savingAgency.value = true;
  saveError.value = '';
  saveSuccess.value = '';
  try {
    const payload = {
      agencies: [{
        agencyId: agencyId.value,
        notificationsEnabled: form.value.notificationsEnabled,
        schoolRoiEmailsRequireApproval: form.value.schoolRoiEmailsRequireApproval,
        defaultSenderIdentityId: form.value.defaultSenderIdentityId ? Number(form.value.defaultSenderIdentityId) : null,
        templateSenderIdentityIds: collectTemplateSenderIds()
      }]
    };
    if (canEditPlatform.value) {
      payload.platform = {
        sendingMode: form.value.platformSendingMode,
        notificationsEnabled: form.value.platformNotificationsEnabled
      };
    }
    await api.put('/email-settings', payload, { skipGlobalLoading: true });
    saveSuccess.value = 'Agency settings saved.';
    await load();
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Failed to save agency settings';
  } finally {
    savingAgency.value = false;
  }
}

async function saveSelected() {
  const row = selected.value;
  if (!row || !agencyId.value) return;
  savingSelected.value = true;
  saveError.value = '';
  saveSuccess.value = '';
  try {
    if (row.kind === 'template') {
      if (row.key === 'default') {
        form.value.defaultSenderIdentityId = row.senderIdentityId || '';
      } else {
        form.value.templateSenderIdentityIds = {
          ...form.value.templateSenderIdentityIds,
          [row.key]: row.senderIdentityId ? Number(row.senderIdentityId) : undefined
        };
        if (!row.senderIdentityId) delete form.value.templateSenderIdentityIds[row.key];
      }
      await saveTemplateDraft(row);
      await saveAgencySettings();
      saveSuccess.value = `Saved ${row.label}.`;
      return;
    }
    await api.put(`/agencies/${agencyId.value}/notification-triggers/${row.key}`, {
      enabled: !!row.enabled,
      channels: { inApp: true, sms: false, email: !!row.channels?.email },
      recipients: {
        provider: !!row.recipients?.provider,
        supervisor: !!row.recipients?.supervisor,
        clinicalPracticeAssistant: !!row.recipients?.clinicalPracticeAssistant,
        admin: !!row.recipients?.admin
      },
      senderIdentityId: row.senderIdentityId ? Number(row.senderIdentityId) : null,
      subjectOverride: String(row.subjectOverride || '').trim() || null,
      requireApproval: !!row.requireApproval
    }, { skipGlobalLoading: true });
    saveSuccess.value = `Saved ${row.label}.`;
    await load();
    selectedId.value = row.id;
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Failed to save this email';
  } finally {
    savingSelected.value = false;
  }
}

async function sendTest() {
  const row = selected.value;
  if (!row || !testTo.value || !agencyId.value) return;
  testing.value = true;
  templateError.value = '';
  testMsg.value = '';
  try {
    if (row.kind === 'template') {
      await saveTemplateDraft(row);
      const templateId = loadedTemplate.value?.id;
      if (!templateId) throw new Error('Save the template before sending a test.');
      await api.post(`/email-templates/${templateId}/send`, {
        recipients: [testTo.value],
        subject: `[TEST] ${previewSubject.value}`,
        body: previewBody.value,
        agencyId: agencyId.value,
        senderIdentityId: row.senderIdentityId ? Number(row.senderIdentityId) : undefined
      }, { skipGlobalLoading: true });
    } else {
      throw new Error('Test send is available for template emails. Save the trigger, then use Communications to preview a live send.');
    }
    testMsg.value = `Test sent to ${testTo.value} with no live token.`;
  } catch (e) {
    templateError.value = e?.response?.data?.error?.message || e.message || 'Failed to send test email';
  } finally {
    testing.value = false;
  }
}

onMounted(load);
async function onChromeUpload(kind, ev) {
  const file = ev?.target?.files?.[0];
  if (!file || !agencyId.value) return;
  chromeUploading.value = kind;
  saveError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('agencyId', String(agencyId.value));
    const { data } = await api.post(`/email-settings/html-chrome/${kind}`, fd, {
      skipGlobalLoading: true,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (kind === 'header') {
      chromePreview.value.headerUrl = data?.url || data?.chrome?.headerUrl || '';
    } else {
      chromePreview.value.footerUrl = data?.url || data?.chrome?.footerUrl || '';
    }
    if (data?.chrome) chromeMeta.value = { ...chromeMeta.value, ...data.chrome };
    saveSuccess.value = `${kind === 'header' ? 'Header' : 'Footer'} uploaded for HTML emails.`;
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || `Failed to upload ${kind}`;
  } finally {
    chromeUploading.value = '';
    if (ev?.target) ev.target.value = '';
  }
}

function copyText(text) {
  const t = String(text || '');
  if (!t) return;
  navigator.clipboard?.writeText(t).then(
    () => {
      saveSuccess.value = 'Prompt copied.';
    },
    () => {
      saveError.value = 'Could not copy prompt';
    }
  );
}

watch(agencyId, () => { if (agencyId.value) load(); });
</script>

<style scoped>
.aes-page.container {
  max-width: none;
  width: 100%;
  padding-left: 20px;
  padding-right: 20px;
}
.aes-sub { max-width: 52rem; }
.aes-banner {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 12px;
  border: 1px solid #e5e7eb;
}
.aes-banner.warn { background: #fff7ed; border-color: #fdba74; }
.aes-banner.ok { background: #ecfdf5; border-color: #6ee7b7; }
.aes-chrome {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  margin: 0 0 14px;
  background: #fff;
}
.aes-chrome.warn { border-color: #fdba74; background: #fffbeb; }
.aes-chrome.ok { border-color: #6ee7b7; background: #f0fdf4; }
.aes-chrome-head { margin-bottom: 6px; }
.aes-chrome-help {
  margin: 0 0 12px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
}
.aes-chrome-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.aes-chrome-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  display: grid;
  gap: 8px;
}
.aes-chrome-card h3 {
  margin: 0;
  font-size: 14px;
}
.aes-chrome-img {
  width: 100%;
  height: auto;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #0f172a;
}
.aes-chrome-img.example { opacity: 0.85; }
.aes-upload-btn { justify-self: start; cursor: pointer; }
.aes-prompt summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  color: #0369a1;
}
.aes-prompt pre {
  white-space: pre-wrap;
  font-size: 11px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  max-height: 180px;
  overflow: auto;
}
@media (max-width: 900px) {
  .aes-chrome-grid { grid-template-columns: 1fr; }
}
.aes-toolbar {
  display: flex;
  gap: 8px;
  margin: 16px 0;
  flex-wrap: wrap;
}
.aes-toolbar input,
.aes-toolbar select,
.aes-field input,
.aes-field select,
.aes-field textarea {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}
.aes-toolbar input { flex: 1; min-width: 220px; }
.aes-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(360px, 1fr) minmax(300px, 420px);
  gap: 16px;
  align-items: stretch;
  min-height: 70vh;
}
.aes-list,
.aes-detail,
.aes-preview {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  min-height: 0;
}
.aes-list {
  max-height: calc(100vh - 220px);
  overflow: auto;
}
.aes-list-head,
.aes-preview-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}
.aes-list-head h2,
.aes-preview-head h2,
.aes-detail-head h2 { margin: 0; font-size: 15px; }
.aes-list-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid #f3f4f6;
  background: transparent;
  cursor: pointer;
}
.aes-list-item:hover { background: #f9fafb; }
.aes-list-item.active { background: #eef2ff; }
.aes-list-title { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
.aes-list-item small { display: block; color: #6b7280; margin-top: 2px; font-size: 12px; }
.aes-list-cat { text-transform: uppercase; letter-spacing: 0.03em; font-size: 10px !important; color: #64748b; }
.aes-list-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 4px !important;
}
.aes-from.hot, .hot { color: #b45309; }
.aes-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.aes-pill.ok { background: #d1fae5; color: #047857; }
.aes-pill.warn { background: #ffedd5; color: #c2410c; }
.aes-pill.off { background: #e5e7eb; color: #4b5563; }
.aes-detail {
  padding: 20px 22px;
  overflow: auto;
  max-height: calc(100vh - 220px);
}
.aes-detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
.aes-detail-head h2 { font-size: 1.35rem; }
.aes-kicker { margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; }
.aes-desc { line-height: 1.5; }
.aes-meta { display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; }
.aes-meta dt { color: #6b7280; font-size: 13px; }
.aes-meta dd { margin: 0; }
.aes-links { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0; }
.aes-link { font-weight: 600; }
.aes-note {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 12px 0;
  font-size: 13px;
}
.aes-note.warn { background: #fff7ed; border-color: #fdba74; }
.aes-template-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: end;
  margin: 12px 0;
}
.aes-field { display: flex; flex-direction: column; gap: 6px; margin: 14px 0; font-weight: 600; }
.aes-field-grow { flex: 1; min-width: 220px; margin: 0; }
.aes-field input, .aes-field select, .aes-field textarea { font-weight: 400; }
.aes-body { min-height: 220px; font-family: inherit; line-height: 1.45; resize: vertical; }
.aes-vars { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.aes-var {
  border: 1px solid #dbeafe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.aes-toggle { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.aes-toggle.block { margin: 10px 0; }
.aes-test-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: end;
}
.aes-test-row .aes-field { flex: 1; min-width: 220px; margin: 8px 0; }
.aes-detail-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.aes-preview {
  overflow: auto;
  max-height: calc(100vh - 220px);
  background: #f8fafc;
}
.aes-preview-chrome {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}
.aes-preview-chrome div { margin: 4px 0; }
.aes-preview-chrome span { display: inline-block; width: 64px; color: #6b7280; }
.aes-preview-body {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.92rem;
  line-height: 1.5;
  padding: 16px;
  margin: 0;
}
.aes-agency { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
.aes-empty { padding: 16px; }
.aes-set-meta { font-size: 0.82rem; }
.success { color: #047857; }
@media (max-width: 1200px) {
  .aes-workspace { grid-template-columns: minmax(260px, 320px) 1fr; }
  .aes-preview { grid-column: 1 / -1; max-height: 360px; }
}
@media (max-width: 800px) {
  .aes-workspace { grid-template-columns: 1fr; }
  .aes-list { max-height: 40vh; }
}
</style>
