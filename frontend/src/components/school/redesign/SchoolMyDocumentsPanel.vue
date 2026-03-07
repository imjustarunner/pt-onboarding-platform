<template>
  <section class="my-docs-wrap">
    <header class="my-docs-header">
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

    <div class="waiver-card">
      <div class="waiver-top">
        <div>
          <div class="waiver-title">School Staff Waiver</div>
          <div class="waiver-sub">
            Required for pilot school staff access.
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
          v-if="required && taskId"
          type="button"
          class="btn btn-primary"
          @click="openSigning"
        >
          {{ isSigned ? 'View signed waiver' : 'Review and sign waiver' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../../services/api';

const props = defineProps({
  organizationId: {
    type: [Number, String],
    default: null
  }
});

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const resetting = ref(false);
const error = ref('');
const status = ref(null);

const taskId = computed(() => Number(status.value?.taskId || 0) || null);
const required = computed(() => Boolean(status.value?.required));
const isSigned = computed(() => Boolean(status.value?.isSigned));
const pilotEnabled = computed(() => Boolean(status.value?.pilotEnabled));
const showPilotResetButton = computed(() => pilotEnabled.value && required.value);

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
  }
};

const openSigning = async () => {
  await loadStatus();
  const latestTaskId = Number(status.value?.taskId || 0) || null;
  const latestSigned = Boolean(status.value?.isSigned);
  if (!latestTaskId) return;
  if (latestSigned) {
    const viewUrl = `${api.defaults?.baseURL || '/api'}/document-signing/${latestTaskId}/view`;
    window.open(viewUrl, '_blank', 'noopener');
    return;
  }
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const returnTo = orgSlug ? `/${orgSlug}/dashboard?sp=documents` : '/dashboard?sp=documents';
  await router.push({
    path: orgSlug
      ? `/${orgSlug}/tasks/documents/${latestTaskId}/sign`
      : `/tasks/documents/${latestTaskId}/sign`,
    query: {
      returnTo
    }
  });
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

watch(
  () => props.organizationId,
  () => {
    loadStatus();
  }
);

onMounted(() => {
  loadStatus();
});
</script>

<style scoped>
.my-docs-wrap {
  display: grid;
  gap: 12px;
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
</style>

