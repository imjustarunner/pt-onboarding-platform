<template>
 <div class="scb-product-preview" :class="{'is-interactive':interactive}" :aria-label="agency?'Actual SchoolCareBridge agency overview':'Actual SchoolCareBridge school portal'">
  <div class="scb-preview-bar"><span>SchoolCareBridge</span><small>Actual interface · Fictional records</small></div>
  <iframe v-if="interactive" :src="demoUrl" :title="agency?'Working agency overview demo':'Working school portal demo'" sandbox="allow-scripts allow-same-origin" loading="lazy" referrerpolicy="no-referrer"></iframe>
  <a v-else :href="demoUrl" target="_blank" rel="noopener" class="scb-preview-capture" :aria-label="agency?'Open the working agency overview':'Open the working school portal'"><img :src="agency?'/assets/schoolcarebridge/examples/agency-overview.png':'/assets/schoolcarebridge/examples/school-portal.png'" :alt="agency?'Actual agency school overview with fictional Cedar Grove records':'Actual SchoolCareBridge portal for fictional Cedar Grove Elementary, including navigation, roster and schedules'" loading="lazy" width="1440" height="1000"/></a>
  <div class="scb-preview-controls"><button @click="interactive=!interactive">{{interactive?'Back to screen capture':'Explore here'}}</button><a :href="demoUrl" target="_blank" rel="noopener">Open full workspace ↗</a></div>
  <p>Open provider profiles, explore the school schedule and view seeded fictional students. This is the same portal component used by schools. Messages and changes are not saved.</p>
 </div>
</template>
<script setup>
import {computed,ref} from 'vue';
import {schoolCareBridgeExternalPath} from '../../utils/schoolCareBridge';
const props=defineProps({agency:Boolean});
const interactive=ref(false);
const demoUrl=computed(()=>schoolCareBridgeExternalPath('/schoolcarebridge/demo')+(props.agency?'?view=overview':''));
</script>
<style scoped>
.scb-product-preview{border-radius:16px;overflow:hidden;border:1px solid #d6e5ed;background:white;box-shadow:0 14px 45px #13365118;text-align:left;color:#163957;min-width:0}.scb-preview-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;font-size:12px;font-weight:700;background:#f3f9fc;border-bottom:1px solid #dce7ed}.scb-preview-bar small{font-size:10px;font-weight:400;color:#536e83}.scb-preview-capture{display:block}.scb-preview-capture img{width:100%;height:auto;display:block;object-fit:contain}.scb-preview-controls{display:flex;gap:15px;align-items:center;flex-wrap:wrap;padding:16px 18px 10px}.scb-preview-controls button{border:1px solid #147bae;background:#eaf7ff;color:#146088;border-radius:6px;font:inherit;font-size:12px;padding:10px 14px;cursor:pointer}.scb-preview-controls a{font-size:12px;color:#006db0}.scb-product-preview>p{font-size:11px;line-height:1.7;margin:0;padding:0 18px 18px;color:#536e83}.scb-product-preview iframe{display:block;border:0;width:100%;height:720px;background:#f6f9fc}.scb-product-preview.is-interactive{grid-column:1/-1}.scb-hero-product .scb-preview-capture img{max-height:350px;object-fit:cover;object-position:top}.scb-hero-product .scb-product-preview>p{display:none}@media(max-width:550px){.scb-preview-bar{flex-wrap:wrap;gap:4px}.scb-preview-bar small{width:100%}.scb-product-preview iframe{height:780px}}
</style>
