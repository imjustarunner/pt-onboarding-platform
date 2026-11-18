<template><section class="transition-launcher"><h2>Transition workspace</h2><p>Manage ITSCO’s groups, NLU and Inner Strength in one dedicated workspace. Employee and company settings are separate.</p><router-link class="btn btn-primary" to="/practice-transition">Open transition workspace</router-link><details><summary>Chart import tools for other practices</summary><AuricWellTransitionWorkbench :scoped-agency-id="scopedAgencyId" /></details></section></template>
<script setup>
import AuricWellTransitionWorkbench from './AuricWellTransitionWorkbench.vue';
defineProps({scopedAgencyId:{type:[Number,String],default:null}});
</script>
<style scoped>.transition-launcher{padding:24px;line-height:1.6}.transition-launcher details{margin-top:28px}</style>
