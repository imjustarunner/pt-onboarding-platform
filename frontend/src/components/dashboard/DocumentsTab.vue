<template>
  <DocumentsHubPanel
    title="My Documents"
    subtitle="Review, sign, and download documents assigned to you by your organization."
    mode="self"
    allow-category-reorder
    :tasks="documents"
    :loading="loading"
    :error="error"
    :sort-key="sortOption"
    @refresh="fetchDocuments"
    @action="onHubAction"
  >
    <template #header-actions>
      <div class="my-docs-sort">
        <label for="my-docs-sort">Sort by:</label>
        <select id="my-docs-sort" v-model="sortOption">
          <option value="unfinished">Unfinished First</option>
          <option value="alphabetical">Alphabetical (A–Z)</option>
          <option value="due-date">Due Date</option>
          <option value="status">Status</option>
          <option value="recent">Recently Completed</option>
        </select>
      </div>
      <button
        type="button"
        class="doc-hub__btn doc-hub__btn--ghost"
        :disabled="loading"
        @click="fetchDocuments"
      >
        Refresh
      </button>
    </template>
  </DocumentsHubPanel>

  <section class="personal-copies" aria-labelledby="application-copies-title">
    <header class="personal-copies__head">
      <div>
        <h3 id="application-copies-title">Application &amp; hire copies</h3>
        <p>
          Your job application receipt, signed waivers, and uploaded application materials.
        </p>
      </div>
      <button
        type="button"
        class="doc-hub__btn doc-hub__btn--ghost"
        :disabled="appCopiesLoading"
        @click="fetchApplicationCopies"
      >
        Refresh
      </button>
    </header>
    <p v-if="appCopiesError" class="personal-copies__error">{{ appCopiesError }}</p>
    <p v-else-if="appCopiesLoading" class="personal-copies__empty">Loading application copies…</p>
    <p v-else-if="!applicationCopies.length" class="personal-copies__empty">
      No application copies yet. Receipts and signed waivers appear here after you apply or complete hire acknowledgments.
    </p>
    <ul v-else class="personal-copies__list">
      <li v-for="doc in applicationCopies" :key="doc.id">
        <button type="button" class="personal-copies__row" @click="downloadApplicationCopy(doc)">
          <span class="personal-copies__name">{{ doc.title }}</span>
          <span class="personal-copies__meta">
            <span class="personal-copies__pill">{{ formatAppDocType(doc.docType) }}</span>
            <span class="personal-copies__date">{{ formatCopyDate(doc.createdAt) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>

  <section class="personal-copies" aria-labelledby="personal-copies-title">
    <header class="personal-copies__head">
      <div>
        <h3 id="personal-copies-title">Personal copies</h3>
        <p>
          Private Library worksheets given to you. Edit and save your copy without changing the master or anyone
          else’s.
        </p>
      </div>
      <button
        type="button"
        class="doc-hub__btn doc-hub__btn--ghost"
        :disabled="copiesLoading"
        @click="fetchPersonalCopies"
      >
        Refresh
      </button>
    </header>
    <p v-if="copiesError" class="personal-copies__error">{{ copiesError }}</p>
    <p v-else-if="copiesLoading" class="personal-copies__empty">Loading personal copies…</p>
    <p v-else-if="!personalCopies.length" class="personal-copies__empty">
      No personal copies yet. When someone uses Give Personal Copy in the Library, they appear here.
    </p>
    <ul v-else class="personal-copies__list">
      <li v-for="copy in personalCopies" :key="copy.id">
        <button type="button" class="personal-copies__row" @click="openPersonalCopy(copy)">
          <span class="personal-copies__name">{{ copy.name }}</span>
          <span class="personal-copies__meta">
            <span v-if="copy.sourceName" class="personal-copies__pill">From: {{ copy.sourceName }}</span>
            <span v-if="copy.categoryName" class="personal-copies__pill">{{ copy.categoryName }}</span>
            <span class="personal-copies__date">{{ formatCopyDate(copy.updatedAt) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>

  <div v-if="showDetailsModal" class="modal-overlay" @click="closeDetails">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>{{ detailsDocument?.title || 'Document' }} — Details</h3>
        <button type="button" class="modal-close" @click="closeDetails">Close</button>
      </div>
      <div v-if="detailsLoading" class="modal-loading">Loading details…</div>
      <div v-else class="details-body">
        <div class="detail-row">
          <strong>Status</strong>
          <span>{{ detailsDocument?.document_action_type === 'review' ? 'Reviewed' : 'Signed' }}</span>
        </div>
        <template v-if="detailsDocument?.document_action_type === 'review'">
          <div class="detail-row">
            <strong>Reviewed at</strong>
            <span>{{ detailsAck?.acknowledged_at ? new Date(detailsAck.acknowledged_at).toLocaleString() : 'N/A' }}</span>
          </div>
          <div class="detail-row">
            <strong>IP address</strong>
            <span>{{ detailsAck?.ip_address || 'N/A' }}</span>
          </div>
        </template>
        <div class="modal-actions">
          <button type="button" class="doc-hub__btn doc-hub__btn--primary" @click="viewDocument(detailsDocument)">View</button>
          <button type="button" class="doc-hub__btn doc-hub__btn--ghost" @click="downloadDocument(detailsDocument)">Download</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useDocumentsStore } from '../../store/documents';
import DocumentsHubPanel from '../documents/DocumentsHubPanel.vue';
import { computeDocumentStats } from '../../utils/documentUiHelpers';
import { fetchMyLibraryCopies } from '../../services/library.js';

const emit = defineEmits(['update-count']);

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const documentsStore = useDocumentsStore();
const loading = ref(true);
const error = ref('');
const allDocuments = ref([]);
const sortOption = ref('unfinished');
const personalCopies = ref([]);
const copiesLoading = ref(false);
const copiesError = ref('');
const applicationCopies = ref([]);
const appCopiesLoading = ref(false);
const appCopiesError = ref('');

const formatAppDocType = (docType) => {
  const map = {
    application_receipt: 'Receipt',
    reference_release: 'Waiver',
    resume: 'Resume',
    cover_letter: 'Cover letter',
    application_material: 'Application',
    job_description_ack: 'Job description',
    job_description_acknowledgement: 'Job description',
    background_check_authorization: 'Background check',
    company_document_signed: 'Signed document'
  };
  return map[String(docType || '')] || 'Document';
};

const fetchApplicationCopies = async () => {
  try {
    appCopiesLoading.value = true;
    appCopiesError.value = '';
    const { data } = await api.get('/users/me/application-copies');
    applicationCopies.value = Array.isArray(data?.documents) ? data.documents : [];
  } catch (err) {
    appCopiesError.value = err.response?.data?.error?.message || 'Failed to load application copies';
    applicationCopies.value = [];
  } finally {
    appCopiesLoading.value = false;
  }
};

const downloadApplicationCopy = async (doc) => {
  try {
    const response = await api.get(`/users/me/application-copies/${doc.id}/download`, {
      responseType: 'blob'
    });
    const filename = safeFilename(doc.originalName || doc.title || 'document.pdf');
    const url = window.URL.createObjectURL(new Blob([response.data], { type: doc.mimeType || 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
  }
};

const fetchPersonalCopies = async () => {
  try {
    copiesLoading.value = true;
    copiesError.value = '';
    personalCopies.value = await fetchMyLibraryCopies({
      agencyId: agencyStore.currentAgency?.id
    });
  } catch (err) {
    copiesError.value = err.response?.data?.error?.message || 'Failed to load personal copies';
    personalCopies.value = [];
  } finally {
    copiesLoading.value = false;
  }
};

const openPersonalCopy = (copy) => {
  const slug =
    agencyStore.currentAgency?.slug ||
    agencyStore.currentAgency?.portal_url ||
    authStore.user?.agency_slug ||
    '';
  if (slug) {
    router.push(`/${slug}/library/resources/${copy.id}`);
  } else {
    router.push(`/library/resources/${copy.id}`);
  }
};

const formatCopyDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return '';
  }
};

const fetchDocuments = async () => {
  try {
    loading.value = true;
    error.value = '';
    const userId = authStore.user?.id;
    if (!userId) {
      error.value = 'User not found';
      return;
    }
    const response = await api.get('/tasks', { params: { taskType: 'document' } });
    allDocuments.value = response.data || [];
    updateCount();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load documents';
  } finally {
    loading.value = false;
  }
};

const documents = computed(() => {
  if (!agencyStore.currentAgency) return [];
  return allDocuments.value.filter((doc) => {
    if (doc.assigned_to_user_id === authStore.user?.id) return true;
    return doc.assigned_to_agency_id === agencyStore.currentAgency?.id;
  });
});

const updateCount = () => {
  emit('update-count', computeDocumentStats(documents.value).pending);
};

watch(() => agencyStore.currentAgency, updateCount, { immediate: true });
watch(documents, updateCount);

const onHubAction = ({ type, task }) => {
  if (type === 'sign') handleDocumentAction(task);
  else if (type === 'view') viewDocument(task);
  else if (type === 'download') downloadDocument(task);
  else if (type === 'details') openDetails(task);
};

const handleDocumentAction = (document) => {
  const path =
    document.document_action_type === 'signature'
      ? `/tasks/documents/${document.id}/sign`
      : `/tasks/documents/${document.id}/review`;
  router.push(path);
};

const viewDocument = async (document) => {
  try {
    const endpoint =
      document.document_action_type === 'signature'
        ? `/document-signing/${document.id}/view`
        : `/document-acknowledgment/${document.id}/view`;
    const response = await api.get(endpoint, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 100);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to retrieve document');
  }
};

const downloadDocument = async (document) => {
  try {
    const assignee = safeFilename(
      `${authStore.user?.first_name || ''} ${authStore.user?.last_name || ''}`.trim() ||
        authStore.user?.email ||
        'user'
    );
    const dateLabel = formatDateForFilename(document.completed_at || document.updated_at);
    const title = safeFilename(document.title || 'document');
    const filename = `${title} - ${assignee} - ${dateLabel}.pdf`;

    if (document.document_action_type === 'signature') {
      await documentsStore.downloadSignedDocument(document.id, filename);
      return;
    }
    const pdfRes = await api.get(`/document-acknowledgment/${document.id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([pdfRes.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
  }
};

const safeFilename = (name) =>
  String(name || 'document')
    .replace(/[^\w\s\-().]/g, '')
    .trim()
    .slice(0, 80) || 'document';

const formatDateForFilename = (dateString) => {
  const d = dateString ? new Date(dateString) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
};

const showDetailsModal = ref(false);
const detailsDocument = ref(null);
const detailsAck = ref(null);
const detailsLoading = ref(false);

const openDetails = async (document) => {
  showDetailsModal.value = true;
  detailsDocument.value = document;
  detailsAck.value = null;
  detailsLoading.value = true;
  try {
    if (document.document_action_type === 'review') {
      const res = await api.get(`/document-acknowledgment/${document.id}/summary`);
      detailsAck.value = res.data?.acknowledgment || null;
    }
  } catch {
    detailsAck.value = null;
  } finally {
    detailsLoading.value = false;
  }
};

const closeDetails = () => {
  showDetailsModal.value = false;
  detailsDocument.value = null;
  detailsAck.value = null;
};

onMounted(async () => {
  if (!agencyStore.userAgencies?.length) await agencyStore.fetchUserAgencies();
  await Promise.all([fetchDocuments(), fetchPersonalCopies(), fetchApplicationCopies()]);
});

watch(
  () => agencyStore.currentAgency?.id,
  () => {
    fetchPersonalCopies();
  }
);
</script>

<style scoped>
.personal-copies {
  margin-top: 1.5rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 1.1rem 1.2rem 1.15rem;
}

.personal-copies__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.personal-copies__head h3 {
  margin: 0;
  font-size: 1.05rem;
  color: #0f172a;
}

.personal-copies__head p {
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.4;
  max-width: 36rem;
}

.personal-copies__empty,
.personal-copies__error {
  margin: 0;
  font-size: 0.9rem;
  color: #64748b;
}

.personal-copies__error {
  color: #b91c1c;
}

.personal-copies__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.personal-copies__row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: transparent;
  padding: 0.75rem 0.2rem;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.personal-copies__row:hover {
  background: #fffbeb;
}

.personal-copies__name {
  font-weight: 650;
  color: #0f172a;
}

.personal-copies__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.personal-copies__pill {
  font-size: 0.72rem;
  font-weight: 650;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
}

.personal-copies__date {
  font-size: 0.75rem;
  color: #94a3b8;
}

.my-docs-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.my-docs-sort label {
  color: #6b7280;
  font-weight: 500;
}

.my-docs-sort select {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-content {
  background: #fff;
  padding: 24px;
  border-radius: 12px;
  max-width: 520px;
  width: 100%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-close {
  padding: 8px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.modal-loading {
  padding: 20px;
  text-align: center;
  color: #6b7280;
}

.details-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
}

.detail-row {
  display: flex;
  gap: 12px;
}

.detail-row strong {
  min-width: 100px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

/* Re-use hub button classes from child (deep not needed — duplicate minimal) */
:deep(.doc-hub__btn--primary) {
  background: #166534;
  color: #fff;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

:deep(.doc-hub__btn--ghost) {
  background: #fff;
  border: 1px solid #e5e7eb;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
}
</style>
