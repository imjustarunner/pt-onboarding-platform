<template>
  <div class="cdg">
    <div class="cdg-head">
      <h4 class="cdg-title">Signed documents</h4>
      <p class="hint">
        Smart ROI, Smart Disclosure, HIPAA and other master-packet sections, the branded full packet, clinical summary, and intake answers.
      </p>
    </div>

    <div v-if="openError" class="error">{{ openError }}</div>
    <div v-if="openFallbackUrl" class="cdg-fallback">
      <a :href="openFallbackUrl" target="_blank" rel="noopener">Open document</a>
    </div>

    <div v-if="loading" class="muted">Loading documents…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="cdg-grid">
      <article
        v-for="card in cards"
        :key="card.id"
        class="cdg-card"
        :class="{
          'cdg-card--missing': card.missing,
          'cdg-card--packet': card.kind === 'packet' && !card.missing
        }"
      >
        <div class="cdg-card__kicker">{{ card.kindLabel || card.kind }}</div>
        <strong class="cdg-card__title">{{ card.title }}</strong>
        <div class="cdg-card__meta muted tiny">
          <span v-if="card.signedAt">Signed {{ formatWhen(card.signedAt) }}</span>
          <span v-else-if="card.uploadedAt">Uploaded {{ formatWhen(card.uploadedAt) }}</span>
          <span v-else-if="card.missing">Not on file</span>
          <span v-if="card.hasSignature" class="cdg-sig">Signature on file</span>
        </div>
        <div class="cdg-card__actions">
          <button
            v-if="card.viewKey"
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="opening"
            @click="openViewKey(card.viewKey)"
          >
            View
          </button>
        </div>
      </article>
    </div>

    <div class="cdg-copy-blocks">
      <h4 class="cdg-title">Copy-ready text</h4>
      <p class="hint">
        Demographics stay on the chart (never sent to the note writer). Clinical blocks are de-identified.
      </p>
      <div v-if="copyLoading" class="muted">Loading copy blocks…</div>
      <div v-else-if="copyError" class="error">{{ copyError }}</div>
      <template v-else>
        <div v-for="block in copyBlocks" :key="block.key" class="cdg-block">
          <div class="cdg-block__head">
            <strong>{{ block.label }}</strong>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="!block.text" @click="copy(block.text, block.label)">
              Copy
            </button>
          </div>
          <p v-if="block.note" class="hint" style="margin: 4px 0 8px;">{{ block.note }}</p>
          <pre class="cdg-block__body">{{ block.text || '—' }}</pre>
        </div>
      </template>
    </div>

    <div
      v-if="selectedPacket"
      class="modal-overlay"
      @click.self="selectedPacket = null"
    >
      <div class="modal signed-packet-modal" @click.stop>
        <div class="modal-header">
          <strong>
            Intake packet
            <span v-if="selectedPacket.packet_version">— V{{ selectedPacket.packet_version }}</span>
          </strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="selectedPacket = null">Close</button>
        </div>
        <div class="modal-body">
          <p class="hint">
            Signed {{ formatWhen(selectedPacket.signed_at) }}
            <span v-if="selectedPacket.master_form_version">
              · Digital form V{{ selectedPacket.master_form_version }}
            </span>
          </p>
          <ul class="signed-packet-contents">
            <li v-for="(c, idx) in (selectedPacket.contents || [])" :key="idx">
              <strong>{{ c.label || c.type }}</strong>
              <span class="muted"> — {{ c.type }}</span>
              <button
                v-if="c.viewKey || c.phiDocumentId"
                class="btn btn-secondary btn-sm"
                type="button"
                style="margin-left:8px;"
                @click="openViewKey(c.viewKey || `phi-${c.phiDocumentId}`)"
              >
                Open
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true }
});

const loading = ref(false);
const opening = ref(false);
const error = ref('');
const openError = ref('');
const openFallbackUrl = ref('');
const copyLoading = ref(false);
const copyError = ref('');
const copyPayload = ref(null);
const artifacts = ref([]);
const signedPackets = ref([]);
const selectedPacket = ref(null);

const cards = computed(() => artifacts.value || []);

const copyBlocks = computed(() => {
  const p = copyPayload.value || {};
  return [
    {
      key: 'demographics',
      label: 'Demographics',
      note: 'Chart only — never sent to the note writer.',
      text: p.demographics || ''
    },
    {
      key: 'clinical',
      label: 'Clinical questionnaire (de-identified)',
      note: 'Answers without names, DOB, address, phones, emails, or member IDs.',
      text: p.clinicalDeidentified || ''
    },
    {
      key: 'narrative',
      label: 'Full intake narrative (scrubbed)',
      note: 'Ready to paste into the intake note writer after scrub.',
      text: p.intakeNarrative || ''
    }
  ];
});

function formatWhen(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleString();
}

async function loadArtifacts() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/phi-documents/clients/${id}/chart-artifacts`, { skipGlobalLoading: true });
    artifacts.value = Array.isArray(resp.data?.artifacts) ? resp.data.artifacts : [];
    signedPackets.value = Array.isArray(resp.data?.packets) ? resp.data.packets : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load signed documents';
    artifacts.value = [];
    signedPackets.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadCopyBlocks() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  copyLoading.value = true;
  copyError.value = '';
  try {
    const r = await api.get(`/clients/${id}/records-copy-blocks`, { skipGlobalLoading: true });
    copyPayload.value = r.data || {};
  } catch (e) {
    copyError.value = e.response?.data?.error?.message || 'Failed to load copy-ready text';
    copyPayload.value = null;
  } finally {
    copyLoading.value = false;
  }
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
  } catch {
    openError.value = `Could not copy ${label || 'text'}`;
  }
}

function closePopupQuietly(popup) {
  if (!popup || popup.closed) return;
  try { popup.close(); } catch { /* ignore */ }
}

function writePopupLoading(popup) {
  if (!popup || popup.closed) return;
  try {
    popup.document.open();
    popup.document.write(
      '<!doctype html><title>Loading document…</title>' +
      '<body style="font-family:system-ui,sans-serif;padding:24px;color:#334155">' +
      '<p>Loading document…</p></body>'
    );
    popup.document.close();
  } catch {
    // ignore
  }
}

function navigateToUrl(url, popup) {
  if (!url) return false;
  if (popup && !popup.closed) {
    try {
      try { popup.opener = null; } catch { /* ignore */ }
      popup.location.href = url;
      return true;
    } catch {
      // fall through
    }
  }
  const opened = window.open(url, '_blank');
  if (opened) {
    try { opened.opener = null; } catch { /* ignore */ }
    return true;
  }
  return false;
}

async function openPacketById(packetId) {
  const existing = (signedPackets.value || []).find((p) => Number(p.id) === Number(packetId));
  try {
    const resp = await api.get(`/phi-documents/signed-school-packets/${packetId}`, { skipGlobalLoading: true });
    selectedPacket.value = resp.data?.packet || existing || null;
  } catch {
    selectedPacket.value = existing || null;
  }
}

async function openViewKey(viewKey) {
  const key = String(viewKey || '').trim();
  const clientId = Number(props.clientId || 0);
  if (!key || !clientId) return;
  openError.value = '';
  openFallbackUrl.value = '';

  if (key.startsWith('packet-')) {
    await openPacketById(Number(key.slice(7)));
    return;
  }

  const popup = window.open('about:blank', '_blank');
  if (popup) writePopupLoading(popup);

  opening.value = true;
  try {
    const resp = await api.get(
      `/phi-documents/clients/${clientId}/chart-artifacts/${encodeURIComponent(key)}/view`,
      {
        responseType: 'blob',
        skipGlobalLoading: true,
        params: { theme: document.documentElement.getAttribute('data-theme') || '' }
      }
    );
    const contentType = String(resp.headers?.['content-type'] || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const raw = await resp.data.text();
      const data = JSON.parse(raw);
      if (data?.packet) {
        closePopupQuietly(popup);
        selectedPacket.value = data.packet;
        return;
      }
      const url = data?.url;
      if (!url) throw new Error('Could not get a download link for this document.');
      const opened = navigateToUrl(url, popup);
      if (!opened) {
        closePopupQuietly(popup);
        openFallbackUrl.value = url;
        openError.value = 'Your browser blocked a new tab. Use the link below, or allow pop-ups for this site.';
      }
      return;
    }
    const blob = resp.data instanceof Blob
      ? resp.data
      : new Blob([resp.data], { type: contentType || 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(blob);
    const opened = navigateToUrl(blobUrl, popup);
    if (!opened) {
      closePopupQuietly(popup);
      openFallbackUrl.value = blobUrl;
      openError.value = 'Your browser blocked the document tab. Use the link below to open it.';
    } else {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
    }
  } catch (e) {
    closePopupQuietly(popup);
    openError.value = e.response?.data?.error?.message || e.message || 'Failed to open document';
  } finally {
    opening.value = false;
  }
}

function reload() {
  loadArtifacts();
  loadCopyBlocks();
}

defineExpose({ openViewKey, reload });

onMounted(reload);
watch(() => props.clientId, reload);
</script>

<style scoped>
.cdg { margin-top: 12px; }
.cdg-head { margin-bottom: 10px; }
.cdg-title { margin: 0 0 4px; font-size: 14px; font-weight: 750; color: var(--text-primary); }
.cdg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.cdg-card {
  border: 1px solid var(--border);
  background: var(--bg-card, var(--bg));
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cdg-card--missing { opacity: 0.72; }
.cdg-card--packet {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, var(--bg-card, var(--bg)));
}
.cdg-card__kicker {
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}
.cdg-card__title { font-size: 13px; color: var(--text-primary); }
.cdg-card__meta { display: flex; flex-wrap: wrap; gap: 8px; }
.cdg-sig { color: var(--primary); font-weight: 700; }
.cdg-card__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 6px; }
.cdg-copy-blocks { margin-top: 8px; }
.cdg-block {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card, var(--bg));
  padding: 10px 12px;
  margin-bottom: 10px;
}
.cdg-block__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.cdg-block__body {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 12px;
  max-height: 180px;
  overflow: auto;
  color: var(--text-primary);
}
.cdg-fallback { margin-bottom: 10px; }
.error { color: #b91c1c; margin-bottom: 8px; }
.modal-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, #0f172a 45%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 16px;
}
.signed-packet-modal {
  width: min(560px, 100%);
  max-height: 80vh;
  overflow: auto;
  background: var(--bg-card, var(--bg));
  border-radius: 12px;
  padding: 16px;
}
.modal-header { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.signed-packet-contents { margin: 12px 0 0; padding-left: 18px; }
</style>
