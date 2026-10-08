<template>
  <span class="plotline-brand" :class="{ 'plotline-brand--light': light }" aria-label="Plotline by PlotTwistCo">
    <svg class="plotline-brand-trail" viewBox="0 0 250 42" fill="none" aria-hidden="true"><path d="M24 40C24-14 77 9 119 23S197 39 223 15" stroke="currentColor" stroke-width="2.3"/><path d="M230 2c0 9-4 13-12 15 8 2 12 6 12 15 2-9 6-13 14-15-8-2-12-6-14-15Z" fill="#D8987F"/></svg>
    <span class="plotline-brand-name">plot<span>line</span></span>
    <span class="plotline-brand-by">by plottwistco</span>
  </span>
</template>
<script setup>
import '../../styles/plotlineFonts.css';

defineProps({ light: Boolean });
</script>
<style scoped>
.plotline-brand{display:inline-flex;position:relative;flex-direction:column;color:#0f2d24;line-height:1;min-width:145px;padding-top:17px;vertical-align:middle}.plotline-brand-trail{position:absolute;top:0;left:0;width:100%;height:30px}.plotline-brand-name{font-family:'Plotline Sora',system-ui,sans-serif;font-size:43px;letter-spacing:-3px;font-weight:500}.plotline-brand-name>span{color:#ab644c}.plotline-brand-by{font:9px/1.6 'Plotline Inter',system-ui,sans-serif;text-transform:uppercase;letter-spacing:3px;text-align:right;margin-top:4px}.plotline-brand--light{color:#faf7f2}.plotline-brand--light .plotline-brand-name>span{color:#d8987f}
</style>
