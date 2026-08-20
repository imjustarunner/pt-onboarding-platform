<template>
  <div class="ob-docs-panel">
    <p class="ob-area-hint">
      Paper-packet signature forms for Client Readiness. One signature covers the consent group below; ROI is separate.
      Disclosure is handled in Documents → Disclosure (Smart Disclosure).
    </p>

    <div class="ob-sig-card" :class="{ done: packetSignature?.done }">
      <div class="ob-sig-head">
        <div>
          <div class="ob-sig-title">Packet signature</div>
          <div class="ob-sig-sub muted">
            One signature covers insurance acknowledgement, consents, HIPAA, and the other bundled forms — not ROI or disclosure.
          </div>
        </div>
        <span class="ob-sig-pill" :class="packetSignature?.done ? 'ok' : 'open'">
          {{ packetSignature?.done ? 'Received' : 'Needed' }}
        </span>
      </div>
      <ul class="ob-sig-list">
        <li
          v-for="doc in signatureDocs"
          :key="doc.key"
          class="ob-sig-list-item"
          :class="{ done: doc.done }"
        >
          <span class="ob-sig-list-dot" />
          {{ doc.label }}
        </li>
      </ul>
      <template v-if="canEdit && !packetSignature?.done">
        <div class="ob-version-row">
          <label class="ob-version-label" for="ob-packet-version">
            Version on packet
            <span class="muted" style="font-weight:400; font-size:11px;">(see footer of printed form)</span>
          </label>
          <input
            id="ob-packet-version"
            v-model="pendingVersionLabel"
            type="text"
            class="ob-version-input"
            placeholder="e.g. 1.02"
            maxlength="16"
            :disabled="savingSignature"
          />
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="savingSignature"
          @click="markPacketSignature"
        >
          {{ savingSignature ? 'Saving…' : 'Mark signature packet received' }}
        </button>
      </template>
    </div>

    <div class="ob-separate-docs">
      <div class="ob-doc-row" :class="roiDoc?.done ? 'status-present' : 'status-missing'">
        <div class="ob-doc-label-block">
          <div class="ob-sig-title">Release of Information (ROI)</div>
          <div class="ob-sig-sub muted">Separate signed form — not part of the packet signature.</div>
        </div>
        <select
          v-if="canEdit"
          class="ob-doc-select"
          :value="roiDoc?.status || 'missing'"
          :disabled="!!savingKey"
          @change="onRoiStatus($event.target.value)"
        >
          <option value="missing">Missing</option>
          <option value="present">Received</option>
          <option value="na">N/A</option>
        </select>
        <span v-else class="ob-doc-pill">{{ statusLabel(roiDoc?.status) }}</span>
      </div>

      <ClientOnboardingRoiExpiryEditor
        v-if="showRoiExpiryEditor"
        :client-id="clientId"
        :roi-expires-at="localRoiExpiresAt"
        :readonly="!canEdit"
        @saved="onRoiExpirySaved"
      />
      <p v-if="showRoiExpiryEditor && !localRoiExpiresAt && canEdit" class="ob-roi-expiry-hint muted small">
        Choose the effective date and term (36 months is the paper-packet default), then save. ROI received status saves automatically once the expiration is set.
      </p>

      <!-- ROI access-denial review: admin must review every person on the ROI and
           explicitly deny portal/record access to anyone who should not have it. -->
      <div v-if="showRoiExpiryEditor" class="ob-roi-access-review">
        <div class="ob-roi-access-head">
          <span class="ob-roi-access-badge">Action required</span>
          <strong>Review ROI access</strong>
        </div>
        <p class="muted small">
          Open the signed ROI, review each person listed, and for anyone who should <em>not</em>
          have access to this client's records, locate them under
          <strong>Client → Release of Information</strong> and set their access to <em>Denied</em>.
          This step must be completed before services begin.
        </p>
        <div class="ob-roi-access-check">
          <input
            id="ob-roi-access-done"
            v-model="roiAccessReviewed"
            type="checkbox"
            :disabled="!canEdit"
          />
          <label for="ob-roi-access-done">
            I have reviewed all ROI persons and denied access where appropriate.
          </label>
        </div>
      </div>
    </div>

    <p v-if="docError" class="error small">{{ docError }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { normalizeOnboardingDocItems } from '../../utils/paperPacketDocumentCatalog.js';
import ClientOnboardingRoiExpiryEditor from './ClientOnboardingRoiExpiryEditor.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  checklist: { type: Object, required: true },
  canEdit: { type: Boolean, default: true }
});
const emit = defineEmits(['updated']);

const localItems = ref([]);
const localRoiExpiresAt = ref(null);
const savingSignature = ref(false);
const pendingVersionLabel = ref('');
const roiAccessReviewed = ref(false);
const savingKey = ref('');
const docError = ref('');

const packetSignature = computed(() => props.checklist?.packet_signature || null);
const signatureDocs = computed(() =>
  (localItems.value || []).filter((d) => d.group === 'packet_signature')
);
const roiDoc = computed(() => (localItems.value || []).find((d) => d.key === 'roi') || null);
const showRoiExpiryEditor = computed(() => roiDoc.value?.status === 'present');

function syncFromChecklist() {
  localItems.value = normalizeOnboardingDocItems(
    { items: (props.checklist?.document_items || []).map((d) => ({ key: d.key, status: d.status })) }
  );
  localRoiExpiresAt.value = props.checklist?.client?.roi_expires_at || null;
  // Restore ROI access-review acknowledgment from localStorage (no dedicated server field yet).
  const key = `roi_access_reviewed_${props.clientId}`;
  roiAccessReviewed.value = localStorage.getItem(key) === '1';
}

function statusLabel(status) {
  if (status === 'present') return 'Received';
  if (status === 'na') return 'N/A';
  return 'Missing';
}

function mergeChecklist(data) {
  emit('updated', { checklist: data });
}

function patchLocal(key, status) {
  localItems.value = localItems.value.map((d) => (
    d.key === key ? { ...d, status, done: status === 'present' || status === 'na' } : d
  ));
}

async function putItems(items, { roiExpiresAt = undefined } = {}) {
  const id = Number(props.clientId || 0);
  const body = { items };
  if (roiExpiresAt !== undefined) body.roi_expires_at = roiExpiresAt;
  const { data } = await api.put(`/clients/${id}/onboarding-docs`, body, { skipGlobalLoading: true });
  return data;
}

function onRoiExpirySaved(payload) {
  localRoiExpiresAt.value = payload?.client?.roi_expires_at || localRoiExpiresAt.value;
  mergeChecklist(payload);
  const roi = localItems.value.find((d) => d.key === 'roi');
  const serverDone = payload?.document_items?.find((d) => d.key === 'roi')?.done;
  if (roi?.status === 'present' && !serverDone) {
    void persistRoiReceived();
  }
}

async function persistRoiReceived() {
  const id = Number(props.clientId || 0);
  if (!id || savingKey.value) return;
  const expiry = localRoiExpiresAt.value || props.checklist?.client?.roi_expires_at || null;
  if (!expiry) return;
  savingKey.value = 'roi';
  docError.value = '';
  try {
    const items = localItems.value.map((d) => ({ key: d.key, status: d.status }));
    const data = await putItems(items, { roiExpiresAt: expiry });
    mergeChecklist(data);
    syncFromChecklist();
  } catch (e) {
    docError.value = e.response?.data?.error?.message || 'Failed to save ROI received status';
  } finally {
    savingKey.value = '';
  }
}

async function markPacketSignature() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  savingSignature.value = true;
  docError.value = '';
  const prev = [...localItems.value];
  localItems.value = localItems.value.map((d) => (
    d.group === 'packet_signature' ? { ...d, status: 'present', done: true } : d
  ));
  try {
    const data = await api.post(
      `/clients/${id}/onboarding/mark-packet-signature`,
      { packetVersionLabel: pendingVersionLabel.value.trim() || undefined },
      { skipGlobalLoading: true }
    );
    mergeChecklist(data);
    syncFromChecklist();
  } catch (e) {
    localItems.value = prev;
    docError.value = e.response?.data?.error?.message || 'Failed to mark packet signature received';
  } finally {
    savingSignature.value = false;
  }
}

async function onRoiStatus(status) {
  const id = Number(props.clientId || 0);
  if (!id) return;
  savingKey.value = 'roi';
  docError.value = '';
  const prev = [...localItems.value];
  patchLocal('roi', status);
  if (status === 'present') {
    const expiry = localRoiExpiresAt.value || props.checklist?.client?.roi_expires_at || null;
    if (!expiry) {
      savingKey.value = '';
      return;
    }
  }
  try {
    const items = localItems.value.map((d) => ({ key: d.key, status: d.status }));
    const data = await putItems(items, {
      roiExpiresAt: status === 'present'
        ? (localRoiExpiresAt.value || props.checklist?.client?.roi_expires_at)
        : undefined
    });
    mergeChecklist(data);
    syncFromChecklist();
  } catch (e) {
    localItems.value = prev;
    docError.value = e.response?.data?.error?.message || 'Failed to update ROI status';
  } finally {
    savingKey.value = '';
  }
}

watch(() => props.checklist?.document_items, syncFromChecklist, { immediate: true, deep: true });
watch(roiAccessReviewed, (val) => {
  const key = `roi_access_reviewed_${props.clientId}`;
  if (val) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
});
</script>

<style scoped>
.ob-docs-panel { margin-top: 4px; }
.ob-area-hint {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.4;
}
.ob-sig-card {
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.ob-sig-card.done {
  border-color: #86efac;
  background: #f0fdf4;
}
.ob-version-row {
  margin: 10px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ob-version-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.ob-version-input {
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 13px;
  width: 120px;
  background: #fff;
}
.ob-sig-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ob-sig-title { font-weight: 800; font-size: 0.9rem; color: #0f172a; }
.ob-sig-sub { font-size: 0.78rem; margin-top: 3px; line-height: 1.35; }
.ob-sig-pill {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.ob-sig-pill.open { background: #fee2e2; color: #b91c1c; }
.ob-sig-pill.ok { background: #dcfce7; color: #166534; }
.ob-sig-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: grid;
  gap: 6px;
}
.ob-sig-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  color: #475569;
}
.ob-sig-list-item.done { color: #0f172a; font-weight: 600; }
.ob-sig-list-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
  flex-shrink: 0;
}
.ob-sig-list-item.done .ob-sig-list-dot { background: #16a34a; }
.ob-separate-docs { display: flex; flex-direction: column; gap: 8px; }
.ob-doc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.ob-doc-row.status-present { border-color: #86efac; background: #f0fdf4; }
.ob-doc-row.status-missing { border-color: #fecaca; background: #fef2f2; }
.ob-doc-label-block { flex: 1; min-width: 0; }
.ob-doc-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.82rem;
  font-weight: 600;
  background: #fff;
  cursor: pointer;
  min-width: 110px;
}
.ob-doc-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  background: #e2e8f0;
}
.error { color: #b91c1c; }
.muted { color: #64748b; }
.small { font-size: 0.82rem; }

.ob-roi-access-review {
  margin-top: 12px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 12px 14px;
}
.ob-roi-access-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ob-roi-access-badge {
  background: #f59e0b;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 6px;
  padding: 2px 7px;
}
.ob-roi-access-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 500;
}
</style>
