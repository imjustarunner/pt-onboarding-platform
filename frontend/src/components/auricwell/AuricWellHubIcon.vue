<template>
  <component :is="icons[name] || HeartPulse" :size="size" :stroke-width="1.75" aria-hidden="true" />
</template>
<script setup>
import { ArrowRightLeft, Users, FileHeart, CalendarDays, CreditCard, Settings2, HeartPulse, LayoutGrid, UserRound, School, Wallet } from '@lucide/vue';
defineProps({ name: { type: String, default: '' }, size: { type: Number, default: 24 } });
const icons = { transition: ArrowRightLeft, people: Users, records: FileHeart, calendar: CalendarDays, billing: CreditCard, settings: Settings2, my: LayoutGrid, admin: UserRound, ops: LayoutGrid, workforce: CalendarDays, school: School, finance: Wallet };
</script>
