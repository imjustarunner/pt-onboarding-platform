<template>
  <div v-if="open" class="cr-modal-backdrop" @click.self="close">
    <div class="cr-modal" role="dialog" aria-label="Client Renewal">
      <header class="cr-modal__head">
        <div>
          <h3>Client Renewal</h3>
          <p class="hint">
            Push a privacy-safe renewal request to the guardian. Recommended options are suggested from ROI / Disclosure status.
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="close">Close</button>
      </header>

      <div v-if="loadingMeta" class="hint">Loading recommendations…</div>
      <div v-else class="cr-modal__body">
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
      </div>

      <footer class="cr-modal__foot">
        <button type="button" class="btn btn-secondary" :disabled="sending" @click="close">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sending || !anyOption"
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
  disclosureStatus: { type: String, default: '' }
});

const emit = defineEmits(['close', 'sent']);

const loadingMeta = ref(false);
const sending = ref(false);
const error = ref('');
const success = ref('');

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
  const roiRec = roiStatus.value === 'expired' || roiStatus.value === 'none';
  const disc = String(props.disclosureStatus || '').toLowerCase();
  const discRec = !disc || disc === 'missing' || disc === 're_sign_needed' || disc === 'expired';
  form.recommendSmartRoi = roiRec;
  form.recommendSmartDisclosure = discRec;
  form.smartRoi = roiRec;
  form.smartDisclosure = discRec;
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    error.value = '';
    success.value = '';
    applyRecommendations();
  }
);

function close() {
  emit('close');
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
      agencyId: props.agencyId ? Number(props.agencyId) : undefined,
      verifyContact: form.verifyContact,
      smartRoi: form.smartRoi,
      smartDisclosure: form.smartDisclosure,
      fullPacket: form.fullPacket,
      packetMode: form.fullPacket ? form.packetMode : null,
      send: true,
      sendNow: true
    });
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
  width: min(560px, 100%);
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
.cr-modal__body { display: flex; flex-direction: column; gap: 10px; }
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
</style>
