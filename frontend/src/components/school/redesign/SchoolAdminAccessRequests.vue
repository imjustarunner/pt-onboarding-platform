<template>
  <section v-if="state && (state.canRequest || state.requests.length)" class="admin-requests">
    <h3>School Admin access</h3>
    <p v-if="state.canRequest">This school has no active School Admin. Request access to manage school staff; an agency admin, superadmin, or Support team member will review it.</p>
    <button v-if="state.canRequest && !pending" :disabled="busy" type="button" @click="requestAccess">Request School Admin access</button>
    <p v-if="pending && !state.canReview" role="status">Your request is awaiting review. Your permissions will change only after approval.</p>
    <article v-for="request in state.requests" :key="request.id">
      <p><strong>{{ state.canReview ? request.requester_name : 'Your request' }}</strong> — {{ request.status }}</p>
      <p v-if="state.canReview">{{ request.requester_email }}</p>
      <p v-if="request.review_note">{{ request.review_note }}</p>
      <template v-if="state.canReview && request.status === 'pending'">
        <label>Review note (optional)<input v-model="notes[request.id]" maxlength="500" :disabled="busy" /></label>
        <button type="button" :disabled="busy || state.hasAdmin" @click="review(request.id, 'approve')">Approve School Admin</button>
        <button type="button" :disabled="busy" @click="review(request.id, 'deny')">Deny request</button>
      </template>
    </article>
  </section>
  <p v-if="error" role="alert">{{ error }}</p>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../../services/api';
const props = defineProps({ schoolOrganizationId: { type: Number, required: true } });
const emit = defineEmits(['approved']);
const state = ref(null), error = ref(''), busy = ref(false), notes = ref({});
let generation = 0;
const pending = computed(() => state.value?.requests.some(request => request.status === 'pending'));
const base = () => `/school-portal/${props.schoolOrganizationId}/school-admin-requests`;
async function load() {
  const current = ++generation;
  try {
    const response = await api.get(base(), { skipGlobalLoading: true });
    if (current === generation) state.value = { ...response.data, requests: Array.isArray(response.data?.requests) ? response.data.requests : [] };
  } catch (e) {
    if (current === generation) error.value = e?.response?.data?.error?.message || 'Unable to load School Admin requests.';
  }
}
async function mutate(action, approved = false) {
  if (busy.value) return;
  const schoolId = props.schoolOrganizationId;
  busy.value = true; error.value = '';
  try {
    await action();
    if (schoolId !== props.schoolOrganizationId) return;
    await load();
    if (approved) emit('approved');
  } catch (e) {
    if (schoolId === props.schoolOrganizationId) error.value = e?.response?.data?.error?.message || 'Unable to save the request. Please try again.';
  } finally { busy.value = false; }
}
const requestAccess = () => mutate(() => api.post(base()));
const review = (requestId, decision) => mutate(() => api.patch(`${base()}/${requestId}`, { decision, note: notes.value[requestId] || '' }), decision === 'approve');
watch(() => props.schoolOrganizationId, () => { state.value = null; error.value = ''; notes.value = {}; load(); }, { immediate: true });
</script>

<style scoped>
.admin-requests { padding:20px; margin-bottom:20px; border:1px solid #c6ddd5; border-radius:12px; background:#f4faf7; }
article { border-top:1px solid #c6ddd5; margin-top:12px; padding-top:8px; }
label { display:block; margin-bottom:12px; }
input { display:block; width:min(100%,480px); padding:8px; }
button { margin:0 8px 8px 0; padding:9px 14px; border:1px solid #32705d; border-radius:6px; cursor:pointer; }
button:disabled { opacity:.6; cursor:default; }
[role=alert] { color:#a11; }
</style>
