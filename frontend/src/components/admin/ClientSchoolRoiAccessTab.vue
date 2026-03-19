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
              This uses the school’s standard release of information (ROI) by default. Issue a client-specific link or launch signing directly. Signing refreshes ROI records and auto-applies school-staff access from signed decisions.
            </div>
          </div>
          <span class="state-pill" :class="issuedLinkStateClass">
            {{ issuedLinkStateLabel }}
          </span>
        </div>

        <div class="signing-grid">
          <div class="summary-card">
            <div class="summary-k">School ROI Form</div>
            <div class="summary-v">{{ activeSmartRoiTitle }}</div>
            <div class="hint">{{ activeSmartRoiSummary }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-k">Signed</div>
            <div class="summary-v">{{ issuedSignedLabel }}</div>
            <div class="hint">{{ issuedFormLabel }}</div>
          </div>
        </div>

        <div class="sms-card">
          <div class="summary-k">ROI link type</div>
          <div class="hint">
            Choose whether this link signs school-staff ROI only, adds one sender-programmed non-school recipient, or lets the parent enter non-school release recipients.
          </div>
          <div class="form-group">
            <label>Flow</label>
            <select v-model="issueMode" class="inline-select">
              <option value="school_staff_only">School staff ROI only</option>
              <option value="sender_programmed">Sender-programmed non-school recipient</option>
              <option value="parent_defined">Parent enters non-school recipients</option>
            </select>
          </div>
          <div v-if="issueMode === 'sender_programmed'" class="sms-grid">
            <div class="form-group">
              <label>Recipient name</label>
              <input v-model="programmedRecipientName" type="text" placeholder="Person name" />
            </div>
            <div class="form-group">
              <label>Relationship</label>
              <input v-model="programmedRecipientRelationship" type="text" placeholder="Case manager, mentor, etc." />
            </div>
            <div class="form-group">
              <label>Email (optional)</label>
              <input v-model="programmedRecipientEmail" type="email" placeholder="recipient@example.com" />
            </div>
            <div class="form-group">
              <label>Phone (optional)</label>
              <input v-model="programmedRecipientPhone" type="tel" placeholder="(555) 555-5555" />
            </div>
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
          The school ROI form is not available yet for this school or its agency. Once the shared ROI form is active, this client can be launched directly from here without any extra setup.
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
            This sends the same client-specific ROI link directly to a guardian email using the agency sender identity.
          </div>

          <div class="sms-grid">
            <div class="form-group">
              <label>ROI language</label>
              <select v-model="emailLanguageDraft" class="inline-select">
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
            </div>
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
              :disabled="emailSending || emailCooldownSec > 0 || !hasSigningConfig || !emailDraft || !emailSubjectDraft || !emailMessageDraft"
              @click="sendRoiEmail"
            >
              <template v-if="emailSending">Sending…</template>
              <template v-else-if="emailCooldownSec > 0">Resend available in {{ emailCooldownSec }}s</template>
              <template v-else>Send ROI Email</template>
            </button>
            <span v-if="emailStatus" class="hint strong">{{ emailStatus }}</span>
          </div>
          <div v-if="persistentSendCount > 0 || emailSendLog.length" class="email-send-log" style="margin-top: 6px;">
            <small class="hint" style="display: block; margin-bottom: 2px; font-weight: 600;">
              Email sent {{ persistentSendCount }} time{{ persistentSendCount === 1 ? '' : 's' }} total
              <template v-if="persistentLastSentAt"> · Last: {{ new Date(persistentLastSentAt).toLocaleString() }}</template>
              <template v-if="persistentLastSentTo"> to {{ persistentLastSentTo }}</template>
            </small>
            <ul v-if="emailSendLog.length" style="list-style: none; padding: 0; margin: 4px 0 0;">
              <li v-for="(entry, idx) in emailSendLog" :key="idx" style="font-size: 0.82rem; color: #666; padding: 1px 0;">
                {{ entry.email }} — {{ new Date(entry.sentAt).toLocaleString() }} (this session)
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-if="rows.length === 0" class="empty-state">
        <p>No active school staff found for this school.</p>
      </div>
      <div v-else>
        <div class="bulk-bar">
          <div class="bulk-bar-left">
            <label class="bulk-label">Set all to:</label>
            <select v-model="bulkAccessLevel" class="inline-select bulk-select" :disabled="bulkSaving">
              <option value="">— choose —</option>
              <option value="none">No access</option>
              <option value="packet">Packet</option>
              <option value="limited">Limited</option>
              <option value="roi">ROI access</option>
              <option value="roi_docs">ROI and Doc Access</option>
            </select>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!bulkAccessLevel || bulkSaving"
              @click="applyBulkAndSave"
            >
              {{ bulkSaving ? `Saving ${bulkProgress}/${rows.length}…` : 'Apply + Save All' }}
            </button>
          </div>
          <div class="bulk-bar-right">
            <span v-if="dirtyCount > 0" class="dirty-count">{{ dirtyCount }} unsaved change{{ dirtyCount === 1 ? '' : 's' }}</span>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="dirtyCount === 0 || bulkSaving"
              @click="saveAllDirty"
            >
              {{ bulkSaving ? `Saving ${bulkProgress}…` : `Save All Changes (${dirtyCount})` }}
            </button>
          </div>
        </div>

        <div v-if="bulkError" class="error" style="margin-bottom: 8px;">{{ bulkError }}</div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Current state</th>
                <th>Set state</th>
                <th>Last packet upload</th>
                <th>Last ROI grant</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.school_staff_user_id" :class="{ 'row-dirty': isDirty(row) }">
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
                  <select v-model="draftStates[row.school_staff_user_id]" class="inline-select" :disabled="bulkSaving">
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
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
const roiExpired = ref(false);
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
const emailLanguageDraft = ref('en');
const emailCooldownSec = ref(0);
const emailSendLog = ref([]);
let _emailCooldownTimer = null;
const issueMode = ref('school_staff_only');
const programmedRecipientName = ref('');
const programmedRecipientRelationship = ref('');
const programmedRecipientEmail = ref('');
const programmedRecipientPhone = ref('');

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
  return activeSmartRoiLink.value.title || 'School ROI';
});
const activeSmartRoiSummary = computed(() => {
  if (!activeSmartRoiLink.value) {
    return 'No eligible ROI form is active for this school yet.';
  }
  return 'This client will use the school-specific ROI form automatically.';
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
const issuedFormLabel = computed(() => issuedLink.value?.intake_link_title || activeSmartRoiTitle.value || 'School ROI');
const issuedLinkUrl = computed(() => buildPublicIntakeUrl(issuedLink.value?.public_key || ''));
const issuedLinkShortUrl = computed(() => buildPublicIntakeShortUrl(issuedLink.value?.public_key || ''));
const issuedLinkSummary = computed(() => {
  if (!issuedLink.value?.public_key) return 'Create a unique client link from the assigned school ROI form.';
  return issuedLinkUrl.value;
});
const persistentSendCount = computed(() => Number(issuedLink.value?.email_send_count || 0));
const persistentLastSentAt = computed(() => issuedLink.value?.last_email_sent_at || null);
const persistentLastSentTo = computed(() => issuedLink.value?.last_email_sent_to || null);
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
  const isSpanish = String(emailLanguageDraft.value || '').toLowerCase() === 'es';
  const agencyName = String(props.client?.agency_name || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName.value || props.client?.organization_name || 'your school').trim() || 'your school';
  if (isSpanish) {
    return `${agencyName}: Autorizacion de Divulgacion de Informacion para ${school}`;
  }
  return `${agencyName}: Release of Information for ${school}`;
};

const buildDefaultEmailMessage = () => {
  const isSpanish = String(emailLanguageDraft.value || '').toLowerCase() === 'es';
  const agencyName = String(props.client?.agency_name || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName.value || props.client?.organization_name || 'your school').trim() || 'your school';
  const clientName = String(props.client?.full_name || props.client?.initials || 'the client').trim() || 'the client';
  const linkUrl = buildPublicIntakeUrl(issuedLink.value?.public_key || '');
  if (isSpanish) {
    return [
      'Hola,',
      '',
      `${agencyName} preparo una autorizacion de divulgacion de informacion (ROI) para ${clientName} relacionada con ${school}.`,
      'Por favor revise y complete la autorizacion con el enlace privado y seguro a continuacion:',
      '',
      linkUrl,
      '',
      'Este enlace es especifico para el cliente y actualiza el perfil automaticamente una vez firmado.',
      '',
      'Gracias,',
      agencyName
    ].join('\n');
  }
  return [
    'Hello,',
    '',
    `${agencyName} has prepared a release of information (ROI) for ${clientName} related to ${school}.`,
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
    issueMode.value = 'school_staff_only';
    programmedRecipientName.value = '';
    programmedRecipientRelationship.value = '';
    programmedRecipientEmail.value = '';
    programmedRecipientPhone.value = '';
    roiExpiresAt.value = null;
    roiExpired.value = false;
    return;
  }

  try {
    loading.value = true;
    error.value = '';
    copyStatus.value = '';
    smsStatus.value = '';
    emailStatus.value = '';
    emailDraft.value = '';
    emailSubjectDraft.value = '';
    emailMessageDraft.value = '';
    emailMessageTouched.value = false;
    smsMessageTouched.value = false;
    emailCooldownSec.value = 0;
    emailSendLog.value = [];
    if (_emailCooldownTimer) { clearInterval(_emailCooldownTimer); _emailCooldownTimer = null; }
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
    emailLanguageDraft.value = String(signing.issued_link?.language_code || activeSmartRoiLink.value?.language_code || 'en').toLowerCase().startsWith('es')
      ? 'es'
      : 'en';
    issueMode.value = String(signing.issued_link?.issue_mode || 'school_staff_only').trim() || 'school_staff_only';
    programmedRecipientName.value = String(signing.issued_link?.programmed_external_recipient?.name || '').trim();
    programmedRecipientRelationship.value = String(signing.issued_link?.programmed_external_recipient?.relationship || '').trim();
    programmedRecipientEmail.value = String(signing.issued_link?.programmed_external_recipient?.email || '').trim();
    programmedRecipientPhone.value = String(signing.issued_link?.programmed_external_recipient?.phone || '').trim();
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
    issueMode.value = 'school_staff_only';
    programmedRecipientName.value = '';
    programmedRecipientRelationship.value = '';
    programmedRecipientEmail.value = '';
    programmedRecipientPhone.value = '';
    emailLanguageDraft.value = 'en';
    roiExpiresAt.value = null;
    roiExpired.value = false;
  } finally {
    loading.value = false;
  }
};

const bulkAccessLevel = ref('');
const bulkSaving = ref(false);
const bulkProgress = ref('');
const bulkError = ref('');

const isDirty = (row) => normalizeState(draftStates.value[row.school_staff_user_id]) !== normalizeState(row.access_level);

const dirtyCount = computed(() => (rows.value || []).filter((r) => isDirty(r)).length);

const saveRow = async (row) => {
  const clientId = Number(props.client?.id || 0);
  const schoolStaffUserId = Number(row?.school_staff_user_id || 0);
  if (!clientId || !schoolStaffUserId) return;

  try {
    savingUserId.value = schoolStaffUserId;
    error.value = '';
    const nextState = normalizeState(draftStates.value[schoolStaffUserId]);
    await api.put(`/clients/${clientId}/school-roi-access/${schoolStaffUserId}`, { nextState });
    emit('updated', { keepOpen: true });
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update school ROI access';
  } finally {
    savingUserId.value = null;
  }
};

const saveAllDirty = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId) return;
  const dirtyRows = (rows.value || []).filter((r) => isDirty(r));
  if (dirtyRows.length === 0) return;

  bulkSaving.value = true;
  bulkError.value = '';
  let saved = 0;
  const errors = [];

  for (const row of dirtyRows) {
    const uid = Number(row.school_staff_user_id || 0);
    if (!uid) continue;
    saved += 1;
    bulkProgress.value = `${saved}/${dirtyRows.length}`;
    try {
      const nextState = normalizeState(draftStates.value[uid]);
      await api.put(`/clients/${clientId}/school-roi-access/${uid}`, { nextState });
    } catch (err) {
      errors.push(`${displayName(row)}: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  bulkSaving.value = false;
  bulkProgress.value = '';
  if (errors.length) {
    bulkError.value = `Saved ${saved - errors.length}/${dirtyRows.length}. Errors: ${errors.join('; ')}`;
  }
  await load();
  emit('updated', { keepOpen: true });
};

const applyBulkAndSave = async () => {
  const level = normalizeState(bulkAccessLevel.value);
  if (!level && level !== 'none') return;
  for (const row of rows.value || []) {
    draftStates.value[row.school_staff_user_id] = level;
  }
  bulkAccessLevel.value = '';
  await saveAllDirty();
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
  if (issueMode.value === 'sender_programmed') {
    if (!String(programmedRecipientName.value || '').trim() || !String(programmedRecipientRelationship.value || '').trim()) {
      error.value = 'Recipient name and relationship are required for sender-programmed ROI links.';
      return null;
    }
  }
  if (configDirty.value) {
    const ok = await saveSigningConfig();
    if (!ok) return null;
  }
  const response = await api.post(`/clients/${clientId}/school-roi-signing-link`, {
    regenerate,
    languageCode: emailLanguageDraft.value,
    issueMode: issueMode.value,
    programmedExternalRecipient: issueMode.value === 'sender_programmed'
      ? {
          name: programmedRecipientName.value,
          relationship: programmedRecipientRelationship.value,
          email: programmedRecipientEmail.value,
          phone: programmedRecipientPhone.value
        }
      : null
  });
  issuedLink.value = response.data?.issued_link || null;
  return issuedLink.value;
};

const copyIssuedLink = async (regenerate = false) => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId) return;
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
        try {
          await api.post(`/clients/${clientId}/school-roi-signing-link/copied`, {
            signingLinkId: Number(link.id || 0),
            regenerate: !!regenerate
          });
        } catch {
          // best-effort tracking only
        }
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
      message: smsMessageDraft.value,
      languageCode: emailLanguageDraft.value
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

const startEmailCooldown = (seconds) => {
  if (_emailCooldownTimer) clearInterval(_emailCooldownTimer);
  emailCooldownSec.value = seconds;
  _emailCooldownTimer = setInterval(() => {
    emailCooldownSec.value = Math.max(0, emailCooldownSec.value - 1);
    if (emailCooldownSec.value <= 0 && _emailCooldownTimer) {
      clearInterval(_emailCooldownTimer);
      _emailCooldownTimer = null;
    }
  }, 1000);
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
      message: emailMessageDraft.value,
      languageCode: emailLanguageDraft.value
    });
    issuedLink.value = response.data?.issued_link || issuedLink.value;
    emailDraft.value = response.data?.sent_to || emailDraft.value;
    emailSubjectDraft.value = response.data?.subject || emailSubjectDraft.value;
    emailMessageDraft.value = response.data?.message || emailMessageDraft.value;
    emailMessageTouched.value = true;

    const sentTo = response.data?.sent_to || emailDraft.value;
    const sentAt = response.data?.sent_at || new Date().toISOString();
    emailStatus.value = `Email sent to ${sentTo}.`;
    emailSendLog.value = [
      { email: sentTo, sentAt },
      ...emailSendLog.value
    ].slice(0, 20);

    const cooldownSec = response.data?.cooldown_seconds || 180;
    startEmailCooldown(cooldownSec);

    emit('updated', { keepOpen: true, client: response.data?.client || undefined });
    await load();
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || 'Failed to send ROI email';
    error.value = errMsg;
    if (err.response?.status === 429) {
      const match = errMsg.match(/wait (\d+) seconds/);
      if (match) startEmailCooldown(Number(match[1]));
    }
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
  () => emailLanguageDraft.value,
  () => {
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

onBeforeUnmount(() => {
  if (_emailCooldownTimer) { clearInterval(_emailCooldownTimer); _emailCooldownTimer = null; }
});
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

.bulk-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
}

.bulk-bar-left,
.bulk-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bulk-label {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.bulk-select {
  min-width: 170px;
}

.dirty-count {
  font-size: 12px;
  font-weight: 800;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 999px;
  padding: 3px 10px;
  white-space: nowrap;
}

.row-dirty {
  background: rgba(245, 158, 11, 0.06);
}
</style>
