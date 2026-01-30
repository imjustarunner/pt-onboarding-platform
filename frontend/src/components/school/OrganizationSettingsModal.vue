<template>
  <div class="org-settings-full">
    <div class="muted" style="margin-bottom: 10px;">
      Full settings for this school/program. This editor is scoped to the organization you’re currently viewing.
    </div>
    <AgencyManagement :embedded-org-id="organizationId" embedded-tab="general" />
  </div>
</template>

<script setup>
import AgencyManagement from '../admin/AgencyManagement.vue';

const props = defineProps({
  organizationId: { type: [String, Number], required: true }
});
</script>

<style scoped>
.org-settings-full {
  padding: 6px 2px 10px;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>

