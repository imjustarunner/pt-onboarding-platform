<template>
  <div class="office-identity" :style="{'--office-accent':officeAccent(branding)}">
    <div v-if="auricwell" class="office-product"><img :src="AURICWELL_MARK_URL" alt="" /><div><strong>AuricWell</strong><small>Virtual office</small></div></div>
    <div v-if="!auricwell || branding?.agencyName" :class="auricwell ? 'office-agency' : 'office-product tenant-product'">
      <img v-if="logo && !failed" :src="logo" :alt="`${branding.agencyName} logo`" @error="failed=true" />
      <div><strong>{{ branding?.agencyName || branding?.organizationName || 'My Virtual Office' }}</strong><small v-if="!auricwell && (branding?.agencyName || branding?.organizationName)">My Virtual Office</small></div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { isAuricWellOffice, officeAccent } from '../../utils/officeBranding';
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand';
const props=defineProps({branding:Object});
const auricwell=computed(()=>isAuricWellOffice(props.branding));
const logo=computed(()=>props.branding?.agencyLogoUrl || props.branding?.logoUrl);
const failed=ref(false);
watch(logo,()=>failed.value=false);
</script>
<style scoped>
.tenant-product strong{color:var(--office-accent)}.office-agency strong{font-size:14px}.office-identity{display:flex;align-items:center;gap:22px;flex-wrap:wrap;color:#183a61;font-family:system-ui,sans-serif}.office-product{display:flex;align-items:center;gap:12px}.office-product img{width:48px;height:48px;object-fit:contain}.office-product strong{font-size:22px;letter-spacing:-.6px}.office-product small{display:block;margin-top:3px;color:#738398;font-size:11px;letter-spacing:.09em;text-transform:uppercase}.office-agency{display:flex;align-items:center;gap:10px;border-left:1px solid #ded6c4;padding-left:22px;font-size:14px;font-weight:600;color:#52677d}.office-agency img{width:44px;height:44px;object-fit:contain}@media(max-width:500px){.office-identity{gap:12px}.office-product strong{font-size:19px}.office-product img{width:40px;height:40px}.office-agency{padding-left:12px}.office-agency img{width:36px;height:36px}}
</style>
