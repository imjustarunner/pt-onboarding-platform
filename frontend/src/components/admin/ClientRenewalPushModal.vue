<template>
  <div v-if="open" class="cr-modal-backdrop" @click.self="close">
    <div class="cr-modal" role="dialog" aria-label="Client Renewal">
      <header class="cr-modal__head">
        <div>
          <h3>Client Renewal</h3>
          <p class="hint">
            Choose what to include, preview the email and guardian page, then send.
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="close">Close</button>
      </header>

      <div class="cr-modal__layout">
        <section class="cr-modal__left">
          <div class="cr-roi-status" v-if="roiStatus">
            Smart School ROI:
            <strong :class="`cr-roi-status--${roiStatus}`">{{ roiStatusLabel }}</strong>
            <span class="hint"> for affiliated school</span>
          </div>

          <label class="cr-opt">
            <input v-model="form.verifyContact" type="checkbox" />
            <span>Verify contact info</span>
          </label>
          <label class="cr-opt">
            <input v-model="form.smartRoi" type="checkbox" />
            <span>
              Sign new Smart School ROI
              <em v-if="form.recommendSmartRoi" class="cr-rec">Recommended</em>
            </span>
          </label>
          <label class="cr-opt">
            <input v-model="form.smartDisclosure" type="checkbox" />
            <span>
              Sign new Smart Disclosure
              <em v-if="form.recommendSmartDisclosure" class="cr-rec">Recommended</em>
            </span>
          </label>
          <label class="cr-opt">
            <input v-model="form.fullPacket" type="checkbox" />
            <span>Full enrollment packet renewal</span>
          </label>
          <div v-if="form.fullPacket" class="cr-packet-mode">
            <label>
              <input v-model="form.packetMode" type="radio" value="school" />
              School renewal
            </label>
            <label>
              <input v-model="form.packetMode" type="radio" value="office" />
              Office renewal
            </label>
          </div>

          <p class="hint">
            Email goes to the guardian from ITSCO SCHOOLS TEAM (schools@) with subject “{School} action needed”.
          </p>
          <p v-if="error" class="error">{{ error }}</p>
          <p v-if="success" class="success">{{ success }}</p>
        </section>

        <section class="cr-modal__right">
          <div class="cr-preview-card">
            <div class="cr-preview-card__head">
              <strong>Email preview</strong>
              <span class="hint">Updates as you check options</span>
            </div>
            <div class="cr-email">
              <div class="cr-email__meta"><span>From</span> ITSCO SCHOOLS TEAM &lt;schools@&gt;</div>
              <div class="cr-email__meta"><span>To</span> {{ guardianEmail || 'Guardian email on file' }}</div>
              <div class="cr-email__meta"><span>Subject</span> {{ emailSubject }}</div>
              <pre class="cr-email__body">{{ emailBodyPreview }}</pre>
            </div>
          </div>

          <div class="cr-preview-card">
            <div class="cr-preview-card__head">
              <strong>Guardian interface preview</strong>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="!anyOption || previewing"
                @click="openSelectionPreview"
              >
                {{ previewing ? 'Opening…' : 'Open full page' }}
              </button>
            </div>
            <p class="hint" style="margin-bottom: 8px;">
              Full-page step flow (not a modal). Opens with your current selections only.
            </p>
            <div class="cr-iface">
              <div class="cr-iface__brand">{{ agencyLabel }}</div>
              <p class="cr-iface__sub">Supporting {{ schoolLabel }} · participant {{ clientInitials || '—' }}</p>
              <ul class="cr-iface__steps">
                <li v-for="item in selectedItemLabels" :key="item">{{ item }}</li>
                <li v-if="!selectedItemLabels.length" class="cr-iface__empty">
                  Check at least one option to preview steps.
                </li>
              </ul>
            </div>
            <p v-if="previewError" class="error">{{ previewError }}</p>
          </div>
        </section>
      </div>

      <footer class="cr-modal__foot">
        <button type="button" class="btn btn-secondary" :disabled="sending || previewing" @click="close">
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sending || previewing || !anyOption"
          @click="send"
        >
          {{ sending ? 'Sending…' : 'Create & send renewal' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  roiExpiresAt: { type: [String, Date], default: null },
  disclosureStatus: { type: String, default: '' },
  schoolName: { type: String, default: '' },
  agencyName: { type: String, default: 'ITSCO' },
  guardianEmail: { type: String, default: '' },
  clientInitials: { type: String, default: '' },
  /** Pre-check options from roster renewalFlags.recommended */
  initialOptions: { type: Object, default: null }
});

const emit = defineEmits(['close', 'sent']);

const sending = ref(false);
const previewing = ref(false);
const error = ref('');
const success = ref('');
const previewError = ref('');
const previewHubUrl = ref('');

const form = reactive({
  verifyContact: true,
  smartRoi: false,
  smartDisclosure: false,
  fullPacket: false,
  packetMode: 'school',
  recommendSmartRoi: false,
  recommendSmartDisclosure: false
});

const anyOption = computed(
  () => form.verifyContact || form.smartRoi || form.smartDisclosure || form.fullPacket
);

const schoolLabel = computed(() => String(props.schoolName || '').trim() || 'School');
const agencyLabel = computed(() => String(props.agencyName || '').trim() || 'ITSCO');

const selectedItemLabels = computed(() => {
  const items = [];
  if (form.verifyContact) items.push('Verify contact info');
  if (form.smartRoi) items.push('Sign updated Smart School ROI');
  if (form.smartDisclosure) items.push('Sign updated Smart Disclosure');
  if (form.fullPacket) {
    items.push(
      form.packetMode === 'office'
        ? 'Complete office enrollment packet renewal'
        : 'Complete school enrollment packet renewal'
    );
  }
  return items;
});

const emailSubject = computed(() => `${schoolLabel.value} Action Needed : ${agencyLabel.value}`);

const emailBodyPreview = computed(() => {
  const school = schoolLabel.value;
  const agency = agencyLabel.value;
  const items = selectedItemLabels.value;
  const itemBlock = items.length
    ? ['Items requested:', ...items.map((item, i) => `${i + 1}. ${item}`), ''].join('\n')
    : '';
  return [
    'Hello,',
    '',
    `${agency} has a few items that need your attention for a student we support at ${school}.`,
    'Please use the secure link below to review and complete what is requested.',
    '',
    itemBlock,
    '[secure renewal link]',
    '',
    'If you are no longer interested in receiving these notices, you can opt out here:',
    '[opt-out link]',
    '',
    'Thank you,',
    'ITSCO SCHOOLS TEAM'
  ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');
});

const roiStatus = computed(() => {
  const raw = props.roiExpiresAt;
  if (raw == null || raw === '') return 'none';
  const ymd = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'none';
  const today = new Date();
  const todayYmd = today.toISOString().slice(0, 10);
  return ymd < todayYmd ? 'expired' : 'active';
});

const roiStatusLabel = computed(() => {
  if (roiStatus.value === 'active') return 'Active';
  if (roiStatus.value === 'expired') return 'Expired';
  return 'None';
});

function applyRecommendations() {
  const initial = props.initialOptions && typeof props.initialOptions === 'object'
    ? props.initialOptions
    : null;
  if (initial) {
    form.verifyContact = initial.verifyContact !== false;
    form.smartRoi = !!initial.smartRoi;
    form.smartDisclosure = !!initial.smartDisclosure;
    form.fullPacket = !!initial.fullPacket;
    form.packetMode = initial.packetMode === 'office' ? 'office' : 'school';
    form.recommendSmartRoi = !!initial.smartRoi;
    form.recommendSmartDisclosure = !!initial.smartDisclosure;
    return;
  }
  const roiRec = roiStatus.value === 'expired' || roiStatus.value === 'none';
  const disc = String(props.disclosureStatus || '').toLowerCase();
  const discRec = !disc || disc === 'missing' || disc === 're_sign_needed' || disc === 'expired';
  form.recommendSmartRoi = roiRec;
  form.recommendSmartDisclosure = discRec;
  form.smartRoi = roiRec;
  form.smartDisclosure = discRec;
  form.verifyContact = true;
  form.fullPacket = false;
  form.packetMode = 'school';
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    error.value = '';
    success.value = '';
    previewError.value = '';
    previewHubUrl.value = '';
    applyRecommendations();
  }
);

function close() {
  emit('close');
}

function optionPayload() {
  return {
    agencyId: props.agencyId ? Number(props.agencyId) : undefined,
    verifyContact: form.verifyContact,
    smartRoi: form.smartRoi,
    smartDisclosure: form.smartDisclosure,
    fullPacket: form.fullPacket,
    packetMode: form.fullPacket ? form.packetMode : null
  };
}

async function openSelectionPreview() {
  previewError.value = '';
  if (!anyOption.value) {
    previewError.value = 'Select at least one option';
    return;
  }
  previewing.value = true;
  try {
    const res = await api.post(`/clients/${props.clientId}/renewals/preview`, optionPayload());
    const hubUrl = String(res.data?.hubUrl || '').trim();
    if (!hubUrl) {
      previewError.value = 'Preview link was not generated';
      return;
    }
    previewHubUrl.value = hubUrl;
    window.open(hubUrl, '_blank', 'noopener');
  } catch (e) {
    previewError.value = e?.response?.data?.error?.message || 'Failed to open preview';
  } finally {
    previewing.value = false;
  }
}

async function send() {
  error.value = '';
  success.value = '';
  if (!anyOption.value) {
    error.value = 'Select at least one option';
    return;
  }
  sending.value = true;
  try {
    const res = await api.post(`/clients/${props.clientId}/renewals`, {
      ...optionPayload(),
      send: true,
      sendNow: true
    });
    previewHubUrl.value = String(res.data?.hubUrl || previewHubUrl.value || '');
    success.value = res.data?.email?.to
      ? `Renewal emailed to ${res.data.email.to}.`
      : 'Renewal created (check Automations for delivery).';
    emit('sent', res.data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to send renewal';
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.cr-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.cr-modal {
  width: min(920px, 100%);
  max-height: min(92vh, 900px);
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.25);
  padding: 18px 18px 14px;
}
.cr-modal__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.cr-modal__head h3 { margin: 0 0 4px; font-size: 1.15rem; }
.cr-modal__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 16px;
}
.cr-modal__left,
.cr-modal__right {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.cr-preview-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
}
.cr-preview-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.cr-email__meta {
  font-size: 12px;
  color: #334155;
  margin-bottom: 4px;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 6px;
}
.cr-email__meta span {
  color: #64748b;
  font-weight: 600;
}
.cr-email__body {
  margin: 8px 0 0;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow: auto;
  color: #0f172a;
}
.cr-iface {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}
.cr-iface__brand {
  font-weight: 700;
  color: #0f766e;
  font-size: 14px;
}
.cr-iface__sub {
  margin: 2px 0 8px;
  font-size: 12px;
  color: #64748b;
}
.cr-iface__steps {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #0f172a;
}
.cr-iface__empty {
  list-style: none;
  margin-left: -18px;
  color: #64748b;
}
.cr-opt {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
}
.cr-rec {
  margin-left: 6px;
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: #9a3412;
  background: #ffedd5;
  padding: 2px 6px;
  border-radius: 999px;
}
.cr-packet-mode {
  display: flex;
  gap: 16px;
  margin-left: 26px;
  font-size: 13px;
}
.cr-roi-status { font-size: 13px; margin-bottom: 4px; }
.cr-roi-status--active { color: #047857; }
.cr-roi-status--expired { color: #b91c1c; }
.cr-roi-status--none { color: #64748b; }
.cr-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}
.error { color: #b91c1c; font-size: 13px; margin: 0; }
.success { color: #047857; font-size: 13px; margin: 0; }
.hint { color: #64748b; font-size: 12px; margin: 0; }
@media (max-width: 800px) {
  .cr-modal__layout { grid-template-columns: 1fr; }
}
</style>
