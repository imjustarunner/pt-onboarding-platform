<template>
  <span class="nw-brand" :class="{ 'nw-brand--light': light, 'nw-brand--compact': compact }">
    <svg viewBox="0 0 58 64" fill="none" aria-hidden="true"><path d="M14 9h25l10 11v33a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5Z" stroke="currentColor" stroke-width="3.5"/><path d="M37 10v13h12M18 28h17M18 36h12M18 44h8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 31C-5 48 13 63 36 55" stroke="#19a6b5" stroke-width="3.5" stroke-linecap="round"/><circle cx="43" cy="48" r="13" fill="#8bdda6"/><path d="m37 48 4 4 8-9" stroke="#073d3b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="nw-brand-copy"><strong>NoteWorthy<span v-if="!compact"> Payroll</span></strong><small>BY FUNDTHRED</small></span>
  </span>
</template>
<script setup>
defineProps({ light: Boolean, compact: Boolean });
</script>
<style scoped>
.nw-brand{display:inline-flex;align-items:center;gap:10px;color:#071938;line-height:1.15;text-align:left}.nw-brand svg{width:43px;height:48px;flex-shrink:0;color:#079780}.nw-brand-copy{display:flex;flex-direction:column;gap:5px}.nw-brand strong{font-family:Montserrat,Inter,sans-serif;font-size:19px;font-weight:800;letter-spacing:-.7px}.nw-brand strong span{color:#087f83}.nw-brand small{font:700 8px/1.4 Inter,sans-serif;letter-spacing:3.3px}.nw-brand--light,.nw-brand--light strong span{color:white}.nw-brand--light svg{color:#8bdda6}.nw-brand--compact strong{font-size:17px}.nw-brand--compact small{font-size:7px;letter-spacing:2px}
@media(max-width:420px){.nw-brand strong{font-size:15px}.nw-brand svg{width:34px;height:40px}.nw-brand{gap:7px}.nw-brand small{font-size:7px;letter-spacing:2px}}
</style>
