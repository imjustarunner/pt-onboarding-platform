<template>
  <section v-if="noteId" class="ts-doc-panel">
    <header class="ts-doc-head">
      <div>
        <h3 class="ts-doc-title">Treatment Summary document</h3>
        <p class="ts-doc-sub">
          Printable packet chrome (footer mark + page numbers; no cover, no version). Provider and clinical
          supervisor both sign. Download PDF, print, or upload a signed scan for digital sharing.
        </p>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="success" class="success">{{ success }}</p>

    <div class="ts-doc-status">
      <span class="ts-pill" :class="providerSigned ? 'ok' : 'muted'">
        Provider {{ providerSigned ? 'signed' : 'unsigned' }}
      </span>
      <span class="ts-pill" :class="supervisorSigned ? 'ok' : 'muted'">
        Supervisor {{ supervisorSigned ? 'signed' : 'pending' }}
      </span>
    </div>

    <div class="ts-doc-actions">
      <button type="button" class="ts-btn" :disabled="busy === 'pdf'" @click="downloadPdf">
        {{ busy === 'pdf' ? 'Preparing…' : 'Download PDF' }}
      </button>
      <button type="button" class="ts-btn" :disabled="busy === 'print'" @click="printPdf">
        {{ busy === 'print' ? 'Preparing…' : 'Print' }}
      </button>
      <button
        v-if="!providerSigned"
        type="button"
        class="ts-btn ts-btn-primary"
        :disabled="busy === 'sign'"
        @click="signProvider"
      >
        {{ busy === 'sign' ? 'Signing…' : 'Provider sign' }}
      </button>
      <button
        v-else-if="!supervisorSigned"
        type="button"
        class="ts-btn ts-btn-primary"
        :disabled="busy === 'cosign'"
        @click="cosignSupervisor"
      >
        {{ busy === 'cosign' ? 'Cosigning…' : 'Supervisor cosign' }}
      </button>
    </div>

    <div class="ts-doc-upload">
      <h4>Upload signed scan</h4>
      <p class="muted tiny">
        Print the PDF, obtain wet signatures, scan, upload to the client’s PHI documents, then link the
        document id here for the chart record.
      </p>
      <div class="ts-upload-row">
        <input v-model="phiDocumentId" type="number" min="1" class="ts-input" placeholder="PHI document id" />
        <input v-model="signedByName" type="text" class="ts-input" maxlength="255" placeholder="Signed by (optional)" />
        <button type="button" class="ts-btn" :disabled="busy === 'upload' || !phiDocumentId" @click="linkPrintUpload">
          {{ busy === 'upload' ? 'Linking…' : 'Link upload' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  noteId: { type: [Number, String], default: null },
  agencyId: { type: [Number, String], required: true },
  providerSignedAt: { type: String, default: null },
  supervisorSignedAt: { type: String, default: null }
});

const emit = defineEmits(['updated']);

const error = ref('');
const success = ref('');
const busy = ref('');
const phiDocumentId = ref('');
const signedByName = ref('');
const localProviderSigned = ref(null);
const localSupervisorSigned = ref(null);

const providerSigned = computed(
  () => !!(localProviderSigned.value || props.providerSignedAt)
);
const supervisorSigned = computed(
  () => !!(localSupervisorSigned.value || props.supervisorSignedAt)
);

watch(
  () => props.noteId,
  () => {
    localProviderSigned.value = null;
    localSupervisorSigned.value = null;
    error.value = '';
    success.value = '';
  }
);

async function fetchPdfBlob() {
  const res = await api.get(`/medical-billing/notes/${props.noteId}/treatment-summary-pdf`, {
    params: { agencyId: props.agencyId },
    responseType: 'blob',
    skipGlobalLoading: true
  });
  return res.data;
}

async function downloadPdf() {
  error.value = '';
  success.value = '';
  busy.value = 'pdf';
  try {
    const blob = await fetchPdfBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `treatment-summary-${props.noteId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    success.value = 'PDF downloaded.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download PDF';
  } finally {
    busy.value = '';
  }
}

async function printPdf() {
  error.value = '';
  success.value = '';
  busy.value = 'print';
  try {
    const blob = await fetchPdfBlob();
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) {
      w.addEventListener('load', () => {
        try { w.print(); } catch { /* ignore */ }
      });
    }
    success.value = 'Print dialog opened.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to print PDF';
  } finally {
    busy.value = '';
  }
}

async function signProvider() {
  error.value = '';
  success.value = '';
  busy.value = 'sign';
  try {
    await api.post(
      `/medical-billing/notes/${props.noteId}/sign`,
      { agencyId: Number(props.agencyId), accurateAndComplete: true, medicalNecessityAttested: false },
      { skipGlobalLoading: true }
    );
    localProviderSigned.value = new Date().toISOString();
    success.value = 'Provider signature applied. Clinical supervisor can cosign next.';
    emit('updated');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Provider sign failed';
  } finally {
    busy.value = '';
  }
}

async function cosignSupervisor() {
  error.value = '';
  success.value = '';
  busy.value = 'cosign';
  try {
    await api.post(
      `/medical-billing/notes/${props.noteId}/cosign`,
      { agencyId: Number(props.agencyId) },
      { skipGlobalLoading: true }
    );
    localSupervisorSigned.value = new Date().toISOString();
    success.value = 'Clinical supervisor cosign applied.';
    emit('updated');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Supervisor cosign failed';
  } finally {
    busy.value = '';
  }
}

async function linkPrintUpload() {
  error.value = '';
  success.value = '';
  busy.value = 'upload';
  try {
    await api.post(
      `/medical-billing/notes/${props.noteId}/treatment-summary/print-upload`,
      {
        agencyId: Number(props.agencyId),
        phiDocumentId: Number(phiDocumentId.value),
        signedByName: signedByName.value || null
      },
      { skipGlobalLoading: true }
    );
    success.value = 'Signed scan linked for digital sharing on the client record.';
    emit('updated');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to link upload';
  } finally {
    busy.value = '';
  }
}
</script>

<style scoped>
.ts-doc-panel {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.ts-doc-title {
  margin: 0;
  font-size: 1rem;
}
.ts-doc-sub {
  margin: 6px 0 0;
  font-size: 0.85rem;
  color: #64748b;
}
.ts-doc-status {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.ts-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #64748b;
}
.ts-pill.ok {
  border-color: #86efac;
  background: #f0fdf4;
  color: #166534;
}
.ts-doc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ts-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.ts-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ts-btn-primary {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}
.ts-doc-upload {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}
.ts-doc-upload h4 {
  margin: 0 0 4px;
  font-size: 0.9rem;
}
.ts-upload-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.ts-input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.85rem;
  min-width: 140px;
}
.error { color: #b91c1c; font-size: 0.85rem; }
.success { color: #166534; font-size: 0.85rem; }
.muted { color: #64748b; }
.tiny { font-size: 0.8rem; }
</style>
