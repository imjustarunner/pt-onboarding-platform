<template>
  <div class="interview-brand-overlay">
    <div class="agency-mark" :style="{borderColor:brand?.primaryColor || '#1f2a44'}">
      <img v-if="brand?.logoUrl" :src="brand.logoUrl" :alt="`${brand.name} logo`" @error="$event.target.style.display='none'" />
      <div><strong>{{ brand?.name || 'Interview' }}</strong><span class="plotline-watermark"><img src="/assets/plotline/icon.svg" alt="PlotLine logo" />Powered by PlotLine</span></div>
    </div>
    <button v-if="showLeave" type="button" class="interview-leave" @click="$emit('leave')">Leave meeting</button>
  </div>
</template>
<script setup>
defineProps({brand:{type:Object,default:null},showLeave:{type:Boolean,default:true}});
defineEmits(['leave']);
</script>
<style scoped>
.interview-brand-overlay{position:absolute;top:12px;left:12px;right:12px;z-index:30;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;pointer-events:none}.agency-mark{display:flex;align-items:center;gap:9px;padding:8px 11px;border-left:4px solid;background:rgba(255,255,255,.96);color:#1f2a44;border-radius:9px;max-width:min(65%,360px);box-shadow:0 2px 8px #0002}.agency-mark>img{width:38px;height:38px;object-fit:contain}.agency-mark strong{display:block;font-size:14px;line-height:1.3}.plotline-watermark{display:flex;align-items:center;gap:4px;font-size:10px;margin-top:3px;white-space:nowrap}.plotline-watermark img{width:15px;height:15px;object-fit:contain}.interview-leave{pointer-events:auto;border:1px solid #ff9aa4;border-radius:8px;background:#b42335;color:#fff;min-height:44px;padding:9px 12px;font-size:14px;font-weight:700;cursor:pointer}@media(max-width:480px){.agency-mark{padding:7px;gap:6px;max-width:57%}.agency-mark>img{width:27px;height:27px}.agency-mark strong{font-size:12px}.interview-leave{font-size:12px;padding:8px}}
</style>
