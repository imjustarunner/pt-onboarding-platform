<template>
  <div class="availability-loading" role="status" aria-live="polite" aria-atomic="true">
    <span class="availability-loading-spinner" aria-hidden="true"></span>
    <div>
      <strong>{{ upcoming ? 'Loading upcoming weeks' : 'Loading current availability' }}</strong>
      <p>{{ slow ? 'Still checking this provider’s schedule. Available times will appear here automatically.' : upcoming ? 'This week is ready. Checking the next three weeks.' : 'Checking this provider’s schedule for virtual and in-person appointments.' }}</p>
      <div class="availability-loading-settings" aria-hidden="true"><span><Icon name="screen"/> Virtual</span><span><Icon name="pin"/> In person</span></div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue';
import Icon from '../rise/RiseIcon.vue';
defineProps({ upcoming:Boolean });
const slow=ref(false);
const timer=setTimeout(()=>{slow.value=true;},8000);
onBeforeUnmount(()=>clearTimeout(timer));
</script>

<style scoped>
.availability-loading{display:flex;align-items:flex-start;gap:12px;padding:16px;background:#edf6f1;border:1px solid #c9dfd2;border-radius:10px;color:#20533f;text-align:left}
.availability-loading strong{display:block;font-size:14px;line-height:1.4;font-weight:650}.availability-loading p{font-size:12px;line-height:1.5;margin:4px 0 9px;color:#426552}.availability-loading-settings{display:flex;gap:16px;font-size:11px}.availability-loading-settings span{display:inline-flex;gap:5px;align-items:center}.availability-loading-settings svg{width:15px;height:15px}
.availability-loading-spinner{width:22px;height:22px;flex-shrink:0;box-sizing:border-box;margin-top:2px;border:3px solid #c8e1d3;border-top-color:#247551;border-radius:50%;animation:availability-spin .85s linear infinite}
@keyframes availability-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.availability-loading-spinner{animation:none;border-style:dotted}}
</style>
