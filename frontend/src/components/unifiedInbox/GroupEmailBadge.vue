<script setup>
import { computed } from 'vue';
import { Banknote, ReceiptText, BadgeCheck, Headset, Laptop, Settings, UsersRound, ShieldCheck, FolderLock, UserRoundPlus, ClipboardList, Mail } from '@lucide/vue';
import { groupEmailPresentation } from '../../utils/groupEmailPresentation';
const props = defineProps({ mailbox: { type: Object, required: true }, iconOnly: Boolean });
const icons = { Banknote, ReceiptText, BadgeCheck, Headset, Laptop, Settings, UsersRound, ShieldCheck, FolderLock, UserRoundPlus, ClipboardList, Mail };
const appearance = computed(() => groupEmailPresentation(props.mailbox));
</script>

<template>
  <span class="group-email-badge" :class="{ 'icon-only': iconOnly }" :style="{ color: appearance.ink, backgroundColor: appearance.shade }" :title="mailbox.from_email || mailbox.inbox_from_email || appearance.label">
    <component :is="icons[appearance.icon]" :size="iconOnly ? 20 : 14" aria-hidden="true" />
    <span :class="{ 'sr-only': iconOnly }">{{ appearance.label }}</span>
  </span>
</template>

<style scoped>
.group-email-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 6px; padding: 3px 7px; font-size: 12px; font-weight: 650; }
.icon-only { width: 36px; height: 36px; padding: 0; justify-content: center; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
