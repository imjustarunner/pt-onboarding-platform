<template>
  <div class="roi-tab">
    <div class="form-section-divider" style="margin-top: 0; margin-bottom: 10px;">
      <h3 style="margin:0;">School ROI Access</h3>
      <div class="hint">
        Active school staff for this client's school are listed below. `ROI access` opens the client in the school portal. `ROI and Doc Access` also unlocks historical documents and packet audit.
      </div>
    </div>

    <div class="summary-row">
      <div class="summary-card">
        <div class="summary-k">School</div>
        <div class="summary-v">{{ schoolName }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-k">ROI expires</div>
        <div class="summary-v">{{ roiExpiryLabel }}</div>
        <div class="roi-date-editor">
          <input v-model="roiExpiryDraft" type="date" class="inline-date-input" />
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="roiDateSaving || !roiDateDirty || !roiExpiryDraft"
            @click="saveRoiDate"
          >
            {{ roiDateSaving ? 'Saving…' : 'Save date' }}
          </button>
        </div>
        <div class="hint">
          This date is the source of school ROI access. Anyone already set to `ROI access` or `ROI and Doc Access` becomes active again when this date is current.
        </div>
      </div>
      <div class="summary-card" :class="{ 'summary-card-alert': roiExpired }">
        <div class="summary-k">Portal status</div>
        <div class="summary-v">{{ roiExpired ? 'Expired / blocked' : 'Date active' }}</div>
      </div>
    </div>

    <div v-if="roiExpired" class="warning-card">
      ROI is expired or missing. School staff remain code-only and blocked until the ROI expiration date is updated or a newly signed ROI completes.
    </div>

    <div v-if="error" class="error" style="margin-bottom: 12px;">{{ error }}</div>
    <div v-if="loading" class="loading">Loading school ROI access…</div>
    <template v-else>
      <div class="signing-card">
        <div class="signing-header">
          <div>
            <div class="summary-k">Client ROI signing link</div>
            <div class="hint">
              This uses the school’s standard Smart School ROI by default. Issue a client-specific link or launch signing directly. Signing refreshes ROI records and auto-applies school-staff access from signed decisions.
            </div>
          </div>
          <span class="state-pill" :class="issuedLinkStateClass">
            {{ issuedLinkStateLabel }}
          </span>
        </div>

        <div class="signing-grid">
          <div class="summary-card">
            <div class="summary-k">Standard Smart ROI</div>
            <div class="summary-v">{{ activeSmartRoiTitle }}</div>
            <div class="hint">{{ activeSmartRoiSummary }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-k">Signed</div>
            <div class="summary-v">{{ issuedSignedLabel }}</div>
            <div class="hint">{{ issuedFormLabel }}</div>
          </div>
        </div>

        <div class="signing-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="issueLoading || !hasSigningConfig"
            @click="copyIssuedLink(false)"
          >
            {{ issueLoading ? 'Preparing…' : (issuedLink?.public_key ? 'Copy ROI Link' : 'Create + Copy ROI Link') }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="startSigningLoading || !hasSigningConfig"
            @click="startSigningSession"
          >
            {{ startSigningLoading ? 'Opening…' : 'Start Signing Session' }}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="issueLoading || !hasSigningConfig"
            @click="copyIssuedLink(true)"
          >
            Regenerate Link
          </button>
          <span v-if="copyStatus" class="hint strong">{{ copyStatus }}</span>
        </div>

        <div v-if="!hasSigningConfig" class="warning-card" style="margin-top: 0;">
          The standard Smart ROI is not available yet for this school or its agency. Once the shared Smart ROI is active, this client can be launched directly from here without any extra setup.
        </div>

        <div v-if="issuedLink?.public_key" class="link-preview-card">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Signing link</label>
            <input :value="issuedLinkUrl" type="text" readonly @focus="$event.target.select()" />
            <div class="hint">
              This is the live client-specific signing URL. You can copy it directly and share it manually.
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>Short text link</label>
            <input :value="issuedLinkShortUrl" type="text" readonly @focus="$event.target.select()" />
            <div class="hint">
              Use the shorter link when you want a cleaner text message.
            </div>
          </div>
        </div>

        <div class="sms-card">
          <div class="summary-k">Send ROI link by text</div>
          <div class="hint">
            This sends from the agency system number and saves the phone to the client profile if you type one here first.
          </div>

          <div class="sms-grid">
            <div class="form-group">
              <label>Client phone</label>
              <input
                v-model="smsPhoneDraft"
                type="tel"
                placeholder="(555) 555-5555"
                autocomplete="tel"
              />
            </div>

            <div class="summary-card">
              <div class="summary-k">Text link</div>
              <div class="summary-v">{{ issuedLink?.public_key ? 'Ready' : 'Auto-create on send' }}</div>
              <div class="hint">{{ issuedTextLinkSummary }}</div>
            </div>
          </div>

          <div class="form-group">
            <label>Text message</label>
            <textarea
              v-model="smsMessageDraft"
              rows="4"
              placeholder="ROI text message"
              @input="smsMessageTouched = true"
            />
            <div class="hint">
              Editable before sending. The text uses the shorter ROI link route for SMS.
            </div>
          </div>

          <div class="signing-actions" style="margin-bottom: 0;">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="smsSending || !hasSigningConfig || !smsPhoneDraft || !smsMessageDraft"
              @click="sendRoiText"
            >
              {{ smsSending ? 'Sending…' : 'Send ROI Text' }}
            </button>
            <span v-if="smsStatus" class="hint strong">{{ smsStatus }}</span>
          </div>
        </div>

        <div class="sms-card">
          <div class="summary-k">Send ROI link by email</div>
          <div class="hint">
            This sends the same client-specific smart ROI link directly to a guardian email using the agency sender identity.
          </div>

          <div class="sms-grid">
            <div class="form-group">
              <label>Guardian email</label>
              <input
                v-model="emailDraft"
                type="email"
                placeholder="guardian@example.com"
                autocomplete="email"
                list="roi-guardian-email-options"
              />
              <datalist id="roi-guardian-email-options">
                <option v-for="guardian in guardianEmails" :key="guardian.guardian_user_id || guardian.email" :value="guardian.email">
                  {{ guardianLabel(guardian) }}
                </option>
              </datalist>
            </div>

            <div class="summary-card">
              <div class="summary-k">Email link</div>
              <div class="summary-v">{{ issuedLink?.public_key ? 'Ready' : 'Auto-create on send' }}</div>
              <div class="hint">{{ issuedLinkSummary }}</div>
            </div>
          </div>

          <div class="form-group">
            <label>Email subject</label>
            <input
              v-model="emailSubjectDraft"
              type="text"
              placeholder="ROI email subject"
              @input="emailMessageTouched = true"
            />
          </div>

          <div class="form-group">
            <label>Email message</label>
            <textarea
              v-model="emailMessageDraft"
              rows="6"
              placeholder="ROI email message"
              @input="emailMessageTouched = true"
            />
            <div class="hint">
              Editable before sending. The secure private ROI link is included by default.
            </div>
          </div>

          <div class="signing-actions" style="margin-bottom: 0;">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="emailSending || !hasSigningConfig || !emailDraft || !emailSubjectDraft || !emailMessageDraft"
              @click="sendRoiEmail"
            >
              {{ emailSending ? 'Sending…' : 'Send ROI Email' }}
            </button>
            <span v-if="emailStatus" class="hint strong">{{ emailStatus }}</span>
          </div>
        </div>
      </div>

      <div v-if="rows.length === 0" class="empty-state">
        <p>No active school staff found for this school.</p>
      </div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Current state</th>
              <th>Set state</th>
              <th>Last packet upload</th>
              <th>Last ROI grant</th>
              <th class="right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.school_staff_user_id">
              <td>
                <div>{{ displayName(row) }}</div>
                <div v-if="row.effective_access_state === 'expired'" class="hint">ROI expired</div>
              </td>
              <td>{{ row.email || '—' }}</td>
              <td>
                <span class="state-pill" :class="stateClass(row.effective_access_state)">
                  {{ stateLabel(row.effective_access_state, row.access_level) }}
                </span>
              </td>
              <td style="min-width: 180px;">
                <select v-model="draftStates[row.school_staff_user_id]" class="inline-select">
                  <option value="none">No access</option>
                  <option value="packet">Packet</option>
                  <option value="limited">Limited</option>
                  <option value="roi">ROI access</option>
                  <option value="roi_docs">ROI and Doc Access</option>
                </select>
              </td>
              <td>
                <div>{{ formatDateTime(row.last_packet_uploaded_at) }}</div>
                <div v-if="row.last_packet_uploaded_by_name" class="hint">by {{ row.last_packet_uploaded_by_name }}</div>
              </td>
              <td>
                <div>{{ formatDateTime(row.granted_at) }}</div>
                <div v-if="row.granted_by_name" class="hint">by {{ row.granted_by_name }}</div>
              </td>
              <td class="right" style="white-space: nowrap;">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="savingUserId === row.school_staff_user_id || !isDirty(row)"
                  @click="saveRow(row)"
                >
                  {{ savingUserId === row.school_staff_user_id ? 'Saving…' : 'Save' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { buildPublicIntakeShortUrl, buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';

const props = defineProps({
  client: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['updated']);

const loading = ref(false);
const error = ref('');
const rows = ref([]);
const draftStates = ref({});
const savingUserId = ref(null);
const roiExpiresAt = ref(null);
const roiExpired = ref(true);
const schoolName = ref('');
const availableLinks = ref([]);
const savedIntakeLinkId = ref('');
const selectedIntakeLinkId = ref('');
const issuedLink = ref(null);
const configSaving = ref(false);
const issueLoading = ref(false);
const roiDateSaving = ref(false);
const smsSending = ref(false);
const emailSending = ref(false);
const startSigningLoading = ref(false);
const copyStatus = ref('');
const roiExpiryDraft = ref('');
const smsPhoneDraft = ref('');
const smsMessageDraft = ref('');
const smsMessageTouched = ref(false);
const smsStatus = ref('');
const guardianEmails = ref([]);
const emailDraft = ref('');
const emailSubjectDraft = ref('');
const emailMessageDraft = ref('');
const emailMessageTouched = ref(false);
const emailStatus = ref('');

const roiExpiryLabel = computed(() => {
  if (!roiExpiresAt.value) return 'Missing';
  return formatDate(roiExpiresAt.value);
});

const normalizeState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['none', 'packet', 'limited', 'roi', 'roi_docs'].includes(normalized) ? normalized : 'none';
};

const displayName = (row) => {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ').trim() || row?.email || `User ${row?.school_staff_user_id || ''}`;
};

const guardianLabel = (guardian) => {
  const fullName = [guardian?.first_name, guardian?.last_name].filter(Boolean).join(' ').trim();
  const relationship = String(guardian?.relationship_title || guardian?.relationship_type || '').trim();
  return [fullName || guardian?.email, relationship].filter(Boolean).join(' · ');
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const normalizeDateInputValue = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const stateLabel = (effectiveState, accessLevel) => {
  const effective = normalizeState(effectiveState);
  if (effectiveState === 'expired') return 'ROI expired';
  if (effective === 'roi_docs') return 'ROI and Doc Access';
  if (effective === 'roi') return 'ROI access';
  if (effective === 'limited') return 'Limited';
  if (effective === 'packet' || accessLevel === 'packet') return 'Packet';
  return 'No access';
};

const stateClass = (effectiveState) => {
  const state = String(effectiveState || '').trim().toLowerCase();
  return {
    'state-none': !state || state === 'none',
    'state-packet': state === 'packet',
    'state-limited': state === 'limited',
    'state-roi': state === 'roi' || state === 'roi_docs',
    'state-expired': state === 'expired'
  };
};

const hasSigningConfig = computed(() => !!String(selectedIntakeLinkId.value || '').trim());
const configDirty = computed(() => String(selectedIntakeLinkId.value || '') !== String(savedIntakeLinkId.value || ''));
const roiDateDirty = computed(() => String(roiExpiryDraft.value || '') !== String(normalizeDateInputValue(roiExpiresAt.value) || ''));
const activeSmartRoiLink = computed(() => {
  const selectedId = Number(selectedIntakeLinkId.value || 0);
  if (selectedId) {
    return availableLinks.value.find((link) => Number(link.id) === selectedId) || null;
  }
  return availableLinks.value[0] || null;
});
const activeSmartRoiTitle = computed(() => {
  if (!activeSmartRoiLink.value) return 'Not available yet';
  return activeSmartRoiLink.value.title || 'Smart ROI';
});
const activeSmartRoiSummary = computed(() => {
  if (!activeSmartRoiLink.value) {
    return 'No eligible Smart ROI is active for this school yet.';
  }
  return 'This client will use the school-specific Smart ROI automatically.';
});
const issuedLinkStateLabel = computed(() => {
  const state = String(issuedLink.value?.status || '').trim().toLowerCase();
  if (state === 'completed') return 'Completed';
  if (state === 'in_progress') return 'In progress';
  if (issuedLink.value?.public_key) return 'Issued';
  return 'Not issued';
});
const issuedLinkStateClass = computed(() => {
  const state = String(issuedLink.value?.status || '').trim().toLowerCase();
  if (state === 'completed') return 'state-roi';
  if (state === 'in_progress') return 'state-packet';
  if (issuedLink.value?.public_key) return 'state-packet';
  return 'state-none';
});
const issuedSignedLabel = computed(() => formatDateTime(issuedLink.value?.signed_at));
const issuedFormLabel = computed(() => issuedLink.value?.intake_link_title || activeSmartRoiTitle.value || 'Smart ROI');
const issuedLinkUrl = computed(() => buildPublicIntakeUrl(issuedLink.value?.public_key || ''));
const issuedLinkShortUrl = computed(() => buildPublicIntakeShortUrl(issuedLink.value?.public_key || ''));
const issuedLinkSummary = computed(() => {
  if (!issuedLink.value?.public_key) return 'Create a unique client link from the assigned school ROI form.';
  return issuedLinkUrl.value;
});
const issuedTextLinkSummary = computed(() => {
  if (!issuedLink.value?.public_key) return 'A shorter /i/ link will be used for texting.';
  return issuedLinkShortUrl.value;
});

const buildDefaultSmsMessage = () => {
  const agencyName = String(props.client?.agency_name || 'our agency').trim() || 'our agency';
  const linkUrl = buildPublicIntakeShortUrl(issuedLink.value?.public_key || '');
  return `Hi this is ${agencyName} and your ROI is expired. A new one has been attached to this private link: ${linkUrl} If you are no longer interested in our services write STOP. Respond with MORE if you'd like us to call you.`;
};

const buildDefaultEmailSubject = () => {
  const agencyName = String(props.client?.agency_name || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName.value || props.client?.organization_name || 'your school').trim() || 'your school';
  return `${agencyName}: Smart ROI for ${school}`;
};

const buildDefaultEmailMessage = () => {
  const agencyName = String(props.client?.agency_name || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName.value || props.client?.organization_name || 'your school').trim() || 'your school';
  const clientName = String(props.client?.full_name || props.client?.initials || 'the client').trim() || 'the client';
  const linkUrl = buildPublicIntakeUrl(issuedLink.value?.public_key || '');
  return [
    'Hello,',
    '',
    `${agencyName} has prepared a smart school ROI for ${clientName} related to ${school}.`,
    'Please review and complete it using the secure private link below:',
    '',
    linkUrl,
    '',
    'This link is client-specific and updates the client profile automatically once it is signed.',
    '',
    `Thank you,`,
    agencyName
  ].join('\n');
};

const load = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId) {
    rows.value = [];
    draftStates.value = {};
    availableLinks.value = [];
    issuedLink.value = null;
    savedIntakeLinkId.value = '';
    selectedIntakeLinkId.value = '';
    roiExpiryDraft.value = '';
    smsPhoneDraft.value = '';
    smsMessageDraft.value = '';
    smsStatus.value = '';
    guardianEmails.value = [];
    emailDraft.value = '';
    emailSubjectDraft.value = '';
    emailMessageDraft.value = '';
    emailStatus.value = '';
    return;
  }

  try {
    loading.value = true;
    error.value = '';
    copyStatus.value = '';
    smsStatus.value = '';
    const response = await api.get(`/clients/${clientId}/school-roi-access`);
    const payload = response.data || {};
    rows.value = Array.isArray(payload.staff) ? payload.staff : [];
    roiExpiresAt.value = payload.roi_expires_at || null;
    roiExpiryDraft.value = normalizeDateInputValue(payload.roi_expires_at || null);
    roiExpired.value = payload.roi_expired !== false;
    schoolName.value = payload.school_name || props.client?.organization_name || '—';
    draftStates.value = rows.value.reduce((acc, row) => {
      acc[row.school_staff_user_id] = normalizeState(row.access_level);
      return acc;
    }, {});
    const signing = payload.school_roi_signing || {};
    availableLinks.value = Array.isArray(signing.available_links) ? signing.available_links : [];
    savedIntakeLinkId.value = signing.selected_intake_link_id ? String(signing.selected_intake_link_id) : '';
    selectedIntakeLinkId.value = savedIntakeLinkId.value;
    issuedLink.value = signing.issued_link || null;
    guardianEmails.value = Array.isArray(payload.guardian_emails) ? payload.guardian_emails : [];
    smsPhoneDraft.value = String(props.client?.contact_phone || payload.client_contact_phone || '').trim();
    if (!smsMessageTouched.value || !String(smsMessageDraft.value || '').trim()) {
      smsMessageDraft.value = buildDefaultSmsMessage();
      smsMessageTouched.value = false;
    }
    emailDraft.value = String(emailDraft.value || payload.default_guardian_email || guardianEmails.value[0]?.email || '').trim();
    if (!emailMessageTouched.value || !String(emailSubjectDraft.value || '').trim()) {
      emailSubjectDraft.value = buildDefaultEmailSubject();
    }
    if (!emailMessageTouched.value || !String(emailMessageDraft.value || '').trim()) {
      emailMessageDraft.value = buildDefaultEmailMessage();
      emailMessageTouched.value = false;
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load school ROI access';
    rows.value = [];
    draftStates.value = {};
    availableLinks.value = [];
    issuedLink.value = null;
    savedIntakeLinkId.value = '';
    selectedIntakeLinkId.value = '';
    roiExpiryDraft.value = '';
    smsPhoneDraft.value = '';
    smsMessageDraft.value = '';
    smsStatus.value = '';
    guardianEmails.value = [];
    emailDraft.value = '';
    emailSubjectDraft.value = '';
    emailMessageDraft.value = '';
    emailStatus.value = '';
  } finally {
    loading.value = false;
  }
};

const isDirty = (row) => normalizeState(draftStates.value[row.school_staff_user_id]) !== normalizeState(row.access_level);

const saveRow = async (row) => {
  const clientId = Number(props.client?.id || 0);
  const schoolStaffUserId = Number(row?.school_staff_user_id || 0);
  if (!clientId || !schoolStaffUserId) return;

  try {
    savingUserId.value = schoolStaffUserId;
    error.value = '';
    const nextState = normalizeState(draftStates.value[schoolStaffUserId]);
    await api.put(`/clients/${clientId}/school-roi-access/${schoolStaffUserId}`, { nextState });
    await load();
    emit('updated', { keepOpen: true });
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update school ROI access';
  } finally {
    savingUserId.value = null;
  }
};

const saveRoiDate = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId || !roiExpiryDraft.value) return;
  try {
    roiDateSaving.value = true;
    error.value = '';
    await api.put(`/clients/${clientId}/school-roi-expiration`, {
      roi_expires_at: roiExpiryDraft.value
    });
    await load();
    emit('updated', { keepOpen: true });
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update ROI expiration date';
  } finally {
    roiDateSaving.value = false;
  }
};

const saveSigningConfig = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId) return false;
  try {
    configSaving.value = true;
    error.value = '';
    copyStatus.value = '';
    await api.put(`/clients/${clientId}/school-roi-signing-config`, {
      intakeLinkId: selectedIntakeLinkId.value ? Number(selectedIntakeLinkId.value) : null
    });
    savedIntakeLinkId.value = String(selectedIntakeLinkId.value || '');
    await load();
    return true;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save school ROI form';
    return false;
  } finally {
    configSaving.value = false;
  }
};

const ensureIssuedLink = async (regenerate = false) => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId || !hasSigningConfig.value) return null;
  if (configDirty.value) {
    const ok = await saveSigningConfig();
    if (!ok) return null;
  }
  const response = await api.post(`/clients/${clientId}/school-roi-signing-link`, { regenerate });
  issuedLink.value = response.data?.issued_link || null;
  return issuedLink.value;
};

const copyIssuedLink = async (regenerate = false) => {
  if (!hasSigningConfig.value) return;
  try {
    issueLoading.value = true;
    error.value = '';
    copyStatus.value = '';
    const link = await ensureIssuedLink(regenerate);
    if (!link) return;
    const url = buildPublicIntakeUrl(link.public_key || '');
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        copyStatus.value = regenerate ? 'New ROI link copied.' : 'ROI link copied.';
      } catch {
        copyStatus.value = url;
      }
    }
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to create client ROI link';
  } finally {
    issueLoading.value = false;
  }
};

const startSigningSession = async () => {
  if (!hasSigningConfig.value) return;
  try {
    startSigningLoading.value = true;
    error.value = '';
    copyStatus.value = '';
    const link = await ensureIssuedLink(false);
    const url = buildPublicIntakeUrl(link?.public_key || '');
    if (!url) {
      error.value = 'Failed to prepare client ROI link';
      return;
    }
    window.open(url, '_blank', 'noopener');
    copyStatus.value = 'Signing session opened.';
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to start signing session';
  } finally {
    startSigningLoading.value = false;
  }
};

const sendRoiText = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId) return;
  try {
    smsSending.value = true;
    error.value = '';
    smsStatus.value = '';
    if (configDirty.value) {
      const ok = await saveSigningConfig();
      if (!ok) return;
    }
    const response = await api.post(`/clients/${clientId}/school-roi-signing-text`, {
      phoneNumber: smsPhoneDraft.value,
      message: smsMessageDraft.value
    });
    issuedLink.value = response.data?.issued_link || issuedLink.value;
    smsPhoneDraft.value = response.data?.sent_to || smsPhoneDraft.value;
    smsMessageDraft.value = response.data?.message || smsMessageDraft.value;
    smsMessageTouched.value = true;
    smsStatus.value = `Text sent to ${response.data?.sent_to || smsPhoneDraft.value}.`;
    emit('updated', { keepOpen: true, client: response.data?.client || undefined });
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to send ROI text';
  } finally {
    smsSending.value = false;
  }
};

const sendRoiEmail = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId) return;
  try {
    emailSending.value = true;
    error.value = '';
    emailStatus.value = '';
    if (configDirty.value) {
      const ok = await saveSigningConfig();
      if (!ok) return;
    }
    const response = await api.post(`/clients/${clientId}/school-roi-signing-email`, {
      email: emailDraft.value,
      subject: emailSubjectDraft.value,
      message: emailMessageDraft.value
    });
    issuedLink.value = response.data?.issued_link || issuedLink.value;
    emailDraft.value = response.data?.sent_to || emailDraft.value;
    emailSubjectDraft.value = response.data?.subject || emailSubjectDraft.value;
    emailMessageDraft.value = response.data?.message || emailMessageDraft.value;
    emailMessageTouched.value = true;
    emailStatus.value = `Email sent to ${response.data?.sent_to || emailDraft.value}.`;
    emit('updated', { keepOpen: true, client: response.data?.client || undefined });
    await load();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to send ROI email';
  } finally {
    emailSending.value = false;
  }
};

watch(
  () => issuedLink.value?.public_key,
  () => {
    if (!smsMessageTouched.value || !String(smsMessageDraft.value || '').trim()) {
      smsMessageDraft.value = buildDefaultSmsMessage();
      smsMessageTouched.value = false;
    }
    if (!emailMessageTouched.value || !String(emailSubjectDraft.value || '').trim()) {
      emailSubjectDraft.value = buildDefaultEmailSubject();
    }
    if (!emailMessageTouched.value || !String(emailMessageDraft.value || '').trim()) {
      emailMessageDraft.value = buildDefaultEmailMessage();
      emailMessageTouched.value = false;
    }
  }
);

watch(
  () => props.client?.id,
  () => {
    load();
  },
  { immediate: true }
);
</script>

<style scoped>
.summary-row,
.signing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.summary-card,
.signing-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
}

.summary-card-alert {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.06);
}

.summary-k {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.summary-v {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-word;
}

.roi-date-editor {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.inline-date-input {
  min-width: 160px;
}

.warning-card {
  border: 1px solid rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.08);
  color: #92400e;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 700;
}

.signing-card {
  margin-bottom: 14px;
}

.sms-card {
  border-top: 1px solid var(--border);
  margin-top: 12px;
  padding-top: 12px;
}

.sms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 12px 0;
}

.signing-header,
.signing-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.link-preview-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.strong {
  font-weight: 700;
}

.state-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  border: 1px solid var(--border);
}

.state-none {
  background: rgba(107, 114, 128, 0.08);
  color: #4b5563;
}

.state-packet {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #1d4ed8;
}

.state-limited {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
  color: #3730a3;
}

.state-roi {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #047857;
}

.state-expired {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.28);
  color: #b91c1c;
}
</style>
