<template>
  <Teleport to="body">
    <div v-if="current" class="client-alert-backdrop">
      <div
        class="client-alert-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-alert-title"
      >
        <h2 id="client-alert-title">Client Alert</h2>
        <p class="client-alert-body">{{ current.body }}</p>
        <p v-if="authorLabel" class="client-alert-meta">{{ authorLabel }}</p>
        <button type="button" class="client-alert-dismiss" :disabled="busy" @click="dismiss">
          {{ busy ? 'Dismissing…' : 'Dismiss' }}
        </button>
        <p v-if="error" class="client-alert-error" role="alert">{{ error }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { canSeeClientMessagesWindow } from '../../utils/clientAlertAccess';
import { claimClientAlertPopup, releaseClientAlertPopup } from '../../utils/clientAlertPopupClaim';

const props = defineProps({
  clientId: { type: [Number, String], default: 0 },
  disabled: { type: Boolean, default: false }
});

const authStore = useAuthStore();
const alerts = ref([]);
const busy = ref(false);
const error = ref('');
let request = 0;
const claimedId = ref(0);

const allowed = computed(() => canSeeClientMessagesWindow(authStore.user?.role) && !props.disabled);
const activeClientId = computed(() => (allowed.value ? Number(props.clientId || 0) || 0 : 0));
const current = computed(() => alerts.value[0] || null);
const authorLabel = computed(() => String(current.value?.author_name || '').trim());

function claim(id) {
  if (!claimClientAlertPopup(id)) return false;
  claimedId.value = Number(id);
  return true;
}

function release(id) {
  releaseClientAlertPopup(id);
  if (claimedId.value === Number(id)) claimedId.value = 0;
}

async function load(clientId) {
  const id = Number(clientId || 0);
  alerts.value = [];
  error.value = '';
  if (!id || !claim(id)) return;
  const token = ++request;
  try {
    const response = await api.get(`/clients/${id}/client-alerts/pending`, { skipGlobalLoading: true });
    if (token !== request || claimedId.value !== id) return;
    alerts.value = Array.isArray(response.data?.alerts) ? response.data.alerts : [];
    if (!alerts.value.length) release(id);
  } catch (e) {
    if (token !== request) return;
    const status = e?.response?.status;
    if (status === 401 || status === 403 || status === 404) {
      alerts.value = [];
      release(id);
      return;
    }
    error.value = '';
    alerts.value = [];
    release(id);
  }
}

async function dismiss() {
  const alert = current.value;
  const clientId = activeClientId.value;
  if (!alert || !clientId || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/clients/${clientId}/client-alerts/${alert.id}/dismiss`, {}, { skipGlobalLoading: true });
    alerts.value = alerts.value.filter((row) => Number(row.id) !== Number(alert.id));
    if (!alerts.value.length) release(clientId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not dismiss this client alert';
  } finally {
    busy.value = false;
  }
}

watch(activeClientId, (id, previous) => {
  if (previous && previous !== id) release(previous);
  load(id);
}, { immediate: true });

onBeforeUnmount(() => {
  request += 1;
  release(claimedId.value);
});
</script>

<style scoped>
.client-alert-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.55);
}
.client-alert-dialog {
  width: min(520px, 100%);
  background: #fff;
  color: #0f172a;
  border-radius: 14px;
  padding: 22px 22px 18px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
}
.client-alert-dialog h2 {
  margin: 0 0 10px;
  font-size: 20px;
}
.client-alert-body {
  margin: 0 0 12px;
  white-space: pre-wrap;
  line-height: 1.5;
}
.client-alert-meta,
.client-alert-error {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 13px;
}
.client-alert-error { color: #b42318; }
.client-alert-dismiss {
  border: 0;
  border-radius: 8px;
  background: #0f172a;
  color: #fff;
  font: inherit;
  font-weight: 700;
  padding: 10px 16px;
  cursor: pointer;
}
.client-alert-dismiss:disabled { opacity: 0.6; cursor: default; }
</style>
