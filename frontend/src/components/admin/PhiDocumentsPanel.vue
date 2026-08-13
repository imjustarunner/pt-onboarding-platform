<template>
  <div class="panel" :class="{ 'panel--embedded': embedded }">
    <div v-if="!embedded" class="header">
      <h3>{{ ownOnly ? 'Your documents' : 'Documentation (PHI)' }}</h3>
      <p class="hint">
        {{ ownOnly
          ? (roleNorm === 'school_staff'
            ? 'Upload and view files you added. Referral documents stay hidden at this ROI level — including a printed packet if your access is ROI (Speak). Opening a file is audited.'
            : 'Upload and view files you added for this client. Referral documents stay hidden. Opening a file is audited.')
          : 'Opening documentation requires confirmation and will be audited.' }}
      </p>
    </div>

    <div v-if="!ownOnly && signedSchoolPackets.length" class="signed-packet-section">
      <h4 class="embedded-section-title">School referral packets (signed)</h4>
      <p class="hint">Versioned bundles from digital school referral intake — click to see what was signed.</p>
      <div class="signed-packet-list">
        <button
          v-for="p in signedSchoolPackets"
          :key="p.id"
          type="button"
          class="signed-packet-card"
          @click="openSignedPacket(p)"
        >
          <div class="signed-packet-title">
            School referral packet — V{{ p.packet_version || '—' }}
          </div>
          <div class="signed-packet-meta">
            Signed {{ formatDateTime(p.signed_at) }}
            <span v-if="p.master_form_version"> · Form V{{ p.master_form_version }}</span>
            <span v-if="p.locale"> · {{ String(p.locale).toUpperCase() }}</span>
          </div>
        </button>
      </div>
    </div>

    <div
      v-if="selectedSignedPacket"
      class="modal-overlay"
      @click.self="selectedSignedPacket = null"
    >
      <div class="modal signed-packet-modal" @click.stop>
        <div class="modal-header">
          <strong>
            School referral packet — V{{ selectedSignedPacket.packet_version || '—' }}
          </strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="selectedSignedPacket = null">Close</button>
        </div>
        <div class="modal-body">
          <p class="hint">
            Signed {{ formatDateTime(selectedSignedPacket.signed_at) }}
            <span v-if="selectedSignedPacket.master_form_version">
              · Digital form V{{ selectedSignedPacket.master_form_version }}
            </span>
          </p>
          <ul class="signed-packet-contents">
            <li v-for="(c, idx) in (selectedSignedPacket.contents || [])" :key="idx">
              <strong>{{ c.label || c.type }}</strong>
              <span class="muted"> — {{ c.type }}</span>
              <button
                v-if="c.phiDocumentId"
                class="btn btn-secondary btn-sm"
                type="button"
                style="margin-left:8px;"
                @click="openPhiFromBundle(c.phiDocumentId)"
              >
                Open
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="showFilesSection">
        <div v-if="embedded" class="embedded-section-head">
          <h4 class="embedded-section-title">{{ ownOnly ? 'Your uploads' : 'Files (optional)' }}</h4>
          <p class="hint">
            {{ ownOnly
              ? 'Upload a PDF or image for this client. Only files you added are listed here.'
              : 'Upload a PDF or image only when you need a stored copy.' }}
          </p>
        </div>

        <div v-if="canUpload" class="attach-panel">
          <div class="attach-panel-head">
            <div>
              <div class="attach-title">{{ ownOnly ? 'Upload a file' : 'Attach to client' }}</div>
              <div class="attach-subtitle">{{ attachSubtitle }}</div>
            </div>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="uploading" @click="fileInput?.click()">
            {{ uploading ? 'Uploading…' : 'Choose files' }}
          </button>
        </div>

        <div class="upload-fields">
          <label class="upload-label">
            Title
            <input v-model="uploadTitle" class="upload-input" type="text" placeholder="e.g., Intake packet" />
          </label>
          <label class="upload-label">
            Document type
            <input
              v-model="uploadType"
              type="text"
              class="upload-input"
              list="phi-doc-type-list"
              placeholder="Select or type document type…"
              autocomplete="off"
            />
            <datalist id="phi-doc-type-list">
              <option v-for="t in uploadTypeOptions" :key="t" :value="t" />
            </datalist>
          </label>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/jpg"
          multiple
          style="display:none;"
          @change="onFileSelected"
        />

        <div
          class="drop-zone"
          :class="{ 'drop-zone-active': isDragActive }"
          @dragenter.prevent="onDragEnter"
          @dragover.prevent="onDragOver"
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDropFiles"
        >
          <div class="drop-zone-title">
            {{ uploading ? 'Uploading files…' : 'Drop files here to attach them to this client' }}
          </div>
          <div class="drop-zone-subtitle">
            PDF, PNG, and JPG only. You can drop multiple files at once.
          </div>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="docs.length === 0" class="empty">No packets found.</div>

      <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Uploaded</th>
            <th>Title</th>
            <th>Type</th>
            <th>Filename</th>
            <th>Status</th>
            <th style="width: 220px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id" :data-document-id="d.id" :class="{ 'doc-highlight': highlightDocumentId && Number(d.id) === Number(highlightDocumentId) }">
            <td>{{ formatDateTime(d.uploaded_at) }}</td>
            <td>
              <div class="doc-title">{{ d.document_title || d.original_name || d.storage_path }}</div>
              <div v-if="exportInfoByDocId[d.id]" class="doc-meta">
                Exported: {{ exportInfoByDocId[d.id].at }}
                <span v-if="exportInfoByDocId[d.id].by">by {{ exportInfoByDocId[d.id].by }}</span>
              </div>
            </td>
            <td>{{ d.document_type || d.mime_type || '-' }}</td>
            <td class="doc-filename">{{ d.original_name || d.storage_path }}</td>
            <td>
              <span v-if="d.removed_at" class="pill pill-removed">Removed</span>
              <span v-else-if="d.scan_status && d.scan_status !== 'clean'" class="pill pill-pending">Scanning</span>
              <span v-else class="pill pill-ready">Ready</span>
            </td>
            <td class="actions">
              <button class="btn btn-primary btn-sm" :disabled="!!d.removed_at" @click="confirmOpen(d)">View</button>
              <button
                v-if="canManageLifecycle"
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="!!d.removed_at"
                @click="markExported(d)"
              >
                Export
              </button>
              <button
                v-if="canManageLifecycle"
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="!!d.removed_at"
                @click="removeDoc(d)"
              >
                Remove
              </button>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="ocrSubmitting || !canRequestOcr(d)"
                :title="ocrDisabledReason(d)"
                @click="requestOcr(d)"
              >
                Extract Text
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    </div>

    <div v-if="showIntakeSection" class="intake-panel">
      <div v-if="embedded" class="embedded-section-head">
        <h4 class="embedded-section-title">Intake responses</h4>
      </div>
      <div class="intake-header">
        <h4>Intake Responses</h4>
        <div v-if="intakeLoading" class="muted">Loading…</div>
      </div>
      <div v-if="intakeError" class="error">{{ intakeError }}</div>
      <div v-else-if="intakeSubmissions.length === 0" class="empty">No intake responses found for this client yet.</div>
      <div v-else class="intake-list">
        <details v-for="entry in intakeSubmissions" :key="entry.submissionId" class="intake-item">
          <summary>
            <span><strong>{{ formatDateTime(entry.submittedAt || entry.createdAt) }}</strong></span>
            <span class="muted">Submission #{{ entry.submissionId }}</span>
            <span class="muted">{{ formatStatusLabel(entry.status) }}</span>
          </summary>
          <div class="intake-meta">
            <div><strong>Form:</strong> {{ entry.intakeLink?.title || 'Untitled intake form' }}</div>
            <div><strong>Type:</strong> {{ entry.intakeLink?.formType || '-' }}</div>
            <div><strong>Signer:</strong> {{ entry.signerName || '-' }} <span v-if="entry.signerEmail">({{ entry.signerEmail }})</span></div>
          </div>
          <div v-if="entry.derivedDocuments?.intakeResponsesText" class="intake-json-wrap">
            <div class="intake-json-header">
              <div class="intake-json-label">Intake Responses Document</div>
              <button
                class="btn btn-secondary btn-xs"
                type="button"
                @click="copyOcrText(entry.derivedDocuments.intakeResponsesText)"
              >
                Copy all
              </button>
            </div>
            <pre class="intake-json">{{ entry.derivedDocuments.intakeResponsesText }}</pre>
          </div>
          <div v-if="entry.derivedDocuments?.clinicalSummaryText" class="intake-json-wrap">
            <div class="intake-json-header">
              <div class="intake-json-label">Clinical Summary</div>
              <button
                class="btn btn-secondary btn-xs"
                type="button"
                @click="copyOcrText(entry.derivedDocuments.clinicalSummaryText)"
              >
                Copy all
              </button>
            </div>
            <pre class="intake-json">{{ entry.derivedDocuments.clinicalSummaryText }}</pre>
          </div>
          <div class="intake-json-wrap">
            <div class="intake-json-header">
              <div class="intake-json-label">Question Responses</div>
              <button
                class="btn btn-secondary btn-xs"
                type="button"
                @click="copyOcrText(formatIntakePayload(entry))"
              >
                Copy all
              </button>
            </div>
            <pre class="intake-json">{{ formatIntakePayload(entry) }}</pre>
          </div>
        </details>
      </div>
    </div>

    <div v-if="showAuditSection && auditStatements.length" class="audit-panel">
      <div v-if="embedded" class="embedded-section-head">
        <h4 class="embedded-section-title">Document audit trail</h4>
      </div>
      <div class="audit-title">Document audit statements</div>
      <div class="audit-list">
        <div v-for="s in auditStatements" :key="s.documentId" class="audit-item">
          <div class="audit-name">
            {{ s.documentTitle || s.originalName || `Document ${s.documentId}` }}
          </div>
          <div v-if="s.documentType" class="audit-line">Type: {{ s.documentType }}</div>
          <div class="audit-line">Uploaded: {{ formatDateTime(s.uploadedAt) }}{{ s.uploadedBy ? ` by ${s.uploadedBy}` : '' }}</div>
          <div class="audit-line">Downloaded: {{ s.downloadedAt ? formatDateTime(s.downloadedAt) : '—' }}{{ s.downloadedBy ? ` by ${s.downloadedBy}` : '' }}</div>
          <div class="audit-line">Exported to Therapy Notes: {{ s.exportedToEhrAt ? formatDateTime(s.exportedToEhrAt) : '—' }}{{ s.exportedToEhrBy ? ` by ${s.exportedToEhrBy}` : '' }}</div>
          <div class="audit-line">
            Removed: {{ s.removedAt ? formatDateTime(s.removedAt) : '—' }}{{ s.removedBy ? ` by ${s.removedBy}` : '' }}
            <span v-if="s.removedReason"> · {{ s.removedReason }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="showAuditSection && auditError" class="error">{{ auditError }}</div>

    <div v-if="showOcrSection" class="ocr-panel">
      <div v-if="embedded" class="embedded-section-head">
        <h4 class="embedded-section-title">Extracted text (OCR)</h4>
      </div>
      <div class="ocr-header">
        <h4>Extracted Text</h4>
        <div v-if="ocrLoading" class="muted">Loading…</div>
      </div>
      <div v-if="ocrError" class="error">{{ ocrError }}</div>
      <div v-else-if="ocrRequests.length === 0" class="empty">No OCR requests yet.</div>
      <div v-else class="ocr-list">
        <div v-for="r in ocrRequests" :key="r.id" class="ocr-item">
          <div class="ocr-meta">
            <div>
              <strong>{{ formatDateTime(r.created_at) }}</strong>
              <span class="ocr-status">{{ r.status }}</span>
            </div>
            <div class="ocr-actions">
              <button
                v-if="r.result_text"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="copyOcrText(r.result_text)"
              >
                Copy
              </button>
              <button
                v-if="r.result_text"
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="ocrWiping"
                @click="clearOcrRequest(r)"
              >
                {{ ocrWiping ? 'Wiping…' : 'Wipe' }}
              </button>
            </div>
          </div>
          <div v-if="r.error_message" class="error">{{ r.error_message }}</div>
          <div v-else-if="r.result_text" class="ocr-text-block">
            <div class="ocr-text-header">
              <button class="btn btn-secondary btn-xs" type="button" @click="copyOcrText(r.result_text)">
                Copy all
              </button>
              <button class="btn btn-secondary btn-xs" type="button" @click="toggleOcrLines(r.id)">
                {{ showOcrLinesById[r.id] ? 'Hide lines' : 'Show lines' }}
              </button>
            </div>
            <pre class="ocr-text">{{ r.result_text }}</pre>
            <div v-if="showOcrLinesById[r.id]" class="ocr-lines">
              <div v-for="(line, idx) in ocrLines(r.result_text)" :key="`${r.id}-${idx}`" class="ocr-line">
                <span>{{ line }}</span>
                <button class="btn btn-secondary btn-xs" type="button" @click="copyOcrText(line)">Copy</button>
              </div>
            </div>
          </div>
          <div v-else class="muted">Queued…</div>
        </div>
      </div>
    </div>

    <div v-if="confirmingDoc" class="modal-overlay" @click.self="closeConfirmModal">
      <div class="modal" @click.stop>
        <h3>PHI Warning</h3>
        <p>
          This packet may contain PHI. Access is logged. Only open if you have a legitimate need and are authorized.
        </p>
        <p v-if="openModalError" class="modal-error">{{ openModalError }}</p>
        <p v-else-if="openModalLink" class="modal-fallback">
          If nothing opened,
          <a :href="openModalLink" target="_blank" rel="noopener noreferrer">click here to open the document</a>.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeConfirmModal">Cancel</button>
          <button class="btn btn-primary" @click="openDoc(confirmingDoc)" :disabled="opening">
            {{ opening ? 'Opening…' : 'I Understand — Open' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  clientId: { type: Number, required: true },
  highlightDocumentId: { type: Number, default: null },
  /** all | files | intake | audit | ocr */
  section: { type: String, default: 'all' },
  embedded: { type: Boolean, default: false },
  /** School staff without ROI All Active: own uploads only, no referral packets. */
  ownOnly: { type: Boolean, default: false }
});

const emit = defineEmits(['docs-loaded']);

const showFilesSection = computed(() => ['all', 'files'].includes(String(props.section || 'all')));
const showIntakeSection = computed(() => !props.ownOnly && ['all', 'intake'].includes(String(props.section || 'all')));
const showAuditSection = computed(() => !props.ownOnly && ['all', 'audit'].includes(String(props.section || 'all')));
const showOcrSection = computed(() => !props.ownOnly && ['all', 'ocr'].includes(String(props.section || 'all')));

function emitDocsLoaded() {
  const activeDocs = (docs.value || []).filter((d) => !d?.removed_at);
  emit('docs-loaded', {
    fileCount: activeDocs.length,
    intakeCount: (intakeSubmissions.value || []).length,
    ocrCount: (ocrRequests.value || []).length,
    latestUploadAt: activeDocs[0]?.uploaded_at || null
  });
}

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canUpload = computed(() => ['super_admin', 'admin', 'support', 'staff', 'school_staff'].includes(roleNorm.value));
const attachSubtitle = computed(() => {
  if (props.ownOnly) {
    return 'Drop files here to add them for this client. Only you see files you upload unless someone has ROI All Active.';
  }
  if (roleNorm.value === 'school_staff') {
    return 'Drop files here to add them to this client’s documents. Other staff with ROI All Active can see files you upload.';
  }
  return 'Admin only. Drop files here to add them directly to this client’s PHI documents.';
});
const canManageLifecycle = computed(() => ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value));

const loading = ref(false);
const auditLoading = ref(false);
const ocrLoading = ref(false);
const intakeLoading = ref(false);
const opening = ref(false);
const uploading = ref(false);
const ocrSubmitting = ref(false);
const ocrWiping = ref(false);
const error = ref('');
const auditError = ref('');
const ocrError = ref('');
const intakeError = ref('');
const isDragActive = ref(false);
const docs = ref([]);
const auditStatements = ref([]);
const ocrRequests = ref([]);
const intakeSubmissions = ref([]);
const signedSchoolPackets = ref([]);
const selectedSignedPacket = ref(null);
const confirmingDoc = ref(null);
const openModalError = ref('');
const openModalLink = ref('');
const fileInput = ref(null);
const uploadTitle = ref('');
const uploadType = ref('');
const showOcrLinesById = ref({});
const uploadTypeOptions = [
  'Intake packet',
  'Consent',
  'ROI',
  'Assessment',
  'IEP/504',
  'Other'
];

const reloadDocs = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/phi-documents/clients/${props.clientId}`);
    docs.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load packets';
  } finally {
    loading.value = false;
  }
};

const reloadAudit = async () => {
  try {
    auditLoading.value = true;
    auditError.value = '';
    const resp = await api.get(`/phi-documents/clients/${props.clientId}/audit`);
    auditStatements.value = resp.data?.documents || [];
  } catch (e) {
    auditError.value = e.response?.data?.error?.message || 'Failed to load document audit';
  } finally {
    auditLoading.value = false;
  }
};

const exportInfoByDocId = computed(() => {
  const map = {};
  for (const s of auditStatements.value || []) {
    if (!s?.documentId) continue;
    if (!s.exportedToEhrAt && !s.exportedToEhrBy) continue;
    map[s.documentId] = {
      at: s.exportedToEhrAt ? formatDateTime(s.exportedToEhrAt) : '—',
      by: s.exportedToEhrBy || ''
    };
  }
  return map;
});

const reloadOcr = async () => {
  try {
    ocrLoading.value = true;
    ocrError.value = '';
    const resp = await api.get(`/referrals/${props.clientId}/ocr`);
    ocrRequests.value = resp.data?.requests || [];
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to load OCR history';
  } finally {
    ocrLoading.value = false;
  }
};

const reloadIntakeResponses = async () => {
  try {
    intakeLoading.value = true;
    intakeError.value = '';
    const resp = await api.get(`/phi-documents/clients/${props.clientId}/intake-responses`);
    intakeSubmissions.value = resp.data?.submissions || [];
  } catch (e) {
    intakeError.value = e.response?.data?.error?.message || 'Failed to load intake responses';
  } finally {
    intakeLoading.value = false;
  }
};

const reloadSignedSchoolPackets = async () => {
  try {
    const resp = await api.get(`/phi-documents/clients/${props.clientId}/signed-school-packets`);
    signedSchoolPackets.value = Array.isArray(resp.data?.packets) ? resp.data.packets : [];
  } catch {
    signedSchoolPackets.value = [];
  }
};

const openSignedPacket = async (p) => {
  try {
    const resp = await api.get(`/phi-documents/signed-school-packets/${p.id}`);
    selectedSignedPacket.value = resp.data?.packet || p;
  } catch {
    selectedSignedPacket.value = p;
  }
};

const openPhiFromBundle = (phiDocumentId) => {
  const doc = (docs.value || []).find((d) => Number(d.id) === Number(phiDocumentId));
  if (doc) confirmOpen(doc);
};

const reload = async () => {
  if (props.ownOnly) {
    await reloadDocs();
    signedSchoolPackets.value = [];
    auditStatements.value = [];
    intakeSubmissions.value = [];
    ocrRequests.value = [];
  } else {
    await Promise.all([
      reloadDocs(),
      reloadOcr(),
      reloadAudit(),
      reloadIntakeResponses(),
      reloadSignedSchoolPackets()
    ]);
  }
  emitDocsLoaded();
};

const closeConfirmModal = () => {
  confirmingDoc.value = null;
  openModalError.value = '';
  openModalLink.value = '';
};

const confirmOpen = (doc) => {
  openModalError.value = '';
  openModalLink.value = '';
  confirmingDoc.value = doc;
};

const closePopupQuietly = (popup) => {
  if (!popup || popup.closed) return;
  try { popup.close(); } catch { /* ignore */ }
};

const writePopupLoading = (popup) => {
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
    // Cross-origin or closed — ignore
  }
};

/**
 * Navigate a tab opened synchronously on click.
 * Do NOT use noopener on the interim about:blank window — browsers then return null
 * (or a non-navigable handle), leaving a stuck blank tab after the async fetch.
 */
const navigateToUrl = (url, popup) => {
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
  openModalLink.value = url;
  return false;
};

const openDoc = async (doc) => {
  if (!doc?.id) return;
  openModalError.value = '';
  openModalLink.value = '';

  // Open tab synchronously on click so popup blockers do not discard window.open after the API call.
  // Omit noopener here so we can set location after the fetch; null opener after navigate.
  const popup = window.open('about:blank', '_blank');
  if (popup) writePopupLoading(popup);

  try {
    opening.value = true;
    error.value = '';
    const resp = await api.get(`/phi-documents/${doc.id}/view`, { responseType: 'blob' });
    const contentType = String(resp.headers?.['content-type'] || '').toLowerCase();

    if (contentType.includes('application/json')) {
      const raw = await resp.data.text();
      const data = JSON.parse(raw);
      const url = data?.url;
      if (!url) throw new Error('Could not get a download link for this document.');
      const opened = navigateToUrl(url, popup);
      if (!opened) {
        closePopupQuietly(popup);
        openModalLink.value = url;
        openModalError.value =
          'Your browser blocked opening a new tab. Use the link below, or allow pop-ups for this site.';
      }
    } else {
      const blob = resp.data instanceof Blob
        ? resp.data
        : new Blob([resp.data], { type: contentType || 'application/octet-stream' });
      const blobUrl = URL.createObjectURL(blob);
      const opened = navigateToUrl(blobUrl, popup);
      if (!opened) {
        closePopupQuietly(popup);
        openModalLink.value = blobUrl;
        openModalError.value = 'Your browser blocked the document tab. Use the link below to open it.';
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
    }
    if (!openModalLink.value && !openModalError.value) {
      closeConfirmModal();
    } else if (openModalLink.value && !openModalError.value) {
      openModalError.value = 'If the document did not open, use the link below.';
    }
  } catch (e) {
    closePopupQuietly(popup);
    let message = 'Failed to open packet';
    if (e.response?.data instanceof Blob) {
      try {
        const raw = await e.response.data.text();
        const data = JSON.parse(raw);
        message = data?.error?.message || message;
      } catch {
        message = e.message || message;
      }
    } else {
      message = e.response?.data?.error?.message || e.message || message;
    }
    openModalError.value = message;
    error.value = message;
  } finally {
    opening.value = false;
  }
};

const markExported = async (doc) => {
  if (!doc?.id) return;
  if (!window.confirm('Mark this document as exported to Therapy Notes?')) return;
  try {
    await api.post(`/phi-documents/${doc.id}/export`);
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to mark as exported';
  }
};

const removeDoc = async (doc) => {
  if (!doc?.id) return;
  if (!window.confirm('Remove this document from the system? This cannot be undone.')) return;
  try {
    await api.delete(`/phi-documents/${doc.id}`);
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove document';
  }
};

const resetUploadFields = () => {
  uploadTitle.value = '';
  uploadType.value = '';
  try {
    if (fileInput.value) fileInput.value.value = '';
  } catch {
    // ignore
  }
};

const uploadFiles = async (fileList) => {
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;
  try {
    uploading.value = true;
    error.value = '';
    for (const [index, file] of files.entries()) {
      const form = new FormData();
      form.append('file', file);
      if (uploadTitle.value && files.length === 1 && index === 0) form.append('documentTitle', uploadTitle.value);
      if (uploadType.value) form.append('documentType', uploadType.value);
      await api.post(`/phi-documents/clients/${props.clientId}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to upload document';
  } finally {
    uploading.value = false;
    isDragActive.value = false;
    resetUploadFields();
  }
};

const onFileSelected = async (evt) => {
  const files = evt?.target?.files || [];
  await uploadFiles(files);
};

const onDragEnter = () => {
  if (!canUpload.value || uploading.value) return;
  isDragActive.value = true;
};

const onDragOver = () => {
  if (!canUpload.value || uploading.value) return;
  isDragActive.value = true;
};

const onDragLeave = (evt) => {
  if (!evt?.currentTarget || evt.currentTarget.contains(evt.relatedTarget)) return;
  isDragActive.value = false;
};

const onDropFiles = async (evt) => {
  if (!canUpload.value || uploading.value) return;
  const files = evt?.dataTransfer?.files || [];
  isDragActive.value = false;
  await uploadFiles(files);
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-');
const formatStatusLabel = (status) => {
  const value = String(status || '').trim();
  if (!value) return 'Unknown status';
  return value.replace(/_/g, ' ');
};
const formatIntakePayload = (entry) => {
  const payload = entry?.intakeData?.responses || entry?.intakeData || null;
  if (!payload) return 'No intake payload stored.';
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return 'Unable to render intake payload.';
  }
};

const canRequestOcr = (doc) => {
  if (!doc) return false;
  if (doc.removed_at) return false;
  if (doc.scan_status && doc.scan_status !== 'clean') return false;
  return true;
};

const ocrDisabledReason = (doc) => {
  if (!doc) return 'Document not available';
  if (doc.removed_at) return 'Document removed';
  if (doc.scan_status && doc.scan_status !== 'clean') return 'Waiting for security scan';
  return 'Request OCR';
};

const requestOcr = async (doc) => {
  if (!doc?.id) return;
  try {
    ocrSubmitting.value = true;
    ocrError.value = '';
    const existing = await api.get(`/referrals/${props.clientId}/ocr`);
    const requests = existing.data?.requests || [];
    const latest = requests.find((r) => Number(r.phi_document_id) === Number(doc.id)) || requests[0];
    if (latest?.status === 'completed' && latest?.result_text) {
      await reloadOcr();
      return;
    }
    if (latest?.status && latest.status !== 'completed') {
      ocrError.value = latest.error_message || 'Extraction already queued. Please wait.';
      return;
    }
    const req = await api.post(`/referrals/${props.clientId}/ocr`, { phiDocumentId: doc.id });
    const reqId = req.data?.request?.id;
    if (reqId) {
      await api.post(`/referrals/${props.clientId}/ocr/${reqId}/process`);
    }
    await reloadOcr();
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to extract text';
  } finally {
    ocrSubmitting.value = false;
  }
};

const copyOcrText = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text || ''));
  } catch {
    // ignore
  }
};

const toggleOcrLines = (id) => {
  if (!id) return;
  showOcrLinesById.value = {
    ...(showOcrLinesById.value || {}),
    [id]: !showOcrLinesById.value?.[id]
  };
};

const ocrLines = (text) => {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

const clearOcrRequest = async (request) => {
  if (!request?.id) return;
  if (!window.confirm('Wipe extracted OCR text for this request? This cannot be undone.')) return;
  try {
    ocrWiping.value = true;
    ocrError.value = '';
    await api.post(`/referrals/${props.clientId}/ocr/${request.id}/clear`);
    await reloadOcr();
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to wipe OCR text';
  } finally {
    ocrWiping.value = false;
  }
};

onMounted(reload);
watch(() => props.clientId, reload);

watch(
  () => [props.highlightDocumentId, docs.value],
  async ([docId, docList]) => {
    if (!docId || !docList?.length) return;
    await nextTick();
    const row = document.querySelector(`tr[data-document-id="${docId}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  { immediate: true }
);
</script>

<style scoped>
.panel {
  padding: 8px 0;
}
.panel--embedded {
  padding: 0;
}
.embedded-section-head {
  margin-bottom: 10px;
}
.embedded-section-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 800;
  color: var(--cc-secondary, var(--secondary, #1d2633));
}
.attach-panel {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  padding: 12px;
}
.attach-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.attach-title {
  font-size: 14px;
  font-weight: 700;
}
.attach-subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
.upload-fields {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(160px, 1fr));
  gap: 10px;
  flex: 1;
  min-width: 260px;
}
.upload-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.upload-input {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  background: white;
}
.drop-zone {
  margin-top: 12px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 18px 16px;
  text-align: center;
  background: rgba(255, 255, 255, 0.75);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.drop-zone-active {
  border-color: var(--primary, #2563eb);
  background: rgba(37, 99, 235, 0.08);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
}
.drop-zone-title {
  font-weight: 700;
}
.drop-zone-subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
.header h3 {
  margin: 0;
}
.hint {
  margin: 6px 0 12px;
  color: var(--text-secondary);
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
  vertical-align: middle;
}
tr.doc-highlight {
  background: rgba(59, 130, 246, 0.12);
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.35);
}
.doc-title {
  font-weight: 600;
}
.doc-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.doc-filename {
  color: var(--text-secondary);
  font-size: 12px;
}
.actions {
  text-align: right;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.ocr-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.loading {
  padding: 12px;
  color: var(--text-secondary);
}
.error {
  padding: 10px 0;
  color: var(--danger);
}
.empty {
  padding: 12px 0;
  color: var(--text-secondary);
}

.pill {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.pill-ready {
  background: rgba(60, 200, 90, 0.12);
  color: #1b7d3a;
}

.pill-pending {
  background: rgba(255, 193, 7, 0.16);
  color: #7a5a00;
}

.pill-removed {
  background: rgba(220, 53, 69, 0.12);
  color: #a51f2d;
}

.audit-panel {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.audit-title {
  font-weight: 700;
  margin-bottom: 8px;
}

.audit-list {
  display: grid;
  gap: 10px;
}

.audit-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
}

.audit-name {
  font-weight: 600;
  margin-bottom: 6px;
}

.audit-line {
  color: var(--text-secondary);
  font-size: 13px;
}

.ocr-panel {
  margin-top: 18px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.intake-panel {
  margin-top: 18px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
.intake-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.intake-header h4 {
  margin: 0;
}
.intake-list {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}
.intake-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--bg-alt);
}
.intake-item summary {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  cursor: pointer;
}
.intake-meta {
  margin-top: 8px;
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.intake-json-wrap {
  margin-top: 8px;
}
.intake-json-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.intake-json-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.intake-json {
  margin: 0;
  white-space: pre-wrap;
  font-size: 12px;
  max-height: 260px;
  overflow: auto;
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}

.ocr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ocr-header h4 {
  margin: 0;
}

.ocr-list {
  margin-top: 10px;
  display: grid;
  gap: 12px;
}

.ocr-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-alt);
}

.ocr-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ocr-status {
  margin-left: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: var(--text-secondary);
}

.ocr-text {
  margin: 10px 0 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13px;
}
.ocr-text-block {
  margin-top: 8px;
}
.ocr-text-header {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ocr-lines {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}
.ocr-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  font-size: 12px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 520px;
  max-width: 92vw;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
}
.modal h3 {
  margin: 0 0 10px;
}
.modal p {
  margin: 0 0 14px;
  color: var(--text-secondary);
}
.modal-error {
  margin: 0 0 10px;
  color: var(--danger);
  font-size: 14px;
}
.modal-fallback {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--text-secondary);
}
.modal-fallback a {
  color: var(--primary, #2563eb);
  font-weight: 600;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.signed-packet-section {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  background: #f8fafc;
}
.signed-packet-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.signed-packet-card {
  text-align: left;
  border: 1px solid #dbeafe;
  background: #fff;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
}
.signed-packet-card:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}
.signed-packet-title {
  font-weight: 700;
  color: #1e3a8a;
}
.signed-packet-meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.signed-packet-modal {
  width: min(640px, 94vw);
}
.signed-packet-modal .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.signed-packet-contents {
  margin: 10px 0 0;
  padding-left: 18px;
}
.signed-packet-contents li {
  margin: 6px 0;
}
</style>

