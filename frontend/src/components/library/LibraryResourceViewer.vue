<template>
  <div class="lib-viewer" role="dialog" aria-modal="true" aria-label="Resource viewer">
    <header class="lib-viewer__bar">
      <div class="lib-viewer__titles">
        <h2>{{ resource?.name || 'Resource' }}</h2>
        <p v-if="subtitle" class="lib-viewer__sub">{{ subtitle }}</p>
      </div>
      <div class="lib-viewer__actions">
        <button
          v-if="canDistribute"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="$emit('distribute')"
        >
          Distribute…
        </button>
        <a
          v-if="isBranded"
          class="btn btn-secondary btn-sm"
          :href="pdfUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Print / PDF
        </a>
        <a
          v-if="openExternalUrl"
          class="btn btn-secondary btn-sm"
          :href="openExternalUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ isGoogle ? 'Open in Google' : 'Open in new tab' }}
        </a>
        <a
          v-if="downloadUrl && !isGoogle && resource?.resourceType === 'file'"
          class="btn btn-secondary btn-sm"
          :href="downloadUrl"
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          Download
        </a>
        <button type="button" class="btn btn-primary btn-sm" @click="$emit('close')">Close</button>
      </div>
    </header>

    <div class="lib-viewer__body">
      <div v-if="isBranded" class="lib-viewer__branded" v-html="resource?.bodyHtml || ''" />
      <iframe
        v-else-if="embedUrl"
        class="lib-viewer__frame"
        :src="embedUrl"
        :title="resource?.name || 'Preview'"
        allow="fullscreen"
      />
      <div v-else-if="isImage && imageUrl" class="lib-viewer__image-wrap">
        <img :src="imageUrl" :alt="resource?.name || 'Image'" class="lib-viewer__image" />
      </div>
      <div v-else class="lib-viewer__fallback">
        <p>Preview isn’t available for this resource in the app.</p>
        <a
          v-if="openExternalUrl"
          class="btn btn-primary"
          :href="openExternalUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open resource
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  isGoogleWorkspaceUrl,
  getGoogleWorkspacePreviewUrl,
  detectGoogleResourceLabel
} from '../../utils/googleWorkspacePreview.js';
import { libraryBrandedDocPdfUrl } from '../../services/library.js';

const props = defineProps({
  resource: { type: Object, required: true },
  canDistribute: { type: Boolean, default: false }
});

defineEmits(['close', 'distribute']);

const isBranded = computed(
  () => String(props.resource?.resourceType || '').toLowerCase() === 'branded_doc'
);

const pdfUrl = computed(() =>
  isBranded.value && props.resource?.id ? libraryBrandedDocPdfUrl(props.resource.id) : null
);

const isGoogle = computed(() => {
  const r = props.resource;
  if (!r || isBranded.value) return false;
  if (r.resourceType === 'google_doc' || r.isGoogleWorkspace) return true;
  return isGoogleWorkspaceUrl(r.externalUrl || r.previewUrl);
});

const subtitle = computed(() => {
  const r = props.resource;
  if (!r) return '';
  if (isBranded.value) return 'Branded document';
  if (isGoogle.value) return detectGoogleResourceLabel(r.externalUrl || '');
  if (r.fileType) return String(r.fileType).toUpperCase();
  if (r.resourceType === 'link') return 'External link';
  return r.mimeType || '';
});

const embedUrl = computed(() => {
  const r = props.resource;
  if (!r || isBranded.value) return null;
  if (isGoogle.value) {
    return r.previewUrl || getGoogleWorkspacePreviewUrl(r.externalUrl) || null;
  }
  if (r.resourceType === 'file' && (r.fileType === 'pdf' || String(r.mimeType || '').includes('pdf'))) {
    return r.fileUrl || r.previewUrl || null;
  }
  return null;
});

const isImage = computed(() => {
  const r = props.resource;
  if (!r || isGoogle.value || isBranded.value) return false;
  return r.fileType === 'image' || String(r.mimeType || '').startsWith('image/');
});

const imageUrl = computed(() => props.resource?.fileUrl || props.resource?.previewUrl || null);

const downloadUrl = computed(() => props.resource?.fileUrl || null);

const openExternalUrl = computed(() => {
  const r = props.resource;
  if (!r || isBranded.value) return null;
  if (r.externalUrl) return r.externalUrl;
  if (r.fileUrl) return r.fileUrl;
  return null;
});
</script>

<style scoped>
.lib-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
}

.lib-viewer__bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}

.lib-viewer__titles h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  color: #0f172a;
}

.lib-viewer__sub {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: #64748b;
}

.lib-viewer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: flex-end;
}

.lib-viewer__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #f1f5f9;
}

.lib-viewer__frame {
  width: 100%;
  height: 100%;
  min-height: 70vh;
  border: 0;
  background: #fff;
}

.lib-viewer__image-wrap {
  display: flex;
  justify-content: center;
  padding: 1.5rem;
}

.lib-viewer__image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.lib-viewer__branded {
  margin: 1rem auto;
  max-width: 816px;
  min-height: 60vh;
  padding: 1.5rem 1.75rem;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  line-height: 1.5;
}

.lib-viewer__fallback {
  padding: 3rem 1.5rem;
  text-align: center;
  color: #64748b;
}
</style>
