<template><span class="ft-icon" :class="`ft-icon--${tone}`"><component :is="icons[name] || icons.funds" :size="size" :stroke-width="1.7" aria-hidden="true" /></span></template>
<script setup>
import { HandHeart, ChartNoAxesCombined, ChartPie, ClipboardList, CircleCheck, FileText, FolderOpen, Landmark, ArrowLeftRight, Users, Settings, Wallet, Sprout, ShieldCheck, Layers, Heart, LayoutDashboard, CalendarDays, CircleHelp, GitBranch, ArrowRight } from '@lucide/vue';
defineProps({ name: String, tone: { type: String, default: 'green' }, size: { type: Number, default: 22 } });
const icons = { funds: HandHeart, funding: HandHeart, donations: Heart, budgets: ChartPie, allocations: GitBranch, grants: Sprout, expenses: ClipboardList, approvals: CircleCheck, payments: Wallet, reports: ChartNoAxesCombined, documents: FolderOpen, bank: Landmark, partners: Users, settings: Settings, programs: Layers, events: CalendarDays, support: CircleHelp, overview: LayoutDashboard, requests: ClipboardList, proof: FileText, reconciliation: ArrowLeftRight, shield: ShieldCheck, arrow: ArrowRight };
</script>
<style scoped>
.ft-icon{--ft-tone:#399b6d;display:inline-flex;align-items:center;justify-content:center;color:var(--ft-tone);background:color-mix(in srgb,var(--ft-tone) 12%,white);border-radius:13px;width:44px;height:44px;flex-shrink:0}.ft-icon--teal{--ft-tone:#0c929c}.ft-icon--purple{--ft-tone:#9a5add}.ft-icon--blue{--ft-tone:#3886ee}.ft-icon--amber{--ft-tone:#c7860b}.ft-icon--navy{--ft-tone:#163453}
</style>
