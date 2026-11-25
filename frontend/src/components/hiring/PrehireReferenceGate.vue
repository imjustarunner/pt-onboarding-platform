<template>
  <section class="reference-gate" aria-labelledby="reference-gate-title">
    <h3 id="reference-gate-title">Reference invitations</h3>
    <p v-if="checking" role="status">Checking reference invitations…</p>
    <p v-else-if="status && !status.ready">{{ status.message }}</p>
    <p v-if="!checking && status?.sendable">Send the reference portal link to {{ status.sendable === 1 ? "the remaining reference" : status.sendable + " remaining references" }} now?</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="reference-actions">
      <button v-if="status?.sendable" type="button" class="btn btn-primary" :disabled="sending || checking" @click="send">
        {{ sending ? 'Sending…' : 'Send reference portal invitations' }}
      </button>
      <button v-if="!checking && !status?.ready" type="button" class="btn btn-secondary" :disabled="sending"
        @click="status ? emit('references') : check()">{{ status ? 'Open references' : 'Retry check' }}</button>
      <button v-if="cancellable" type="button" class="btn btn-secondary" :disabled="sending" @click="emit('cancel')">Not now</button>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ userId: Number, agencyId: Number, cancellable: Boolean });
const emit = defineEmits(['ready', 'references', 'cancel']);
const base = computed(() => '/hiring/candidates/' + props.userId);
const options = () => ({ params: { agencyId: props.agencyId }, skipGlobalLoading: true });
const checking = ref(true);
const sending = ref(false);
const status = ref(null);
const error = ref('');
let generation = 0;
onBeforeUnmount(() => { generation++; });

async function check() {
  const request = ++generation;
  checking.value = true;
  try {
    const { data } = await api.get(base.value + '/prehire-reference-status', options());
    if (request !== generation) return;
    if (typeof data?.ready !== 'boolean') throw new Error('Invalid reference status');
    status.value = data;
    if (data.ready) emit('ready');
  } catch (cause) {
    if (request === generation) {
      status.value = null;
      error.value = cause.response?.data?.error?.message || 'Could not check reference invitations.';
    }
  } finally {
    if (request === generation) checking.value = false;
  }
}

async function send() {
  if (sending.value || !status.value?.sendable) return;
  const request = generation;
  sending.value = true;
  error.value = '';
  try {
    const { data } = await api.post(base.value + '/reference-requests/send', { onlyIfNotSent: true }, options());
    if (request !== generation) return;
    error.value = (data.errors || []).join(' ');
  } catch (cause) {
    if (request === generation) error.value = cause.response?.data?.error?.message || 'Could not send the reference portal invitations.';
  } finally {
    if (request === generation) {
      sending.value = false;
      await check();
    }
  }
}
watch(() => [props.userId, props.agencyId], () => {
  status.value = null;
  error.value = '';
  sending.value = false;
  void check();
}, { immediate: true });
</script>

<style scoped>
.reference-gate { padding: 1rem; border: 1px solid #d4e0d8; border-radius: 12px; background: #f3f7f3; color: #203e34; }
.reference-gate h3 { margin: 0; font-size: 1.05rem; }
.reference-actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
