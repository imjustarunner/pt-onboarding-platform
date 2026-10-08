<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import ConversaSender from './ConversaSender.vue';
const props = defineProps({ conversation: { type: Object, required: true } });
const agencyStore = useAgencyStore();
const organization = computed(() => {
  const id = props.conversation.agency_id;
  if (id == null) return null;
  return [agencyStore.currentAgency, ...(agencyStore.userAgencies || [])].find(org => org && String(org.id) === String(id)) || null;
});
const mailbox = computed(() => props.conversation.inbox_display_name || props.conversation.inbox_from_email || '');
</script>
<template>
  <span v-if="mailbox || organization" class="conversa-mailbox" :title="conversation.inbox_from_email || mailbox">
    <ConversaSender v-if="organization" avatar-only :organization="organization" />
    <span>Via {{ organization?.name || mailbox }}<template v-if="organization?.name && mailbox && mailbox !== organization.name"> · {{ mailbox }}</template></span>
  </span>
</template>
<style scoped>
.conversa-mailbox { display: flex; align-items: center; gap: 5px; min-width: 0; }
.conversa-mailbox > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversa-mailbox :deep(.conversa-sender__avatar) { width: 18px; height: 18px; flex-basis: 18px; border-radius: 5px; font-size: 7px; }
</style>
