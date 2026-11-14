<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { commentApi } from './sessionComments';
import FamilySharingNotice from './FamilySharingNotice.vue';
const props = defineProps({ threadId: [Number, String], agencyId: [Number, String], clientId: [Number, String], personKey: String, meId: [Number, String], required: Boolean, scopeKey: [Number, String] });
const api = inject('secureSessionCommentsApi', commentApi), record = ref(null), loading = ref(false), error = ref(''), notice = ref(null), reviewNeeded = ref(false), reviewed = ref(false); let generation = 0;
const serviceId = ref(0), services = ref([]);
const participantId = p => Number(p.id || p.userId || p.user_id);
const participants = computed(() => record.value?.participants || []);
const recipientUserIds = computed(() => [...new Set(participants.value.map(participantId).filter(id => id > 0 && id !== Number(props.meId)))]);
const shared = computed(() => !!record.value?.shared || !!record.value?.sharedFamilyConversation || record.value?.sharingPolicy === 'all_eligible_family' || record.value?.thread_type === 'client_secure');
const canSend = computed(() => !!record.value && !loading.value && !record.value.readOnly && (!props.required || shared.value && recipientUserIds.value.length > 0) && (!reviewNeeded.value || reviewed.value));
const readOnly = computed(() => !!record.value?.readOnly);
const threadId = computed(() => record.value?.threadId || record.value?.thread_id || props.threadId);
const agencyId = computed(() => record.value?.agencyId || record.value?.agency_id || props.agencyId);
function name(p) { return p.name || p.displayName || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Authorized participant'; }
async function load(changed = false) {
  const own = ++generation; record.value = null; loading.value = true; error.value = ''; reviewNeeded.value = changed; reviewed.value = false;
  try {
    const { data } = props.personKey && props.agencyId
      ? await api.post('/messages/hub/ensure-thread', { agencyId: Number(props.agencyId), clientId: Number(props.clientId) || undefined, personKey: props.personKey, method: 'secure', serviceId: serviceId.value || undefined }, { skipGlobalLoading: true })
      : await api.get(`/chat/threads/${props.threadId}/meta`, { skipGlobalLoading: true });
    if (own !== generation) return;
    record.value = data;
    if (props.required && (!shared.value || !participants.value.length)) error.value = 'The shared recipient list is not available. Your draft is preserved; refresh the audience before sending.';
    else if (changed) error.value = 'The shared audience changed. Review the updated people and confirm before sending your preserved draft.';
  } catch(e) { if (own === generation && e.response?.data?.error?.services) services.value = e.response.data.error.services; if (own === generation) error.value = e.response?.data?.error?.message || 'The authorized recipient list could not be loaded. Your draft is preserved.'; }
  finally { if (own === generation) loading.value = false; }
}
async function prepareSend() {
  if (!canSend.value) return false;
  const own = generation;
  if (shared.value && !await notice.value?.ensureAcknowledged()) return false;
  return own === generation && canSend.value;
}
watch(() => [props.threadId, props.agencyId, props.clientId, props.personKey, props.scopeKey], () => {
  serviceId.value = 0; services.value = [];
  if (props.threadId || props.personKey && props.agencyId) load();
  else { generation++; record.value = null; loading.value = false; error.value = ''; }
}, { immediate: true });
onBeforeUnmount(() => { generation++; });
defineExpose({ prepareSend, serviceId, recipientUserIds, canSend, threadId, readOnly, shared, refreshAfterAudienceChange: () => load(true) });
</script>
<template><section v-if="required || shared || readOnly" class="aw-shared-audience" aria-label="Actual shared message recipients"><label v-if="services.length">Service<select v-model="serviceId" :disabled="loading" @change="load()"><option :value="0" disabled>Choose the service</option><option v-for="service in services" :key="service.id" :value="service.id">{{ service.label }}{{ service.providerName ? ` · ${service.providerName}` : '' }}</option></select></label><p v-if="loading" role="status">Checking the authorized shared audience…</p><p v-if="error" role="alert">{{ error }}</p><button v-if="error" type="button" @click="load(reviewNeeded)">Refresh shared recipients</button><p v-if="readOnly">This previous secure conversation is read-only. Its messages retain their original audiences; return to the current shared conversation to send an update.</p><template v-if="record && shared"><strong>Automatically shared with</strong><ul><li v-for="p in participants" :key="participantId(p)">{{ name(p) }}<small v-if="p.role || p.relationshipType"> · {{ p.role || p.relationshipType }}</small><small v-if="participantId(p) === Number(meId)"> · you</small></li></ul><p v-if="record.readOnly">This previous secure conversation is read-only. Return to the current shared conversation to send an update.</p><template v-else><FamilySharingNotice ref="notice" :agency-id="agencyId" :scope-key="`${scopeKey}:${threadId}`" /><label v-if="reviewNeeded"><input v-model="reviewed" type="checkbox" /> I reviewed the updated shared recipients above.</label></template></template></section></template>
<style scoped>.aw-shared-audience{padding:12px 16px;margin:10px 0;border:1px solid #c9daec;border-radius:10px;background:#f7faff;color:#17385e;font:13px/1.6 system-ui,sans-serif}.aw-shared-audience ul{display:flex;gap:6px 16px;flex-wrap:wrap;list-style:none;margin:8px 0;padding:0}.aw-shared-audience li{padding:3px 9px;border-radius:7px;background:#e8f0fb}.aw-shared-audience small{color:#526b88}.aw-shared-audience button{padding:6px 10px;border:1px solid #adc4dd;border-radius:8px;background:white;color:#174577;cursor:pointer}.aw-shared-audience label{display:flex;align-items:center;gap:8px}</style>
