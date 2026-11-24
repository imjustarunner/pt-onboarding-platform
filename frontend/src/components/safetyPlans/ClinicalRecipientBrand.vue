<template>
  <header class="recipient-brand">
    <div class="recipient-product">
      <img src="/auricwell/mark.svg" alt="" width="38" height="38" />
      <strong>AuricWell</strong>
    </div>
    <div v-if="branding?.name" class="recipient-agency">
      <img v-if="logo && !logoFailed" :src="logo" alt="" referrerpolicy="no-referrer" @error="logoFailed=true" />
      <span>{{ branding.name }}</span>
    </div>
  </header>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {toUploadsUrl} from '../../utils/uploadsUrl';
const props=defineProps({branding:Object});
const logo=computed(()=>toUploadsUrl(props.branding?.logoUrl||''));
const logoFailed=ref(false);
watch(logo,()=>{logoFailed.value=false;});
</script>
<style scoped>
.recipient-brand{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.2rem;border:1px solid #dce5ee;border-top:4px solid var(--recipient-accent,#235883);border-radius:.85rem;background:white;color:#142d50}
.recipient-product,.recipient-agency{display:flex;align-items:center;gap:.65rem}
.recipient-product strong{font-size:1.25rem}.recipient-agency{justify-content:flex-end;text-align:right;font-weight:600}
.recipient-agency img{width:auto;height:auto;max-width:4.5rem;max-height:2.75rem;object-fit:contain}
@media(max-width:440px){.recipient-brand{align-items:flex-start;flex-direction:column;gap:.6rem}.recipient-agency{text-align:left}}
</style>
