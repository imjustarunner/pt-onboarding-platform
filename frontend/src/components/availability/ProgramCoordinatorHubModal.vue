<template>
  <ProgramHubModal
    mode="coordinator"
    :agency-id="agencyId"
    :organization-id="organizationId"
    :organization-name="organizationName"
    :initial-section="initialSection"
    @close="$emit('close')"
  />
</template>

<script setup>
import ProgramHubModal from './ProgramHubModal.vue';

defineProps({
  agencyId: { type: [Number, String, null], default: null },
  organizationId: { type: [Number, String, null], default: null },
  organizationName: { type: String, default: '' },
  initialSection: { type: String, default: null }
});

defineEmits(['close']);
</script>
