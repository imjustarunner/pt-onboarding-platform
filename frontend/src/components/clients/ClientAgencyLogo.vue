<template>
  <img v-if="src" :src="src" :alt="`${name} logo`" :title="name" @error="failed = [...failed, src]" />
  <span v-else class="client-agency-initials" :title="name" :aria-label="name">{{ initials }}</span>
</template>

<script setup>
import { computed, ref } from 'vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { tenantFaviconUrl } from '../../utils/tenantBrandAssets';

const props = defineProps({ agency: { type: Object, required: true } });
const failed = ref([]);
const name = computed(() => props.agency.name || props.agency.agencyName || `Agency ${props.agency.id || props.agency.agencyId || ''}`);
const initials = computed(() => name.value.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase());
const src = computed(() => {
  const a = props.agency;
  return [a.logo_url, a.logoUrl, a.logo_path, a.logoPath, a.organization_logo_url, a.organization_logo_path,
    a.icon_file_path, a.iconFilePath, a.chat_icon_path, tenantFaviconUrl(a.slug || a.portal_url || a.name)]
    .filter(Boolean).map(value => toUploadsUrl(String(value))).find(url => !failed.value.includes(url)) || '';
});
</script>

<style scoped>
.client-agency-initials { display: inline-flex; align-items: center; justify-content: center; background: #edf2f7; color: #334155; font-size: 9px; font-weight: 700; border: 1px solid #cbd5e1; }
</style>
