<template><div class="plotline-signature"><span>{{ context || 'People operations' }} powered by</span><a :href="PLOTLINE_WEBSITE_URL" target="_blank" rel="noopener noreferrer" aria-label="Plotline by PlotTwistCo"><strong>plot<span>line</span></strong><small>by plottwistco</small></a></div></template>
<script setup>
import '../../styles/plotlineFonts.css';
import { PLOTLINE_WEBSITE_URL } from '../../utils/plotline';
defineProps({ context: { type: String, default: '' } });</script>
<style scoped>
.plotline-signature{display:flex;align-items:center;justify-content:center;gap:12px;padding:15px 20px;color:#526358;font:11px/1.5 'Plotline Inter',system-ui,sans-serif}.plotline-signature a{color:#0f2d24!important;text-decoration:none!important;line-height:1;text-align:center}.plotline-signature strong{font:500 25px/1 'Plotline Sora',system-ui,sans-serif;letter-spacing:-1.5px}.plotline-signature strong>span{color:#a96047}.plotline-signature small{display:block;text-transform:uppercase;font-size:6px;letter-spacing:1.5px;margin-top:4px}
</style>
