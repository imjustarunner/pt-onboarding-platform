<template>
  <div
    v-if="enabled"
    class="beta-feedback-root"
    :class="{ 'form-open': formOpen }"
    data-beta-feedback-ui="true"
  >
    <!-- Collapsed: "Beta" pill with light blue transparent -->
    <div
      class="beta-pill-wrap"
      @mouseenter="hoverOpen = true"
      @mouseleave="hoverOpen = false"
    >
      <button
        type="button"
        class="beta-pill"
        :class="{ expanded: hoverOpen || formOpen }"
        :aria-expanded="formOpen ? 'true' : 'false'"
        @click="formOpen = !formOpen"
      >
        <span class="beta-word">Beta</span>
        <span v-if="hoverOpen && !formOpen" class="beta-expand-hint">Leave feedback</span>
      </button>
    </div>

    <!-- Expanded form modal -->
    <Transition name="beta-modal">
      <div v-if="formOpen" class="beta-modal-overlay" @click.self="formOpen = false">
        <div class="beta-modal" @click.stop>
          <div class="beta-modal-header">
            <h3>Report an Issue</h3>
            <button type="button" class="beta-modal-close" @click="formOpen = false" aria-label="Close">×</button>
          </div>

          <div class="beta-modal-body">
            <p class="beta-hint">
              Help us improve by describing what happened. Your location is captured automatically.
            </p>

            <div class="form-group">
              <label>What were you doing? <span class="required">*</span></label>
              <textarea
                v-model="description"
                rows="4"
                placeholder="e.g. I was trying to add a new client and the save button didn't work..."
              />
            </div>

            <div class="form-group auto-context">
              <label>Where you were (auto-captured)</label>
              <div class="context-row">
                <span class="context-label">Route:</span>
                <code>{{ routePath || route.name || '—' }}</code>
              </div>
              <div class="context-row">
                <span class="context-label">Page:</span>
                <span>{{ routeName || '—' }}</span>
              </div>
            </div>

            <div class="form-group">
              <label>Screenshot (optional)</label>
              <div class="screenshot-actions">
                <button type="button" class="btn btn-secondary btn-sm" @click="captureScreen" :disabled="submitting || capturing">
                  {{ capturing ? 'Capturing...' : 'Capture screen' }}
                </button>
                <label class="btn btn-secondary btn-sm file-label">
                  <input type="file" accept="image/png,image/jpeg,image/webp" @change="onFileSelect" hidden />
                  Upload file
                </label>
              </div>
              <div v-if="screenshotPreview" class="screenshot-preview">
                <img :src="screenshotPreview" alt="Screenshot preview" />
                <button type="button" class="remove-screenshot" @click="clearScreenshot" aria-label="Remove screenshot">×</button>
              </div>
            </div>

            <div v-if="submitError" class="beta-error">{{ submitError }}</div>
            <div v-if="submitSuccess" class="beta-success">Thank you! Your feedback has been submitted.</div>

            <div class="beta-actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="submitting || !description.trim()"
                @click="submit"
              >
                {{ submitting ? 'Submitting...' : 'Submit Feedback' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useBrandingStore } from '../store/branding';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
import api from '../services/api';
import html2canvas from 'html2canvas';

const route = useRoute();
const brandingStore = useBrandingStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();

const formOpen = ref(false);
const hoverOpen = ref(false);
const description = ref('');
const screenshotBlob = ref(null);
const screenshotPreview = ref(null);
const capturing = ref(false);
const submitting = ref(false);
const submitError = ref('');
const submitSuccess = ref(false);
const MAX_SCREENSHOT_BYTES = 4.5 * 1024 * 1024;
const MAX_SCREENSHOT_DIMENSION = 1920;

const enabled = computed(() => !!brandingStore.betaFeedbackEnabled);
const routePath = computed(() => route.fullPath || route.path || '');
const routeName = computed(() => route.name || '');

watch(formOpen, (open) => {
  if (open) {
    submitError.value = '';
    submitSuccess.value = false;
  } else {
    hoverOpen.value = false;
  }
});

onMounted(async () => {
  if (authStore.isAuthenticated && !brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
});

const captureScreen = async () => {
  if (capturing.value) return;
  try {
    capturing.value = true;
    submitError.value = '';
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      scale: 0.75,
      logging: false,
      // Exclude beta widget/modal so screenshots capture the underlying page context.
      ignoreElements: (el) => !!el?.closest?.('[data-beta-feedback-ui="true"]')
    });
    const captureBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', 0.82);
    });
    if (!captureBlob) {
      submitError.value = 'Could not capture screen. Try uploading a file instead.';
      return;
    }
    const optimized = await ensureUploadSizedImage(captureBlob);
    if (!optimized) {
      submitError.value = 'Screenshot is too large. Please try uploading a smaller image.';
      return;
    }
    if (screenshotPreview.value) {
      URL.revokeObjectURL(screenshotPreview.value);
    }
    screenshotBlob.value = optimized;
    screenshotPreview.value = URL.createObjectURL(optimized);
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    submitError.value = 'Could not capture screen. Try uploading a file instead.';
  } finally {
    capturing.value = false;
  }
};

const loadImageDimensions = (blob) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const width = Number(img.naturalWidth || img.width || 0);
      const height = Number(img.naturalHeight || img.height || 0);
      URL.revokeObjectURL(objectUrl);
      resolve({ width, height, image: img });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('invalid_image'));
    };
    img.src = objectUrl;
  });

const compressImageBlob = async (inputBlob, targetBytes = MAX_SCREENSHOT_BYTES) => {
  const { width, height, image } = await loadImageDimensions(inputBlob);
  if (!width || !height) return null;

  let nextWidth = width;
  let nextHeight = height;
  const maxSide = Math.max(width, height);
  if (maxSide > MAX_SCREENSHOT_DIMENSION) {
    const ratio = MAX_SCREENSHOT_DIMENSION / maxSide;
    nextWidth = Math.max(1, Math.round(width * ratio));
    nextHeight = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let quality = 0.84;
  for (let pass = 0; pass < 6; pass += 1) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    ctx.clearRect(0, 0, nextWidth, nextHeight);
    ctx.drawImage(image, 0, 0, nextWidth, nextHeight);

    // eslint-disable-next-line no-await-in-loop
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b || null), 'image/jpeg', quality);
    });
    if (!blob) return null;
    if (blob.size <= targetBytes) return blob;

    quality = Math.max(0.45, quality - 0.1);
    if (pass >= 2) {
      nextWidth = Math.max(960, Math.round(nextWidth * 0.85));
      nextHeight = Math.max(540, Math.round(nextHeight * 0.85));
    }
  }
  return null;
};

const ensureUploadSizedImage = async (blob) => {
  if (!blob) return null;
  if (blob.size <= MAX_SCREENSHOT_BYTES) return blob;
  return await compressImageBlob(blob, MAX_SCREENSHOT_BYTES);
};

const onFileSelect = async (e) => {
  const file = e?.target?.files?.[0];
  if (!file) return;
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    submitError.value = 'Please select a PNG, JPEG, or WebP image.';
    if (e?.target) e.target.value = '';
    return;
  }
  try {
    submitError.value = '';
    const optimized = await ensureUploadSizedImage(file);
    if (!optimized) {
      submitError.value = 'Image is too large to upload. Please choose a smaller screenshot.';
      if (e?.target) e.target.value = '';
      return;
    }
    if (screenshotPreview.value) {
      URL.revokeObjectURL(screenshotPreview.value);
    }
    screenshotBlob.value = optimized;
    screenshotPreview.value = URL.createObjectURL(optimized);
  } catch (err) {
    submitError.value = 'Could not process that image. Please try another screenshot.';
  } finally {
    if (e?.target) e.target.value = '';
  }
};

const clearScreenshot = () => {
  if (screenshotPreview.value) {
    URL.revokeObjectURL(screenshotPreview.value);
  }
  screenshotBlob.value = null;
  screenshotPreview.value = null;
};

const submit = async () => {
  const desc = (description.value || '').trim();
  if (!desc) return;

  submitting.value = true;
  submitError.value = '';
  submitSuccess.value = false;

  try {
    const formData = new FormData();
    formData.append('description', desc);
    formData.append('routePath', routePath.value);
    formData.append('routeName', routeName.value);

    const agency = agencyStore.currentAgency;
    const org = organizationStore.organizationContext;
    if (agency?.id) formData.append('agencyId', String(agency.id));
    if (org?.id) formData.append('organizationId', String(org.id));

    formData.append('viewportWidth', String(window.innerWidth || 0));
    formData.append('viewportHeight', String(window.innerHeight || 0));

    if (screenshotBlob.value) {
      formData.append('screenshot', screenshotBlob.value, 'screenshot.jpg');
    }

    await api.post('/beta-feedback', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    submitSuccess.value = true;
    description.value = '';
    clearScreenshot();

    setTimeout(() => {
      formOpen.value = false;
      submitSuccess.value = false;
    }, 2000);
  } catch (err) {
    submitError.value = err?.response?.data?.error?.message || err?.message || 'Failed to submit feedback';
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.beta-feedback-root {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 18000;
}

.beta-pill-wrap {
  display: inline-block;
}

.beta-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 16px;
  background: rgba(147, 197, 253, 0.25);
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 12px;
  font-weight: 600;
  font-size: 13px;
  color: #1e40af;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 64px;
}

.beta-pill:hover {
  background: rgba(147, 197, 253, 0.4);
  border-color: rgba(59, 130, 246, 0.5);
}

.beta-word {
  letter-spacing: 0.03em;
}

.beta-expand-hint {
  font-size: 11px;
  font-weight: 500;
  color: #3b82f6;
  opacity: 0.9;
}

/* Modal */
.beta-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 18100;
  padding: 20px;
}

.beta-modal {
  width: min(440px, 100%);
  max-height: 90vh;
  background: white;
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.beta-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-bottom: 1px solid #bfdbfe;
}

.beta-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #1e40af;
}

.beta-modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  color: #3b82f6;
  cursor: pointer;
  border-radius: 8px;
  line-height: 1;
}

.beta-modal-close:hover {
  background: rgba(59, 130, 246, 0.15);
}

.beta-modal-body {
  padding: 20px;
  overflow-y: auto;
}

.beta-hint {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 18px;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.form-group .required {
  color: #dc2626;
}

.form-group textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.auto-context .context-row {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
}

.context-label {
  color: var(--text-secondary);
  min-width: 50px;
}

.auto-context code {
  font-size: 12px;
  background: var(--bg-alt);
  padding: 2px 6px;
  border-radius: 4px;
  word-break: break-all;
}

.screenshot-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.file-label {
  cursor: pointer;
  margin: 0;
}

.screenshot-preview {
  position: relative;
  display: inline-block;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.screenshot-preview img {
  display: block;
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
}

.remove-screenshot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
}

.beta-error {
  font-size: 13px;
  color: #dc2626;
  margin-bottom: 12px;
}

.beta-success {
  font-size: 13px;
  color: #059669;
  margin-bottom: 12px;
}

.beta-actions {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.beta-modal-enter-active,
.beta-modal-leave-active {
  transition: opacity 0.2s ease;
}

.beta-modal-enter-active .beta-modal,
.beta-modal-leave-active .beta-modal {
  transition: transform 0.2s ease;
}

.beta-modal-enter-from,
.beta-modal-leave-to {
  opacity: 0;
}

.beta-modal-enter-from .beta-modal,
.beta-modal-leave-to .beta-modal {
  transform: scale(0.96) translateY(8px);
}
</style>
