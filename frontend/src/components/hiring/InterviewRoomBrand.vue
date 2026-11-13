<template>
  <div class="interview-room-brand">
    <img v-if="logoUrl && !logoFailed" :src="logoUrl" :alt="`${agencyName} logo`" @error="logoFailed = true" />
    <div class="interview-room-brand__text">
      <h1>{{ agencyName ? `${agencyName} Interview` : 'Your interview' }}</h1>
      <span class="interview-room-brand__powered">Powered by <img src="/assets/plotline/icon.svg" alt="" /> <strong>Plotline</strong></span>
    </div>
  </div>
</template>
<script setup>
import { ref, watch } from 'vue';
import '../../styles/plotlineFonts.css';
const props = defineProps({ agencyName: { type: String, default: '' }, logoUrl: { type: String, default: '' } });
const logoFailed = ref(false);
watch(() => props.logoUrl, () => { logoFailed.value = false; });
</script>
<style scoped>
.interview-room-brand{display:flex;align-items:center;gap:18px;min-width:0;color:#fff8ee;font-family:'Plotline Inter',system-ui,sans-serif}
.interview-room-brand>img{width:62px;height:62px;object-fit:contain;flex-shrink:0}
.interview-room-brand__text{border-left:1px solid #c9ddbf66;padding-left:18px;min-width:0}
h1{margin:0;color:#fff8ee;font-family:'Plotline Sora',system-ui,sans-serif;font-size:clamp(1.2rem,2.2vw,1.8rem);font-weight:500;letter-spacing:-.04em;line-height:1.2}
.interview-room-brand__powered{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:.75rem;color:#e5eadd}
.interview-room-brand__powered img{width:18px;height:18px;border-radius:4px;background:#f8e5cf;padding:2px}.interview-room-brand__powered strong{font-size:.95rem;font-weight:500}
@media(max-width:600px){.interview-room-brand{gap:10px}.interview-room-brand>img{width:42px;height:42px}.interview-room-brand__text{padding-left:10px}.interview-room-brand__powered{font-size:.65rem}}
</style>
