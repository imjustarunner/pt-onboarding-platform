<template>
  <section>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="agency"><CredentialingWorkspace v-if="!records" :key="base" /><CredentialingRecords v-else :key="`${base}:records`" /></template>
  </section>
</template>
<script setup>
import { provide, reactive, ref, onBeforeUnmount } from 'vue';
import CredentialingWorkspace from '../../frontend/src/views/admin/CredentialingWorkspaceView.vue';
import CredentialingRecords from '../../frontend/src/views/admin/AgencyCredentialingView.vue';
import { credentialingTransport } from './credentialingTransport.js';
const props = defineProps({ base: { type: String, required: true } });
const transport = credentialingTransport(props.base), agency = ref(null), records = ref(false), error = ref('');
const context = reactive({ agencyId: 0, agency: null, user: null, openRecords: () => { records.value = true; }, openOverview: () => { records.value = false; } });
provide('credentialingTransport', transport); provide('credentialingContext', context);
let active = true;
transport.get('/agencies/credentialing/organizations').then(({ data }) => { if (!active) return; agency.value = data.organizations?.[0]; context.user = data.actor; context.agency = agency.value; context.agencyId = Number(agency.value?.id || 0); }).catch(e => { if (active) error.value = e.message; });
onBeforeUnmount(() => { active = false; });
</script>
