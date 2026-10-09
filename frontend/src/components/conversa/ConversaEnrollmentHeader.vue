<template>
  <header class="conversa-enrollment-header">
    <div class="conversa-enrollment-topline">
      <ConversaBrand compact />
      <span v-if="status" class="conversa-enrollment-status">{{ status }}</span>
    </div>
    <div class="conversa-enrollment-copy">
      <p class="conversa-enrollment-eyebrow">Messaging &amp; notifications</p>
      <component :is="heading" :id="headingId" class="conversa-enrollment-title">{{ title }}</component>
      <p class="conversa-enrollment-description">{{ description }}</p>
    </div>
    <p class="conversa-enrollment-attribution">Messaging managed by <strong>Conversa</strong><template v-if="organizationName"> for <strong>{{ organizationName }}</strong></template>.</p>
  </header>
</template>
<script setup>
import ConversaBrand from './ConversaBrand.vue';
defineProps({ title: { type: String, required: true }, description: String, organizationName: String, status: String, heading: { type: String, default: 'h2' }, headingId: String });
</script>
<style scoped>
.conversa-enrollment-header{position:relative;overflow:hidden;padding:28px 30px 22px;background:linear-gradient(125deg,#f3f7fe 0%,#fff 62%,#edf6f8 100%);border-bottom:1px solid #dce5f0;color:#142b50}.conversa-enrollment-header::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#0f2d6b,#176acb 65%,#62acb4)}.conversa-enrollment-topline{display:flex;justify-content:space-between;align-items:center;gap:16px}.conversa-enrollment-status{padding:7px 11px;border:1px solid #d0dff2;border-radius:100px;color:#244a78;background:#fff;font-size:11px;font-weight:650;line-height:1.4}.conversa-enrollment-copy{margin-top:25px;max-width:620px}.conversa-enrollment-eyebrow{margin:0 0 9px;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#4f6684}.conversa-enrollment-title{margin:0;font-size:clamp(23px,3vw,30px);line-height:1.2;letter-spacing:-.035em;font-weight:650}.conversa-enrollment-description{font-size:14px;line-height:1.7;color:#536680;margin:12px 0 0}.conversa-enrollment-attribution{margin:18px 0 0;color:#536680;font-size:12px;line-height:1.6}.conversa-enrollment-attribution strong{color:#244a78;font-weight:600}@media(max-width:560px){.conversa-enrollment-header{padding:24px 20px 19px}.conversa-enrollment-topline{align-items:flex-start}.conversa-enrollment-status{max-width:125px}.conversa-enrollment-copy{margin-top:22px}}
</style>
