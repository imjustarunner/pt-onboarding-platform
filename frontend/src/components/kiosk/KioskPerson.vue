<template>
  <span class="kiosk-person">
    <img v-if="photo && !photoFailed" class="photo" :src="photo" alt="" @error="photoFailed = true" />
    <span v-else class="initials" aria-hidden="true">{{ initials }}</span>
    <span class="identity"><strong>{{ person.name || `${person.firstName || ''} ${person.lastName || ''}` }}</strong><span v-if="person.agencyName" class="agency"><img v-if="logo && !logoFailed" :src="logo" alt="" @error="logoFailed = true" />{{ person.agencyName }}</span></span>
  </span>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { tenantFaviconUrl } from '../../utils/tenantBrandAssets';
const props = defineProps({ person: { type: Object, required: true } });
const photoFailed = ref(false), logoFailed = ref(false);
const photo = computed(() => toUploadsUrl(props.person.profilePhotoPath));
const logo = computed(() => toUploadsUrl(props.person.agencyLogoPath) || tenantFaviconUrl(props.person.agencySlug));
watch(photo, () => { photoFailed.value = false; });
watch(logo, () => { logoFailed.value = false; });
const initials = computed(() => `${props.person.firstName?.[0] || ''}${props.person.lastName?.[0] || ''}`);
</script>
<style scoped>
.kiosk-person{display:flex;align-items:center;gap:10px;min-width:0}.photo,.initials{flex:0 0 40px;width:40px;height:40px;border-radius:12px;object-fit:cover}.initials{display:grid;place-items:center;background:#fff9;font-size:14px;color:#35524a}.identity{min-width:0;display:grid;gap:4px}.identity strong{font-size:13px;line-height:1.3;overflow-wrap:anywhere}.agency{display:flex;align-items:center;gap:5px;font-size:10px;line-height:1.3;color:#50615a}.agency img{width:28px;height:22px;object-fit:contain;background:#fff;border-radius:4px}
</style>
