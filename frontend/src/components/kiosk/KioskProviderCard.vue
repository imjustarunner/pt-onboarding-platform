<template>
  <button type="button" class="provider-card" @click="$emit('select', provider)">
    <div class="portrait"><img v-if="photoUrl && !photoFailed" :src="photoUrl" alt="" @error="photoFailed = true" /><span v-else>{{ initials }}</span><i :class="{ upcoming: provider.status !== 'active_now' }" /></div>
    <span class="provider-info"><strong>{{ provider.firstName }} {{ provider.lastName }}</strong><span class="credential">{{ provider.credential || provider.title || 'Provider' }}</span><span v-if="provider.agencyName" class="agency"><img v-if="logoUrl && !logoFailed" :src="logoUrl" alt="" @error="logoFailed = true" />{{ provider.agencyName }}</span></span>
    <span class="room">{{ provider.currentRoomNumber ? `Office ${provider.currentRoomNumber}` : provider.currentRoomName || 'Office visit' }}</span>
    <span class="schedule">{{ provider.status === 'active_now' ? 'Scheduled now' : `Next at ${formatKioskTime(provider.nextSlotAt)}` }}</span>
    <span class="choose">Check in <span aria-hidden="true">↗</span></span>
  </button>
</template>
<script setup>
import { computed, ref } from 'vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { tenantFaviconUrl } from '../../utils/tenantBrandAssets';
import { formatKioskTime } from '../../utils/kioskTime';
const props = defineProps({ provider: { type: Object, required: true } });
defineEmits(['select']);
const photoFailed = ref(false);
const logoFailed = ref(false);
const logoUrl = computed(() => toUploadsUrl(props.provider.agencyLogoPath) || tenantFaviconUrl(props.provider.agencySlug));
const photoUrl = computed(() => toUploadsUrl(props.provider.profilePhotoPath));
const initials = computed(() => `${props.provider.firstName?.[0] || ''}${props.provider.lastName?.[0] || ''}`);
</script>
<style scoped>
.provider-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;min-width:0;padding:25px;background:#fffefa;border:1px solid #e1e7dc;border-radius:22px;text-align:left;color:#203f3b;font:inherit;cursor:pointer;transition:transform .18s,box-shadow .18s,border-color .18s}.provider-card:hover{transform:translateY(-3px);box-shadow:0 12px 30px #294e3712;border-color:#839a73}.provider-card:focus-visible{outline:3px solid #b78432;outline-offset:4px}.portrait{width:70px;height:70px;position:relative;margin-bottom:22px}.portrait img,.portrait>span{width:100%;height:100%;border-radius:22px;object-fit:cover}.portrait>span{display:grid;place-items:center;background:#e8eee0;font-size:25px;font-weight:600}.portrait i{position:absolute;right:-3px;bottom:0;width:14px;height:14px;border-radius:50%;background:#718b49;border:3px solid #fffefa}.portrait i.upcoming{background:#c3a271}.provider-info{display:flex;flex-direction:column;gap:5px}.provider-info strong{font-size:20px;letter-spacing:-.4px;line-height:1.3}.credential{font-size:13px;color:#6a7970}.agency{font-size:11px;color:#6a7970;margin:5px 0 16px}.room{background:#edf1e6;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;margin-top:auto}.schedule{font-size:11px;color:#6a7970;margin:10px 0 22px}.choose{display:flex;justify-content:space-between;width:100%;border-top:1px solid #e8ebdf;padding-top:17px;font-size:13px;font-weight:700}.choose>span{font-size:19px}
@media(prefers-reduced-motion:reduce){.provider-card{transition:none}.provider-card:hover{transform:none}}
.agency{display:flex;align-items:center;gap:7px}.agency img{width:38px;height:28px;object-fit:contain}
</style>
