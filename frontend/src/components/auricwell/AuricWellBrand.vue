<template>
  <span class="auricwell-brand" :class="{ compact }">
    <img :src="AURICWELL_MARK_URL" alt="" />
    <span>AuricWell<small v-if="context">{{ context }}</small></span>
  </span>
</template>
<script setup>
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand';
defineProps({ compact: Boolean, context: { type: String, default: '' } });
</script>
<style scoped>
.auricwell-brand{display:inline-flex;align-items:center;gap:9px;color:#12356b;font-family:system-ui,sans-serif;font-size:20px;font-weight:750;line-height:1.2;white-space:nowrap}.auricwell-brand>span{font:inherit;color:inherit;letter-spacing:inherit;text-decoration:none}.auricwell-brand img{width:32px;height:32px;object-fit:contain}.auricwell-brand small{display:block;margin-top:3px;font-size:11px;font-weight:500;letter-spacing:.02em;color:#526680}.auricwell-brand.compact{gap:4px;font-size:10px}.auricwell-brand.compact img{width:17px;height:17px}.auricwell-brand.compact small{display:inline;margin:0 0 0 4px;font-size:9px}
</style>
