<template>
  <ProgramHubModal
    mode="coordinator"
    :agency-id="agencyId"
    :organization-id="organizationId"
    :organization-name="organizationName"
    :organization-portal-slug="organizationPortalSlug"
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
  /** Program org portal slug for event URLs (e.g. D11 Summer), not the parent agency slug. */
  organizationPortalSlug: { type: String, default: '' },
  initialSection: { type: String, default: null }
});

defineEmits(['close']);
</script>
