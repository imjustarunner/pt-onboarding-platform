<template>
  <nav v-if="actor && !demo" class="workspace-navigation" aria-label="Workspace switching">
    <span class="workspace-label">Workspace</span>
    <a v-if="actor.role === 'super_admin'" href="/admin">Superadmin dashboard</a>
    <a v-if="interfaceName !== 'main'" :href="mainAppUrl">Main app</a>
    <a v-if="interfaceName !== 'auricwell'" :href="practiceUrl">AuricWell</a>
    <a :href="appBase">Switch tenant</a>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { auricwellAppBase } from '../auricwell/paths';
const props = defineProps({ actor: Object, slug: String, interfaceName: String, demo: Boolean });
const appBase = auricwellAppBase();
// Inner Strength's EHR alias is not its canonical full-suite tenant slug.
const tenant = computed(() => props.slug === 'innerstrength' ? 'tisi' : props.slug);
const mainAppUrl = computed(() => tenant.value ? `/${encodeURIComponent(tenant.value)}/dashboard` : '/dashboard');
const practiceUrl = computed(() => tenant.value ? `${appBase}/${encodeURIComponent(tenant.value)}` : appBase);
// Full navigation loads each interface's entry point and stores while retaining
// the session. Destination routes still enforce the signed-in account's access.
</script>

<style scoped>
.workspace-navigation{display:flex;align-items:center;flex-wrap:wrap;gap:4px 18px;padding:6px 24px;background:#f4f8fc;border-bottom:1px solid #dce5ef;color:#173451;font-size:13px;line-height:1.4}
.workspace-label{font-weight:700;color:#526986}
.workspace-navigation a{display:inline-flex;align-items:center;min-height:40px;color:#155b9c;text-decoration:underline;text-underline-offset:3px}
.workspace-navigation a:focus-visible{outline:3px solid #2467a7;outline-offset:3px;border-radius:3px}
@media(max-width:600px){.workspace-navigation{padding:6px 16px;gap:0 16px}.workspace-label{width:100%;padding-top:4px}.workspace-navigation a{min-height:44px}}
</style>
