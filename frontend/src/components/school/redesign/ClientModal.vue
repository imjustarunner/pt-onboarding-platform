<template>
  <SchoolClientChatModal
    :client="client"
    :schoolOrganizationId="schoolOrganizationId"
    :can-edit-action="canEditAction"
    :show-checklist-action="showChecklistAction"
    @close="$emit('close')"
    @open-edit="$emit('open-edit', $event)"
    @open-checklist="$emit('open-checklist', $event)"
  />
</template>

<script setup>
import SchoolClientChatModal from '../SchoolClientChatModal.vue';

defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, required: true },
  canEditAction: { type: Boolean, default: false },
  showChecklistAction: { type: Boolean, default: false }
});
defineEmits(['close', 'open-edit', 'open-checklist']);
</script>

