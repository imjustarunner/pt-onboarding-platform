<template>
  <ClientSmsInbox :base="base" :patient-id="patientId" :request="api" />
</template>
<script setup>
import ClientSmsInbox from '../../frontend/src/components/communications/ClientSmsInbox.vue';
import { api } from './api';
defineProps({ base: String, patientId: { type: String, default: '' } });
</script>
