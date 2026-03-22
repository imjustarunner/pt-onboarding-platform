<template>
  <ProgramHubModal
    mode="coordinator"
    :agency-id="agencyId"
    :organization-id="organizationId"
    :organization-name="organizationName"
    @close="$emit('close')"
  />
</template>

<script setup>
import ProgramHubModal from './ProgramHubModal.vue';

defineProps({
  agencyId: { type: [Number, String, null], default: null },
  organizationId: { type: [Number, String, null], default: null },
  organizationName: { type: String, default: '' }
});

defineEmits(['close']);
</script>
