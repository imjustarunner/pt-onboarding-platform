<template>
  <SchoolClientChatModal
    :client="client"
    :schoolOrganizationId="schoolOrganizationId"
    :organization-slug="organizationSlug"
    :parent-agency-id="parentAgencyId || null"
    :initial-pane="initialPane"
    :can-edit-action="canEditAction"
    :show-checklist-action="showChecklistAction"
    @close="$emit('close')"
    @open-edit="$emit('open-edit', $event)"
    @open-checklist="$emit('open-checklist', $event)"
    @client-updated="$emit('client-updated', $event)"
  />
</template>

<script setup>
import SchoolClientChatModal from '../SchoolClientChatModal.vue';

defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, required: true },
  organizationSlug: { type: String, default: '' },
  parentAgencyId: { type: Number, default: null },
  initialPane: { type: String, default: null },
  canEditAction: { type: Boolean, default: false },
  showChecklistAction: { type: Boolean, default: false }
});
defineEmits(['close', 'open-edit', 'open-checklist', 'client-updated']);
</script>

