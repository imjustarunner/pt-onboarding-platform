<template>
  <nav v-if="summary && (summary.draftCount || summary.attentionCount)" class="email-workspace-links" aria-label="Unfinished email">
    <RouterLink v-if="summary.draftCount" :to="destination('drafts')">Email drafts <strong>{{ summary.draftCount }}</strong><span>Continue writing</span></RouterLink>
    <RouterLink v-if="summary.attentionCount" :to="destination('needs_attention')">Email needs attention <strong>{{ summary.attentionCount }}</strong><span>Review delivery</span></RouterLink>
  </nav>
</template>
<script setup>
import { toRef } from 'vue';
import { useRoute } from 'vue-router';
import { useEmailWorkspace } from '../../composables/useEmailWorkspace';
const props = defineProps({ agencyId: [Number, String], enabled: { type: Boolean, default: true } });
const route = useRoute();
const { summary } = useEmailWorkspace(toRef(props, 'agencyId'), () => props.enabled);
const destination = folder => ({path: route.params.organizationSlug ? `/${route.params.organizationSlug}/messages` : '/messages', query: {folder, channel:'email'}});
</script>
<style scoped>
.email-workspace-links{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0 20px}.email-workspace-links a{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--border-color,#b6cabb);border-radius:10px;padding:12px 16px;background:var(--bg-card,#fff);color:var(--text-primary,#214c39);text-decoration:none}.email-workspace-links strong{border-radius:16px;padding:2px 8px;background:#e2ede6}.email-workspace-links span{font-size:.85rem;opacity:.8}.email-workspace-links a:hover{text-decoration:underline}
</style>
