<template>
  <section class="my-docs-wrap" :class="{ 'my-docs-wrap--splash': splashMode }" data-tour="school-staff-docs-panel">
    <header v-if="!splashMode" class="my-docs-header">
      <h2>School Staff Documents</h2>
      <div class="header-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadStatus">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
        <button
          v-if="showPilotResetButton"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="loading || resetting"
          @click="resetForTesting"
        >
          {{ resetting ? 'Resetting...' : 'Reset for testing' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="error-block">
      {{ error }}
    </div>

    <div class="waiver-card" :class="{ 'waiver-card--splash': splashMode }">
      <div class="waiver-top">
        <div>
          <div class="waiver-title">School Staff Waiver</div>
          <div class="waiver-sub">
            Required for school staff portal access.
          </div>
        </div>
        <span class="status-pill" :class="statusClass">{{ statusLabel }}</span>
      </div>

      <p v-if="required && !isSigned" class="waiver-note">
        You must sign this waiver before using other school portal sections.
      </p>
      <p v-else-if="required && isSigned" class="waiver-note">
        Signed. This document remains available in your account for reference.
      </p>
      <p v-else class="waiver-note">
        No waiver action is required for this account right now.
      </p>

      <div class="actions">
        <button
          v-if="required && taskId && !isSigned"
          type="button"
          class="btn btn-primary waiver-cta"
          :class="{ 'waiver-cta-pulse': shouldPulseCta }"
          :disabled="loading"
          @click="openSigning"
        >
          {{ loading ? 'Loading…' : 'Review and sign waiver' }}
        </button>
        <button
          v-if="required && taskId && isSigned"
          type="button"
          class="btn btn-primary waiver-cta"
          :disabled="waitingForPdf"
          @click="viewSignedWaiver"
        >
          {{ waitingForPdf ? 'Preparing signed PDF...' : 'View signed waiver' }}
        </button>
        <button
          v-if="required && taskId && isSigned"
          type="button"
          class="btn btn-secondary"
          :disabled="waitingForPdf"
          @click="downloadSignedWaiver"
        >
          {{ waitingForPdf ? 'Preparing signed PDF...' : 'Download PDF' }}
        </button>
      </div>

      <div
        v-if="showWaiverHintToast && !splashMode"
        class="waiver-hint-toast"
        role="status"
        aria-live="polite"
      >
        <div class="waiver-hint-title">Action needed</div>
        <div class="waiver-hint-body">
          Click <strong>Review and sign waiver</strong> to unlock full school portal access.
        </div>
        <div class="waiver-hint-actions">
          <button type="button" class="btn btn-primary btn-sm" @click="openSigning">Go sign now</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="dismissWaiverHint">Dismiss</button>
        </div>
      </div>

      <div v-if="splashMode" class="splash-secondary-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadStatus">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
        <button
          v-if="showPilotResetButton"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="loading || resetting"
          @click="resetForTesting"
        >
          {{ resetting ? 'Resetting...' : 'Reset for testing' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../../services/api';

const props = defineProps({
  organizationId: {
    type: [Number, String],
    default: null
  },
  /** Compact layout for the blocking waiver splash */
  splashMode: {
    type: Boolean,
    default: false
  }
});

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const resetting = ref(false);
const error = ref('');
const status = ref(null);
const waitingForPdf = ref(false);
const hasClickedWaiverCta = ref(false);
const showWaiverHintToast = ref(false);
const waiverHintDismissed = ref(false);
let waiverHintTimer = null;

const taskId = computed(() => Number(status.value?.taskId || 0) || null);
const required = computed(() => Boolean(status.value?.required));
const isSigned = computed(() => Boolean(status.value?.isSigned));
const pilotEnabled = computed(() => Boolean(status.value?.pilotEnabled));
const showPilotResetButton = computed(() => pilotEnabled.value && required.value);
const shouldPulseCta = computed(() => required.value && !isSigned.value);
const signedPdfReady = computed(() => Boolean(status.value?.signedPdfReady));

const statusLabel = computed(() => {
  if (!required.value) return 'Not required';
  return isSigned.value ? 'Signed' : 'Pending signature';
});

const statusClass = computed(() => {
  if (!required.value) return 'status-idle';
  return isSigned.value ? 'status-signed' : 'status-pending';
});

const loadStatus = async () => {
  const orgId = Number(props.organizationId || 0);
  if (!orgId) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get(`/school-portal/${orgId}/school-staff-waiver/status`);
    status.value = response?.data || null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load document status.';
  } finally {
    loading.value = false;
    scheduleWaiverHintIfNeeded();
  }
};

const openSigning = async () => {
  hasClickedWaiverCta.value = true;
  showWaiverHintToast.value = false;
  clearWaiverHintTimer();
  await loadStatus();
  const latestTaskId = Number(status.value?.taskId || 0) || null;
  const latestSigned = Boolean(status.value?.isSigned);
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const returnTo = orgSlug ? `/${orgSlug}/dashboard?sp=documents` : '/dashboard?sp=documents';
  if (!latestTaskId) {
    error.value = 'Waiver task is not ready yet. Click Refresh, then try again.';
    return;
  }
  try {
    if (latestSigned) {
      if (orgSlug) {
        await router.push({
          name: 'OrganizationDocumentReview',
          params: { organizationSlug: orgSlug, taskId: String(latestTaskId) },
          query: { returnTo }
        });
      } else {
        await router.push({
          name: 'DocumentReview',
          params: { taskId: String(latestTaskId) },
          query: { returnTo }
        });
      }
      return;
    }
    if (orgSlug) {
      await router.push({
        name: 'OrganizationDocumentSigning',
        params: { organizationSlug: orgSlug, taskId: String(latestTaskId) },
        query: { returnTo }
      });
    } else {
      await router.push({
        name: 'DocumentSigning',
        params: { taskId: String(latestTaskId) },
        query: { returnTo }
      });
    }
  } catch (e) {
    error.value = e?.message || 'Could not open the waiver signing page. Please try again.';
  }
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const waitForSignedPdfReady = async ({ attempts = 6, delayMs = 1200 } = {}) => {
  if (!isSigned.value) return false;
  if (signedPdfReady.value) return true;
  waitingForPdf.value = true;
  try {
    for (let i = 0; i < attempts; i += 1) {
      await sleep(delayMs);
      await loadStatus();
      if (signedPdfReady.value) return true;
    }
    return false;
  } finally {
    waitingForPdf.value = false;
  }
};

const signedWaiverApiPath = (latestTaskId, mode = 'view') => {
  const id = Number(latestTaskId || 0);
  if (!id) return '';
  return `${api.defaults?.baseURL || '/api'}/document-signing/${id}/${mode === 'download' ? 'download' : 'view'}`;
};

const viewSignedWaiver = async () => {
  await loadStatus();
  const latestTaskId = Number(status.value?.taskId || 0) || null;
  if (!latestTaskId) return;
  const ready = await waitForSignedPdfReady();
  if (!ready) {
    error.value = 'Signed PDF is still being prepared. Please try again in a few seconds.';
    return;
  }
  const url = signedWaiverApiPath(latestTaskId, 'view');
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const downloadSignedWaiver = async () => {
  await loadStatus();
  const latestTaskId = Number(status.value?.taskId || 0) || null;
  if (!latestTaskId) return;
  const ready = await waitForSignedPdfReady();
  if (!ready) {
    error.value = 'Signed PDF is still being prepared. Please try again in a few seconds.';
    return;
  }
  const url = signedWaiverApiPath(latestTaskId, 'download');
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const resetForTesting = async () => {
  const orgId = Number(props.organizationId || 0);
  if (!orgId) return;
  const ok = window.confirm('Reset this waiver to unsigned for local pilot testing?');
  if (!ok) return;
  resetting.value = true;
  error.value = '';
  try {
    const response = await api.post(`/school-portal/${orgId}/school-staff-waiver/reset`);
    status.value = response?.data || null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to reset waiver status.';
  } finally {
    resetting.value = false;
  }
};

const clearWaiverHintTimer = () => {
  if (waiverHintTimer) {
    window.clearTimeout(waiverHintTimer);
    waiverHintTimer = null;
  }
};

const scheduleWaiverHintIfNeeded = () => {
  clearWaiverHintTimer();
  if (!required.value || isSigned.value || hasClickedWaiverCta.value || waiverHintDismissed.value) {
    showWaiverHintToast.value = false;
    return;
  }
  waiverHintTimer = window.setTimeout(() => {
    if (!required.value || isSigned.value || hasClickedWaiverCta.value || waiverHintDismissed.value) return;
    showWaiverHintToast.value = true;
  }, 30000);
};

const dismissWaiverHint = () => {
  waiverHintDismissed.value = true;
  showWaiverHintToast.value = false;
  clearWaiverHintTimer();
};

watch(
  () => props.organizationId,
  () => {
    hasClickedWaiverCta.value = false;
    waiverHintDismissed.value = false;
    showWaiverHintToast.value = false;
    loadStatus();
  }
);

watch([required, isSigned], () => {
  if (isSigned.value) {
    showWaiverHintToast.value = false;
    clearWaiverHintTimer();
    return;
  }
  scheduleWaiverHintIfNeeded();
});

onMounted(() => {
  loadStatus();
});

onBeforeUnmount(() => {
  clearWaiverHintTimer();
});
</script>

<style scoped>
.my-docs-wrap {
  display: grid;
  gap: 12px;
}
.my-docs-wrap--splash {
  gap: 10px;
}
.waiver-card--splash {
  border-color: rgba(47, 143, 131, 0.28);
  background: linear-gradient(180deg, #f8fffd 0%, #fff 55%);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.my-docs-wrap--splash .waiver-cta {
  width: 100%;
  min-height: 48px;
  font-size: 1rem;
  font-weight: 800;
}
.my-docs-wrap--splash .header-actions,
.my-docs-wrap--splash .actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.splash-secondary-actions {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.my-docs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.my-docs-header h2 {
  margin: 0;
  color: #1d2633;
}

.waiver-card {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}

.waiver-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.waiver-title {
  font-weight: 700;
  color: #1d2633;
}

.waiver-sub {
  margin-top: 2px;
  color: #475569;
  font-size: 13px;
}

.waiver-note {
  margin: 10px 0 0;
  color: #334155;
}

.actions {
  margin-top: 12px;
  position: relative;
}

.waiver-cta {
  position: relative;
}

.waiver-cta-pulse {
  animation: waiverPulse 1.8s ease-in-out infinite;
}

@keyframes waiverPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.45);
  }
  70% {
    box-shadow: 0 0 0 12px rgba(59, 130, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.waiver-hint-toast {
  margin-top: 10px;
  max-width: 460px;
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.96);
  color: #1e3a8a;
  padding: 10px 12px;
  position: relative;
}

.waiver-hint-toast::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 22px;
  width: 14px;
  height: 14px;
  transform: rotate(45deg);
  border-left: 1px solid rgba(59, 130, 246, 0.35);
  border-top: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.96);
}

.waiver-hint-title {
  font-weight: 800;
}

.waiver-hint-body {
  margin-top: 4px;
  font-size: 13px;
}

.waiver-hint-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.status-pill {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid transparent;
}

.status-idle {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.4);
  color: #334155;
}

.status-pending {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  color: #92400e;
}

.status-signed {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.4);
  color: #166534;
}

.error-block {
  border-radius: 10px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: #991b1b;
  padding: 10px 12px;
}

:global([data-theme="dark"]) .my-docs-header h2,
:global([data-theme="dark"]) .waiver-title {
  color: #e2e8f0;
}
</style>

