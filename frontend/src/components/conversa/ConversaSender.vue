<script setup>
import { computed, ref, watch } from 'vue';
import { resolveMembershipLogoUrl } from '../../utils/peerTenantBrand';
const props = defineProps({ name: { type: String, default: '' }, address: { type: String, default: '' }, organization: { type: Object, default: null }, logo: { type: String, default: '' }, avatarOnly: Boolean });
const failed = ref(false);
// Only explicit sender metadata supplies an organization identity. Never infer it from the receiving mailbox.
const logoUrl = computed(() => resolveMembershipLogoUrl(props.organization) || resolveMembershipLogoUrl({ logo_url: props.logo }) || '');
const displayName = computed(() => props.name || props.organization?.name || props.address || 'Sender');
const initials = computed(() => displayName.value.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase());
watch(logoUrl, () => { failed.value = false; });
</script>
<template>
  <span class="conversa-sender" :title="avatarOnly ? displayName : undefined">
    <span class="conversa-sender__avatar" aria-hidden="true"><img v-if="logoUrl && !failed" :src="logoUrl" alt="" @error="failed = true" /><span v-else>{{ initials }}</span></span>
    <span v-if="!avatarOnly" class="conversa-sender__details">
      <strong>{{ displayName }}</strong>
      <span v-if="organization?.name && organization.name !== displayName" class="conversa-sender__organization">{{ organization.name }}</span>
      <span v-if="address" class="conversa-sender__address">{{ address }}</span>
    </span>
  </span>
</template>
<style scoped>
.conversa-sender { display: inline-flex; align-items: center; gap: 9px; min-width: 0; max-width: 100%; vertical-align: middle; }
.conversa-sender__avatar { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: 0 0 36px; overflow: hidden; background: var(--conversa-blue-soft, #eaf3ff); color: var(--conversa-blue, #0047b3); border: 1px solid var(--conversa-border, #dce5f0); border-radius: 12px; font: 600 12px/1 var(--conversa-font, Inter, sans-serif); }
.conversa-sender__avatar img { width: 100%; height: 100%; object-fit: contain; background: white; }
.conversa-sender__details { display: flex; flex-direction: column; min-width: 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.conversa-sender__details strong { font-weight: 600; }
.conversa-sender__organization, .conversa-sender__address { color: var(--conversa-muted, #687280); font-size: 11px; }
</style>
