<template>
  <div class="detail-section cc-docs-tab">
    <div class="cc-enc-toolbar">
      <div class="cc-enc-toolbar__meta">
        <h3>Documents</h3>
        <p>Packet status, uploaded files, intake responses, and audit trail.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="refreshing" @click="refreshAll">
        {{ refreshing ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div class="cc-docs-phi-banner">
      Documentation may contain PHI. Access is logged. Only open files when you have a legitimate need.
    </div>

    <div class="cc-docs-kpi-row">
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">Files on file</div>
        <div class="cc-enc-kpi__value">{{ phiStats.fileCount }}</div>
      </div>
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">Items needed</div>
        <div class="cc-enc-kpi__value" :class="{ 'cc-enc-kpi__value--warn': docNeededCount > 0 }">
          {{ docNeededCount }}
        </div>
      </div>
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">Checklist</div>
        <div class="cc-enc-kpi__value" :class="{ 'cc-enc-kpi__value--ok': docIsCompleted }">
          {{ docIsCompleted ? 'Complete' : (documentStatusSummaryText || currentPaperworkSummary.statusLabel) }}
        </div>
      </div>
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">Last status update</div>
        <div class="cc-enc-kpi__value" style="font-size: 15px;">
          {{ currentPaperworkSummary.effectiveDateText }}
        </div>
      </div>
    </div>

    <div class="cc-docs-layout">
      <nav class="cc-docs-sidebar" aria-label="Document categories">
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="cc-docs-nav-btn"
          :class="{ 'cc-docs-nav-btn--active': activeCategory === cat.id }"
          @click="activeCategory = cat.id"
        >
          <span>{{ cat.label }}</span>
          <span v-if="cat.count != null && cat.count > 0" class="cc-docs-nav-count">{{ cat.count }}</span>
        </button>
      </nav>

      <div class="cc-docs-main">
        <!-- Overview -->
        <template v-if="activeCategory === 'overview'">
          <section class="cc-docs-panel">
            <h4 class="cc-docs-panel__title">Packet status</h4>
            <p class="cc-docs-panel__hint">
              Checked = needed. Unchecked = received. When all are received, status becomes completed.
            </p>
            <div v-if="docChecklistLoading" class="muted">Loading checklist…</div>
            <div v-else-if="docChecklistError" class="error">{{ docChecklistError }}</div>
            <template v-else-if="docChecklistItems.length">
              <div v-for="it in docChecklistItems" :key="String(it.status_key || it.paperwork_status_id)" class="cc-docs-check-row">
                <label class="cc-docs-check-left">
                  <input
                    v-if="it.status_key !== 'completed'"
                    type="checkbox"
                    :disabled="!canEditPaperwork || docChecklistSaving"
                    :checked="!!it.is_needed"
                    @change="onToggleDocNeeded(it, $event)"
                  />
                  <input
                    v-else
                    type="checkbox"
                    :disabled="!canEditPaperwork || docChecklistSaving"
                    :checked="!!it.is_completed"
                    @change="onToggleDocCompleted($event)"
                  />
                  <span>{{ it.label }}</span>
                </label>
                <div>
                  <span v-if="it.status_key === 'completed'" class="badge badge-success">Auto</span>
                  <span v-else-if="it.is_needed" class="badge badge-warning">Needed</span>
                  <span v-else class="badge badge-secondary">Received</span>
                </div>
              </div>
            </template>
            <p v-else class="cc-docs-empty">Checklist not available yet or no statuses configured.</p>
          </section>

          <section v-if="paperworkHistory.length" class="cc-docs-panel">
            <h4 class="cc-docs-panel__title">Recent status history</h4>
            <div class="cc-docs-history">
              <div v-for="h in paperworkHistory.slice(0, 3)" :key="h.id" class="cc-docs-history-item">
                <div class="cc-docs-history-time">{{ formatDate(h.effective_date) }}</div>
                <div>
                  <strong>{{ h.paperwork_status_label || '—' }}</strong>
                  <div class="muted tiny">Delivery: {{ h.paperwork_delivery_method_label || '—' }}</div>
                </div>
              </div>
            </div>
            <button type="button" class="cc-btn-soft" style="margin-top: 8px;" @click="activeCategory = 'history'">
              View full history →
            </button>
          </section>
        </template>

        <!-- Checklist -->
        <section v-else-if="activeCategory === 'checklist'" class="cc-docs-panel">
          <h4 class="cc-docs-panel__title">Document status checklist</h4>
          <p class="cc-docs-panel__hint">
            Record what is needed or received without uploading a file.
          </p>
          <div v-if="docChecklistLoading" class="muted">Loading…</div>
          <div v-else-if="docChecklistError" class="error">{{ docChecklistError }}</div>
          <template v-else-if="docChecklistItems.length">
            <div v-for="it in docChecklistItems" :key="String(it.status_key || it.paperwork_status_id)" class="cc-docs-check-row">
              <label class="cc-docs-check-left">
                <input
                  v-if="it.status_key !== 'completed'"
                  type="checkbox"
                  :disabled="!canEditPaperwork || docChecklistSaving"
                  :checked="!!it.is_needed"
                  @change="onToggleDocNeeded(it, $event)"
                />
                <input
                  v-else
                  type="checkbox"
                  :disabled="!canEditPaperwork || docChecklistSaving"
                  :checked="!!it.is_completed"
                  @change="onToggleDocCompleted($event)"
                />
                <span>{{ it.label }}</span>
              </label>
              <div>
                <span v-if="it.status_key === 'completed'" class="badge badge-success">Auto</span>
                <span v-else-if="it.is_needed" class="badge badge-warning">Needed</span>
                <span v-else class="badge badge-secondary">Received</span>
                <span v-if="it.received_at && !it.is_needed" class="muted tiny" style="margin-left: 8px;">
                  {{ formatDateTime(it.received_at) }}
                </span>
              </div>
            </div>
          </template>
          <p v-else class="cc-docs-empty">Checklist not available yet.</p>
        </section>

        <!-- History + status form -->
        <template v-else-if="activeCategory === 'history'">
          <section class="cc-docs-panel">
            <h4 class="cc-docs-panel__title">Current paperwork status</h4>
            <div class="cc-docs-info-grid">
              <div class="cc-docs-info-item">
                <label>Current status</label>
                <div class="info-value">{{ currentPaperworkSummary.statusLabel }}</div>
              </div>
              <div class="cc-docs-info-item">
                <label>Delivery method</label>
                <div class="info-value">{{ currentPaperworkSummary.deliveryLabel }}</div>
              </div>
              <div class="cc-docs-info-item">
                <label>Effective date</label>
                <div class="info-value">{{ currentPaperworkSummary.effectiveDateText }}</div>
              </div>
              <div v-if="currentPaperworkSummary.roiExpiresAtText" class="cc-docs-info-item">
                <label>ROI expires</label>
                <div class="info-value">
                  {{ currentPaperworkSummary.roiExpiresAtText }}
                  <span v-if="currentPaperworkSummary.roiExpired" class="cc-docs-roi-warn"> (Expired)</span>
                </div>
              </div>
            </div>
          </section>

          <section v-if="canEditPaperwork" class="cc-docs-panel">
            <h4 class="cc-docs-panel__title">Record status update</h4>
            <div class="filters-row" style="flex-wrap: wrap;">
              <div class="filters-group" style="min-width: 220px; flex: 1;">
                <label class="filters-label">Paperwork status *</label>
                <select v-model="paperworkForm.paperworkStatusId" class="filters-select">
                  <option value="">Select…</option>
                  <option v-for="s in paperworkStatuses" :key="s.id" :value="String(s.id)">{{ s.label }}</option>
                </select>
              </div>
              <div class="filters-group" style="min-width: 220px; flex: 1;">
                <label class="filters-label">Document delivery method</label>
                <select v-model="paperworkForm.deliveryMethodId" class="filters-select" :disabled="!deliveryMethods.length">
                  <option value="">—</option>
                  <option v-for="m in deliveryMethods" :key="m.id" :value="String(m.id)">{{ m.label }}</option>
                </select>
              </div>
              <div class="filters-group" style="min-width: 180px;">
                <label class="filters-label">Effective date *</label>
                <input v-model="paperworkForm.effectiveDate" type="date" class="filters-input" />
              </div>
            </div>
            <div v-if="selectedPaperworkStatusKey === 'roi'" class="filters-row" style="margin-top: 10px;">
              <div class="filters-group" style="min-width: 220px; flex: 1;">
                <label class="filters-label">ROI expiration date *</label>
                <input v-model="paperworkForm.roiExpiresAt" type="date" class="filters-input" />
              </div>
            </div>
            <div class="filters-row" style="margin-top: 10px;">
              <div class="filters-group" style="flex: 1;">
                <label class="filters-label">Note</label>
                <input v-model="paperworkForm.note" type="text" class="filters-input" placeholder="Optional note" />
              </div>
              <div class="actions" style="align-self: end;">
                <button class="btn btn-primary" type="button" :disabled="savingPaperwork" @click="savePaperworkHistory">
                  {{ savingPaperwork ? 'Saving…' : 'Save status update' }}
                </button>
              </div>
            </div>
            <div v-if="paperworkError" class="error" style="margin-top: 10px;">{{ paperworkError }}</div>
          </section>

          <section class="cc-docs-panel">
            <h4 class="cc-docs-panel__title">Status history</h4>
            <div v-if="paperworkHistoryLoading" class="muted">Loading document history…</div>
            <div v-else-if="paperworkHistoryError" class="error">{{ paperworkHistoryError }}</div>
            <div v-else-if="!paperworkHistory.length" class="cc-docs-empty">No document history yet.</div>
            <div v-else class="cc-docs-history">
              <div v-for="h in paperworkHistory" :key="h.id" class="cc-docs-history-item">
                <div class="cc-docs-history-time">{{ formatDate(h.effective_date) }}</div>
                <div>
                  <strong>{{ h.paperwork_status_label || '—' }}</strong>
                  <div class="muted tiny">
                    Delivery: {{ h.paperwork_delivery_method_label || '—' }}
                    <span v-if="h.changed_by_name"> · by {{ h.changed_by_name }}</span>
                  </div>
                  <div v-if="h.roi_expires_at" class="muted tiny">ROI expires: {{ formatDate(h.roi_expires_at) }}</div>
                  <div v-if="h.note" class="muted tiny">Note: {{ h.note }}</div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <!-- PHI sections via embedded panel -->
        <PhiDocumentsPanel
          v-else-if="phiSection"
          :key="`phi-${phiSection}-${clientId}`"
          :client-id="clientId"
          :highlight-document-id="highlightDocumentId"
          :section="phiSection"
          embedded
          @docs-loaded="onDocsLoaded"
        />
      </div>

      <aside class="cc-docs-rail">
        <div class="cc-docs-rail-card">
          <h4>Status snapshot</h4>
          <div class="cc-docs-rail-row">
            <span class="cc-docs-rail-row__label">Status</span>
            <span class="cc-docs-rail-row__value">{{ currentPaperworkSummary.statusLabel }}</span>
          </div>
          <div class="cc-docs-rail-row">
            <span class="cc-docs-rail-row__label">Delivery</span>
            <span class="cc-docs-rail-row__value">{{ currentPaperworkSummary.deliveryLabel }}</span>
          </div>
          <div class="cc-docs-rail-row">
            <span class="cc-docs-rail-row__label">Effective</span>
            <span class="cc-docs-rail-row__value">{{ currentPaperworkSummary.effectiveDateText }}</span>
          </div>
          <div v-if="currentPaperworkSummary.roiExpiresAtText" class="cc-docs-rail-row">
            <span class="cc-docs-rail-row__label">ROI expires</span>
            <span class="cc-docs-rail-row__value" :class="{ 'cc-docs-roi-warn': currentPaperworkSummary.roiExpired }">
              {{ currentPaperworkSummary.roiExpiresAtText }}
            </span>
          </div>
        </div>

        <div class="cc-docs-rail-card">
          <h4>Quick actions</h4>
          <div class="cc-docs-quick-actions">
            <button type="button" class="cc-btn-soft" @click="activeCategory = 'files'">
              Upload / view files
            </button>
            <button
              v-if="canEditPaperwork && !docIsCompleted"
              type="button"
              class="cc-btn-soft"
              :disabled="docChecklistSaving"
              @click="markAllDocsCompleted"
            >
              Mark checklist complete
            </button>
            <button type="button" class="cc-btn-soft" @click="activeCategory = 'history'">
              Record status update
            </button>
          </div>
        </div>

        <div class="cc-docs-rail-card">
          <h4>On file</h4>
          <div class="cc-docs-rail-row">
            <span class="cc-docs-rail-row__label">PHI files</span>
            <span class="cc-docs-rail-row__value">{{ phiStats.fileCount }}</span>
          </div>
          <div class="cc-docs-rail-row">
            <span class="cc-docs-rail-row__label">Intake responses</span>
            <span class="cc-docs-rail-row__value">{{ phiStats.intakeCount }}</span>
          </div>
          <div class="cc-docs-rail-row">
            <span class="cc-docs-rail-row__label">OCR requests</span>
            <span class="cc-docs-rail-row__value">{{ phiStats.ocrCount }}</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import PhiDocumentsPanel from '../PhiDocumentsPanel.vue';
import '../../../styles/client-documents-tab.css';
import '../../../styles/client-encounters-tab.css';

const props = defineProps({
  clientId: { type: Number, required: true },
  canEditPaperwork: { type: Boolean, default: false },
  highlightDocumentId: { type: Number, default: null }
});

const paperwork = inject('clientPaperwork');
if (!paperwork) {
  throw new Error('ClientDocumentsTab requires clientPaperwork provider');
}

const {
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
  docIsCompleted,
  docNeededCount,
  selectedPaperworkStatusKey,
  documentStatusSummaryText,
  currentPaperworkSummary,
  onToggleDocCompleted,
  onToggleDocNeeded,
  markAllDocsCompleted,
  savePaperworkHistory,
  loadTabData,
  formatDate,
  formatDateTime
} = paperwork;

const activeCategory = ref('overview');
const refreshing = ref(false);
const phiStats = ref({ fileCount: 0, intakeCount: 0, ocrCount: 0 });

const phiSection = computed(() => {
  const map = {
    files: 'files',
    intake: 'intake',
    audit: 'audit',
    ocr: 'ocr'
  };
  return map[activeCategory.value] || null;
});

const categories = computed(() => [
  { id: 'overview', label: 'Overview' },
  { id: 'checklist', label: 'Packet checklist', count: docNeededCount.value },
  { id: 'files', label: 'Files & upload', count: phiStats.value.fileCount },
  { id: 'history', label: 'Status history' },
  { id: 'intake', label: 'Intake responses', count: phiStats.value.intakeCount },
  { id: 'audit', label: 'Audit trail' },
  { id: 'ocr', label: 'Extracted text', count: phiStats.value.ocrCount }
]);

function onDocsLoaded(stats) {
  phiStats.value = {
    fileCount: Number(stats?.fileCount || 0),
    intakeCount: Number(stats?.intakeCount || 0),
    ocrCount: Number(stats?.ocrCount || 0)
  };
}

async function loadPhiStats() {
  try {
    const [docsR, intakeR, ocrR] = await Promise.all([
      api.get(`/phi-documents/clients/${props.clientId}`, { skipGlobalLoading: true }),
      api.get(`/phi-documents/clients/${props.clientId}/intake-responses`, { skipGlobalLoading: true }),
      api.get(`/referrals/${props.clientId}/ocr`, { skipGlobalLoading: true })
    ]);
    const docs = Array.isArray(docsR.data) ? docsR.data : [];
    onDocsLoaded({
      fileCount: docs.filter((d) => !d?.removed_at).length,
      intakeCount: (intakeR.data?.submissions || []).length,
      ocrCount: (ocrR.data?.requests || []).length
    });
  } catch {
    // KPI row can stay at zero until a section loads
  }
}

async function refreshAll() {
  refreshing.value = true;
  try {
    await Promise.all([loadTabData(), loadPhiStats()]);
  } finally {
    refreshing.value = false;
  }
}

watch(
  () => props.highlightDocumentId,
  (id) => {
    if (Number(id || 0) > 0) activeCategory.value = 'files';
  },
  { immediate: true }
);

onMounted(() => {
  void loadTabData();
  void loadPhiStats();
});
</script>

<style scoped>
.muted { color: var(--text-secondary, #64748b); }
.tiny { font-size: 12px; }
.error { color: #b91c1c; }
</style>
