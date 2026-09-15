<template>
  <aside v-if="slug" class="website-editor-bar" aria-label="Website editing">
    <span>Website: {{ slug }}</span>
    <a :href="marketingEditorPath(slug)" target="_blank" rel="noopener">Edit website</a>
    <router-link to="/dashboard">Back to app</router-link>
  </aside>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { editableWebsiteSlug, marketingEditorPath } from '../../utils/publicWebsiteEditing';
const route = useRoute();
const auth = useAuthStore();
const slug = computed(() => editableWebsiteSlug({ user: auth.user, route, hostname: window.location.hostname, framed: window.parent !== window }));
</script>
<style scoped>
.website-editor-bar { position: fixed; bottom: 20px; left: 20px; z-index: 1000; display: flex; align-items: center; flex-wrap: wrap; gap: 16px; max-width: calc(100vw - 40px); padding: 12px 18px; background: #fff; color: #18283b; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 4px 24px #0002; font: 14px/1.4 system-ui, sans-serif; }
.website-editor-bar a { color: #153f67; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 600px) { .website-editor-bar { bottom: 80px; left: 12px; max-width: calc(100vw - 24px); gap: 10px; } }
</style>
