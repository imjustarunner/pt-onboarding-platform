<template>
  <img v-if="src" :src="src" :alt="`${name} logo`" @error="failedUrls = [...failedUrls, src]" />
  <span v-else class="agency-logo-fallback" :aria-label="name">{{ initials }}</span>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { resolveMembershipLogoUrl } from '../../utils/peerTenantBrand';
import { tenantFaviconUrl } from '../../utils/tenantBrandAssets';

const props = defineProps({
  agencyId: { type: Number, default: 0 },
  iconUrl: { type: String, default: '' },
  label: { type: String, default: '' }
});
const agencyStore = useAgencyStore();
const failedUrls = ref([]);
const agency = computed(() => {
  const rows = [...(agencyStore.userAgencies || []), agencyStore.currentAgency, ...(agencyStore.agencies || [])];
  return Object.assign({}, ...rows.filter(row => Number(row?.id) === props.agencyId));
});
const name = computed(() => props.label || agency.value.name || 'Agency');
const initials = computed(() => name.value.split(/\s+/).slice(0, 2).map(word => word[0]).join(''));
const src = computed(() => [...new Set([
  resolveMembershipLogoUrl(agency.value),
  props.iconUrl,
  tenantFaviconUrl(agency.value.slug || agency.value.portal_url || agency.value.name)
])].find(url => url && !failedUrls.value.includes(url)) || '');
</script>

<style scoped>
.agency-logo-fallback { display: inline-flex; align-items: center; justify-content: center; background: #f1f5f9; color: #334155; font-size: 12px; font-weight: 700; border-radius: 6px; }
</style>
