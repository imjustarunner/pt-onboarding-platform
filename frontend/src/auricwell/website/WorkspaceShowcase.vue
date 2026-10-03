<template>
  <div class="aw-workspace-showcase">
    <div class="aw-workspace-bar"><strong>AuricWell · Meadowbrook Therapy</strong><span>Actual interface · Fictional records</span></div>
    <iframe v-if="interactive" :src="demoUrl" title="Interactive AuricWell EHR demo" sandbox="allow-scripts allow-same-origin" allow="camera 'none'; microphone 'none'; geolocation 'none'" referrerpolicy="no-referrer"></iframe>
    <a v-else :href="demoUrl" target="_blank" rel="noopener" aria-label="Open the interactive AuricWell demo"><img src="/auricwell/examples/workspace-demo.png" alt="Actual AuricWell workspace showing the weekly calendar and fictional appointments" width="1440" height="1000" loading="lazy"></a>
    <div class="aw-workspace-actions"><button type="button" @click="interactive = !interactive">{{ interactive ? 'Back to screen capture' : 'Explore here' }}</button><a :href="demoUrl" target="_blank" rel="noopener">Open full workspace ↗</a></div>
    <p>Open a client chart, meet the fictional providers, explore the calendar, or continue a note draft. Nothing is saved, signed, submitted or sent. Please use fictional information only.</p>
  </div>
</template>
<script setup>
import {ref} from 'vue';
import {auricwellWebsiteBase} from '../paths';
const interactive=ref(false);
const demoUrl=`${auricwellWebsiteBase().replace(/\/$/,'')}/demo#/meadowbrook/appointments`;
</script>
<style scoped>
.aw-workspace-showcase{border:1px solid #dae4f0;border-radius:14px;overflow:hidden;background:white;color:#213449;min-width:0;box-shadow:0 14px 40px #1733510b}.aw-workspace-bar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 22px;background:#f4f8fd;font-size:13px;border-bottom:1px solid #e2eaf4}.aw-workspace-bar span{font-size:12px;color:#546780}.aw-workspace-showcase img{width:100%;height:auto;max-height:660px;object-fit:cover;object-position:top;display:block}.aw-workspace-showcase iframe{display:block;width:100%;height:820px;border:0;background:white}.aw-workspace-actions{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:18px 22px 10px}.aw-workspace-actions button{font:inherit;font-size:14px;border:1px solid #155ac7;border-radius:7px;color:#fff;background:#155ac7;padding:11px 17px;cursor:pointer}.aw-workspace-actions a{font-size:14px;color:#155ac7}.aw-workspace-showcase>p{padding:0 22px 20px;margin:0;font-size:12px;line-height:1.7;color:#546780}.aw-workspace-actions button:focus-visible,.aw-workspace-actions a:focus-visible{outline:3px solid #bb8c23;outline-offset:4px}@media(max-width:600px){.aw-workspace-showcase iframe{height:760px}.aw-workspace-bar,.aw-workspace-actions{padding:14px}}
</style>
