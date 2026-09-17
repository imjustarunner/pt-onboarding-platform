<template>
  <aside v-if="slug && !framed" class="website-editor-bar" aria-label="Website editing">
    <span>Website: {{ slug }}</span>
    <router-link :to="marketingEditorPath(slug)">Edit website</router-link>
    <router-link to="/dashboard">Back to app</router-link>
  </aside>
  <footer v-else-if="!framed && managementUrl" class="website-management-link" translate="no">
    <a :href="signInUrl || managementUrl">{{ signInUrl ? 'Sign in to edit this website' : 'Manage this website' }}</a>
    <span v-if="checking" role="status">Checking your session…</span>
  </footer>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { editableWebsiteSlug, marketingEditorPath, websiteManagementUrl } from '../../utils/publicWebsiteEditing';
import api from '../../services/api';
import { publicSitePaths } from '../../utils/publicDomainRouting';
const route = useRoute();
const auth = useAuthStore();
const framed = window.parent !== window;
const checking = ref(false);
const needsSignIn = ref(false);
const managementUrl = computed(() => websiteManagementUrl(route, window.location.hostname));
const signInUrl = computed(() => {if(!needsSignIn.value)return '';const target=new URL(managementUrl.value,window.location.origin);return `${target.origin}/login?redirect=${encodeURIComponent(target.pathname+target.search)}`;});
onMounted(async () => {
  if (framed || (publicSitePaths(window.location.hostname) && !auth.user)) return;
  checking.value = true;
  try {
    const { data } = await api.get('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true });
    if (data?.id && data?.role) auth.setAuth(null, data);
  } catch (e) { if (e.response?.status === 401) needsSignIn.value = true; }
  finally { checking.value = false; }
});
const slug = computed(() => needsSignIn.value ? null : editableWebsiteSlug({ user: auth.user, route, hostname: window.location.hostname, framed: window.parent !== window }));
</script>
<style scoped>
.website-editor-bar { position: fixed; bottom: 20px; left: 20px; z-index: 1000; display: flex; align-items: center; flex-wrap: wrap; gap: 16px; max-width: calc(100vw - 40px); padding: 12px 18px; background: #fff; color: #18283b; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 4px 24px #0002; font: 14px/1.4 system-ui, sans-serif; }
.website-editor-bar a { color: #153f67; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 600px) { .website-editor-bar { bottom: 80px; left: 12px; max-width: calc(100vw - 24px); gap: 10px; } }
.website-management-link { padding: 16px; text-align: center; font: 12px/1.5 system-ui,sans-serif; background: #fff; color: #334155; }
.website-management-link a { color: inherit; text-decoration: underline; }
</style>
