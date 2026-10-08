<script setup>
import { computed } from 'vue';
import { LockKeyhole, UserRound, Mail, Users, MessageCircle, MessagesSquare, Hash, Ticket, Phone, Voicemail, MessageSquare, Megaphone, Paperclip, CalendarClock, Flag, CheckCheck, Circle, Inbox, AtSign } from '@lucide/vue';
import { conversaType } from '../../constants/conversa';
const props = defineProps({ type: { type: String, default: 'chat' }, size: { type: [Number, String], default: 18 }, label: { type: String, default: '' }, tile: Boolean });
const icons = { LockKeyhole, UserRound, Mail, Users, MessageCircle, MessagesSquare, Hash, Ticket, Phone, Voicemail, MessageSquare, Megaphone, Paperclip, CalendarClock, Flag, CheckCheck, Circle, Inbox, AtSign };
const meta = computed(() => conversaType(props.type));
</script>

<template>
  <span class="conversa-icon" :class="['conversa-tone--' + meta.tone, { 'conversa-icon--tile': tile }]" :role="label ? 'img' : undefined" :aria-label="label || undefined" :aria-hidden="label ? undefined : true">
    <component :is="icons[meta.icon]" :size="size" :stroke-width="1.8" aria-hidden="true" />
  </span>
</template>

<style scoped>
.conversa-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; vertical-align: middle; color: var(--conversa-tone-ink); }
.conversa-icon--tile { padding: 10px; border-radius: 12px; background: var(--conversa-tone-bg); }
</style>
