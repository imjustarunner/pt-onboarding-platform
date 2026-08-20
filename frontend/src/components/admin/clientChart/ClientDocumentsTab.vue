<template>
  <div class="detail-section cc-docs-tab">
    <div class="cc-enc-toolbar">
      <div class="cc-enc-toolbar__meta">
        <h3>Documents</h3>
        <p>The signed school packet, HIPAA, ROI, clinical summary, and intake answers for this client.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="refreshing" @click="refreshAll">
        {{ refreshing ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div class="cc-docs-phi-banner">
      Documentation may contain PHI. Access is logged. Only open files when you have a legitimate need.
    </div>

    <ClientDocumentsGallery
      ref="galleryRef"
      :client-id="clientId"
    />

    <details class="cc-docs-extra">
      <summary>Upload another file or open the audit trail</summary>
      <p class="hint">
        Optional. Signed packet files already appear above. Use this only when you need to attach an extra PDF or image.
      </p>
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
          <PhiDocumentsPanel
            v-if="phiSection"
            :key="`phi-${phiSection}-${clientId}`"
            :client-id="clientId"
            :highlight-document-id="effectiveHighlightId"
            :section="phiSection"
            embedded
            @docs-loaded="onDocsLoaded"
          />
        </div>
      </div>
    </details>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import PhiDocumentsPanel from '../PhiDocumentsPanel.vue';
import ClientDocumentsGallery from './ClientDocumentsGallery.vue';
import '../../../styles/client-documents-tab.css';
import '../../../styles/client-encounters-tab.css';

const props = defineProps({
  clientId: { type: Number, required: true },
  client: { type: Object, default: null },
  canEditPaperwork: { type: Boolean, default: false },
  highlightDocumentId: { type: Number, default: null },
  pendingViewKey: { type: String, default: '' }
});

const emit = defineEmits(['opened-view-key']);

const activeCategory = ref('files');
const refreshing = ref(false);
const phiStats = ref({ fileCount: 0, intakeCount: 0, ocrCount: 0 });
const galleryRef = ref(null);
const galleryHighlight = ref(null);
const statsLoaded = ref(false);

const phiSection = computed(() => {
  const map = {
    files: 'files',
    intake: 'intake',
    audit: 'audit',
    ocr: 'ocr'
  };
  return map[activeCategory.value] || null;
});

const effectiveHighlightId = computed(() => Number(galleryHighlight.value || props.highlightDocumentId || 0) || null);

const categories = computed(() => [
  { id: 'files', label: 'Extra files', count: phiStats.value.fileCount },
  { id: 'intake', label: 'Raw intake export', count: phiStats.value.intakeCount },
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

function openGalleryArtifact(viewKey) {
  if (!viewKey) return;
  galleryRef.value?.openViewKey?.(viewKey);
  emit('opened-view-key', viewKey);
}

async function loadPhiStats({ reloadGallery = false } = {}) {
  if (statsLoaded.value && !reloadGallery) return;
  try {
    const [docsR, intakeR, ocrR] = await Promise.all([
      api.get(`/phi-documents/clients/${props.clientId}`, { skipGlobalLoading: true }),
      api.get(`/phi-documents/clients/${props.clientId}/intake-responses`, { skipGlobalLoading: true }),
      api.get(`/referrals/${props.clientId}/ocr`, { skipGlobalLoading: true })
    ]);
    const docs = Array.isArray(docsR.data) ? docsR.data : [];
    const submissions = Array.isArray(intakeR.data?.submissions) ? intakeR.data.submissions : [];
    if (reloadGallery) galleryRef.value?.reload?.();
    onDocsLoaded({
      fileCount: docs.filter((d) => !d?.removed_at).length,
      intakeCount: submissions.length,
      ocrCount: (ocrR.data?.requests || []).length
    });
    statsLoaded.value = true;
  } catch {
    // optional extra-file counts can stay at zero
  }
}

async function refreshAll() {
  refreshing.value = true;
  try {
    await loadPhiStats({ reloadGallery: true });
  } finally {
    refreshing.value = false;
  }
}

async function tryOpenPending() {
  const key = String(props.pendingViewKey || '').trim();
  if (!key) return;
  await nextTick();
  openGalleryArtifact(key);
}

watch(
  () => props.highlightDocumentId,
  (id) => {
    if (Number(id || 0) > 0) activeCategory.value = 'files';
  },
  { immediate: true }
);

watch(() => props.pendingViewKey, () => { void tryOpenPending(); });

onMounted(() => {
  void loadPhiStats();
  void tryOpenPending();
});

defineExpose({ openGalleryArtifact, refreshAll });
</script>

<style scoped>
.cc-docs-extra {
  margin-top: 22px;
  padding: 12px 14px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-alt, var(--bg));
}
.cc-docs-extra summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--text-primary);
}
.cc-docs-extra .cc-docs-layout {
  margin-top: 12px;
}
</style>
