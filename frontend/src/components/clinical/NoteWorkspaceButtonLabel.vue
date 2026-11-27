<template>
  <span class="note-workspace-label" aria-hidden="true">
    <img :src="AURICWELL_MARK_URL" alt="" />
    <span><strong>Note Workspace</strong><small>Powered by Narriva</small></span>
  </span>
</template>
<script setup>
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand.js';
</script>
<style scoped>
.note-workspace-label { display:inline-flex; align-items:center; gap:8px; text-align:left; }
img { width:30px; height:30px; object-fit:contain; }
strong,small { display:block; white-space:nowrap; line-height:1.15; }
strong { font-size:.86rem; color:var(--text-primary,#111827); }
small { margin-top:3px; font-size:.65rem; font-weight:400; color:var(--text-secondary,#64748b); }
</style>
