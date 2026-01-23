<template>
  <SchoolClientChatModal :client="client" :schoolOrganizationId="schoolOrganizationId" @close="$emit('close')" />
</template>

<script setup>
import SchoolClientChatModal from '../SchoolClientChatModal.vue';

defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, required: true }
});
defineEmits(['close']);
</script>

