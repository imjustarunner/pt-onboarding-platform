import { ref, computed, unref } from 'vue';
import api from '../services/api';

function parseDateForDisplay(dateValue) {
  if (!dateValue) return new Date(0);
  const s = String(dateValue);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }
  return new Date(s);
}

function formatDate(dateString) {
  if (!dateString) return '—';
  return parseDateForDisplay(dateString).toLocaleDateString();
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString();
}

/**
 * Shared paperwork / document-status state for client chart overview + Documents tab.
 */
export function useClientPaperwork(client, canEditPaperwork, onClientUpdated) {
  const paperworkHistory = ref([]);
  const paperworkHistoryLoading = ref(false);
  const paperworkHistoryError = ref('');
  const paperworkStatuses = ref([]);
  const deliveryMethods = ref([]);
  const paperworkError = ref('');
  const savingPaperwork = ref(false);
  const paperworkForm = ref({
    paperworkStatusId: '',
    deliveryMethodId: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    roiExpiresAt: '',
    note: ''
  });

  const docChecklistItems = ref([]);
  const docChecklistLoading = ref(false);
  const docChecklistSaving = ref(false);
  const docChecklistError = ref('');

  const docChecklistAvailable = computed(
    () => Array.isArray(docChecklistItems.value) && docChecklistItems.value.length > 0
  );
  const docCompletedRow = computed(
    () => (docChecklistItems.value || []).find((x) => String(x?.status_key || '').toLowerCase() === 'completed') || null
  );
  const docIsCompleted = computed(() => !!docCompletedRow.value?.is_completed);
  // Ongoing chart paperwork only — readiness packet / emailed packet / disclosure live elsewhere.
  const ONGOING_PAPERWORK_KEYS = new Set([
    'renewal',
    'new_docs',
    'new_insurance',
    're_auth',
    'balance',
    'roi'
  ]);
  const docNeededOptions = computed(() =>
    (docChecklistItems.value || []).filter((x) => {
      const key = String(x?.status_key || '').toLowerCase();
      if (key === 'completed') return false;
      if (['emailed_packet', 'disclosure_consent', 'insurance_payment_auth'].includes(key)) return false;
      return ONGOING_PAPERWORK_KEYS.has(key) || !key;
    })
  );
  const docNeededCount = computed(() =>
    (docChecklistItems.value || []).filter((x) => {
      const key = String(x?.status_key || '').toLowerCase();
      return key !== 'completed' && !!x?.is_needed;
    }).length
  );

  const selectedPaperworkStatusKey = computed(() => {
    const id = paperworkForm.value.paperworkStatusId ? Number(paperworkForm.value.paperworkStatusId) : null;
    if (!id) return '';
    const row = (paperworkStatuses.value || []).find((s) => Number(s?.id) === id) || null;
    return String(row?.status_key || row?.statusKey || '').toLowerCase();
  });

  const documentStatusSummaryText = computed(() => {
    const c = unref(client) || {};
    const statusKey = String(c.paperwork_status_key || '').toLowerCase();
    if (statusKey === 'all_needed') return c.paperwork_status_label || 'All Needed';
    const count = c.paperwork_needed_count;
    if (count === undefined || count === null) return '';
    const n = Number(count);
    if (!Number.isFinite(n)) return '';
    if (n <= 0) return 'Completed';
    if (n > 1) return 'Multiple Needed';
    const base = c.paperwork_status_label || c.paperwork_status_key || 'Needed';
    const lbl = String(base || 'Needed').trim();
    return lbl ? `${lbl} Needed` : 'Needed';
  });

  const currentPaperworkSummary = computed(() => {
    const c = unref(client) || {};
    const h = (paperworkHistory.value || [])[0] || null;
    const statusLabel = h?.paperwork_status_label || c.paperwork_status_label || '—';
    const deliveryLabel = h?.paperwork_delivery_method_label || c.paperwork_delivery_method_label || '—';
    const dateVal = h?.effective_date || c.doc_date || null;
    const effectiveDateText = dateVal ? formatDate(dateVal) : '—';
    const roiExpiresAt = h?.roi_expires_at || c.roi_expires_at || null;
    const statusKey = String(h?.paperwork_status_key || c.paperwork_status_key || '').toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const roiExpired = statusKey === 'roi' && roiExpiresAt
      ? new Date(String(roiExpiresAt)).getTime() < today.getTime()
      : false;
    return {
      statusLabel: roiExpired ? 'ROI (Expired)' : statusLabel,
      deliveryLabel,
      effectiveDateText,
      roiExpiresAtText: roiExpiresAt ? formatDate(roiExpiresAt) : '',
      roiExpired
    };
  });

  async function fetchDocChecklist() {
    const c = unref(client);
    if (!c?.id) {
      docChecklistItems.value = [];
      return;
    }
    try {
      docChecklistLoading.value = true;
      docChecklistError.value = '';
      const r = await api.get(`/clients/${c.id}/document-status`);
      docChecklistItems.value = Array.isArray(r.data?.items) ? r.data.items : [];
    } catch (e) {
      docChecklistItems.value = [];
      docChecklistError.value = e?.response?.data?.error?.message || 'Failed to load document checklist';
    } finally {
      docChecklistLoading.value = false;
    }
  }

  async function markAllDocsCompleted() {
    if (!unref(canEditPaperwork)) return null;
    const c = unref(client);
    if (!c?.id) return null;
    try {
      docChecklistSaving.value = true;
      docChecklistError.value = '';
      if (!docChecklistItems.value.length) await fetchDocChecklist();
      const updates = (docChecklistItems.value || [])
        .filter((x) => String(x?.status_key || '').toLowerCase() !== 'completed')
        .filter((x) => Number(x?.paperwork_status_id) > 0)
        .map((x) => ({ paperwork_status_id: Number(x.paperwork_status_id), is_needed: false }));
      if (!updates.length) return null;
      const r = await api.put(`/clients/${c.id}/document-status`, { updates });
      await fetchDocChecklist();
      const updatedClient = r.data?.client || null;
      onClientUpdated?.({ keepOpen: true, client: updatedClient || undefined });
      return updatedClient;
    } catch (e) {
      docChecklistError.value = e?.response?.data?.error?.message || 'Failed to mark completed';
      return null;
    } finally {
      docChecklistSaving.value = false;
    }
  }

  async function onToggleDocCompleted(event) {
    if (!unref(canEditPaperwork)) return;
    if (!event?.target?.checked) return;
    await markAllDocsCompleted();
  }

  async function onToggleDocNeeded(item, event) {
    if (!unref(canEditPaperwork)) return;
    if (!item?.paperwork_status_id) return;
    if (String(item.status_key || '').toLowerCase() === 'completed') return;
    const c = unref(client);
    if (!c?.id) return;
    const checked = !!event?.target?.checked;
    try {
      docChecklistSaving.value = true;
      docChecklistError.value = '';
      const r = await api.put(`/clients/${c.id}/document-status`, {
        paperwork_status_id: item.paperwork_status_id,
        is_needed: checked
      });
      await fetchDocChecklist();
      if (r.data?.client) onClientUpdated?.({ client: r.data.client, keepOpen: true });
      else onClientUpdated?.({ keepOpen: true });
    } catch (e) {
      docChecklistError.value = e?.response?.data?.error?.message || 'Failed to update document status';
    } finally {
      docChecklistSaving.value = false;
    }
  }

  async function fetchPaperworkStatuses() {
    if (!unref(canEditPaperwork)) {
      paperworkStatuses.value = [];
      return;
    }
    const c = unref(client);
    const agencyId = c?.agency_id ? Number(c.agency_id) : null;
    if (!agencyId) {
      paperworkStatuses.value = [];
      return;
    }
    try {
      const r = await api.get('/client-settings/paperwork-statuses', { params: { agencyId } });
      paperworkStatuses.value = (r.data || []).filter(
        (s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true)
      );
    } catch {
      paperworkStatuses.value = [];
    }
  }

  async function fetchDeliveryMethods() {
    if (!unref(canEditPaperwork)) {
      deliveryMethods.value = [];
      return;
    }
    const c = unref(client);
    const agencyId = c?.agency_id;
    const schoolId = c?.organization_id;
    if (!agencyId || !schoolId) {
      deliveryMethods.value = [];
      return;
    }
    try {
      const r = await api.get(`/school-settings/${schoolId}/paperwork-delivery-methods`, {
        params: { agencyId }
      });
      deliveryMethods.value = (r.data || []).filter((m) => m && (m.is_active === 1 || m.is_active === true));
    } catch {
      deliveryMethods.value = [];
    }
  }

  async function fetchPaperworkHistory() {
    if (!unref(canEditPaperwork)) {
      paperworkHistory.value = [];
      return;
    }
    const c = unref(client);
    if (!c?.id) {
      paperworkHistory.value = [];
      return;
    }
    try {
      paperworkHistoryLoading.value = true;
      paperworkHistoryError.value = '';
      const r = await api.get(`/clients/${c.id}/paperwork-history`);
      paperworkHistory.value = r.data || [];
    } catch (e) {
      paperworkHistoryError.value = e.response?.data?.error?.message || 'Failed to load document history';
      paperworkHistory.value = [];
    } finally {
      paperworkHistoryLoading.value = false;
    }
  }

  async function savePaperworkHistory() {
    if (!unref(canEditPaperwork)) return;
    const c = unref(client);
    if (!c?.id) return;
    const paperworkStatusId = paperworkForm.value.paperworkStatusId
      ? Number(paperworkForm.value.paperworkStatusId)
      : null;
    const effectiveDate = String(paperworkForm.value.effectiveDate || '').trim();
    if (!paperworkStatusId || !effectiveDate) return;
    const deliveryId = paperworkForm.value.deliveryMethodId
      ? Number(paperworkForm.value.deliveryMethodId)
      : null;
    const note = String(paperworkForm.value.note || '').trim() || null;
    const roiExpiresAt = String(paperworkForm.value.roiExpiresAt || '').trim() || null;
    try {
      savingPaperwork.value = true;
      paperworkError.value = '';
      await api.post(`/clients/${c.id}/paperwork-history`, {
        paperwork_status_id: paperworkStatusId,
        paperwork_delivery_method_id: deliveryId,
        effective_date: effectiveDate,
        roi_expires_at: selectedPaperworkStatusKey.value === 'roi' ? roiExpiresAt : null,
        note
      });
      paperworkForm.value.note = '';
      await fetchPaperworkHistory();
    } catch (e) {
      paperworkError.value = e.response?.data?.error?.message || 'Failed to save';
    } finally {
      savingPaperwork.value = false;
    }
  }

  async function loadTabData() {
    await Promise.all([
      fetchDocChecklist(),
      fetchPaperworkStatuses(),
      fetchDeliveryMethods(),
      fetchPaperworkHistory()
    ]);
  }

  return {
    paperworkHistory,
    paperworkHistoryLoading,
    paperworkHistoryError,
    paperworkStatuses,
    deliveryMethods,
    paperworkError,
    savingPaperwork,
    paperworkForm,
    docChecklistItems,
    docChecklistLoading,
    docChecklistSaving,
    docChecklistError,
    docChecklistAvailable,
    docCompletedRow,
    docIsCompleted,
    docNeededOptions,
    docNeededCount,
    selectedPaperworkStatusKey,
    documentStatusSummaryText,
    currentPaperworkSummary,
    fetchDocChecklist,
    markAllDocsCompleted,
    onToggleDocCompleted,
    onToggleDocNeeded,
    fetchPaperworkStatuses,
    fetchDeliveryMethods,
    fetchPaperworkHistory,
    savePaperworkHistory,
    loadTabData,
    formatDate,
    formatDateTime
  };
}
