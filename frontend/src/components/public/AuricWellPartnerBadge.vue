<template>
  <a
    class="auricwell-partner-badge"
    :href="`https://auricwell.com/partners#${encodeURIComponent(partner)}`"
    :aria-label="`${name}: AuricWell Partner. Explore the partnership.`"
    :data-analytics-id="`auricwell-partner-${partner}`"
    data-analytics-kind="partner_open"
    data-analytics-label="AuricWell Partner"
  >
    <img class="auricwell-partner-badge__mark" :src="AURICWELL_MARK_URL" alt="" width="32" height="32" loading="lazy" />
    <span class="auricwell-partner-badge__label"><strong>AuricWell</strong><span>Partner</span></span>
    <span class="auricwell-partner-badge__arrow" aria-hidden="true">↗</span>
  </a>
</template>

<script setup>
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand.js';

defineProps({
  partner: { type: String, required: true },
  name: { type: String, required: true }
});
</script>

<style scoped>
.auricwell-partner-badge{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:flex-start;gap:10px;flex-shrink:0;width:fit-content;max-width:100%;min-height:54px;padding:9px 13px;border:1px solid #d9e2ee;border-radius:13px;background:#fff;color:#12376b;vertical-align:middle;text-align:left;text-decoration:none;font-family:Inter,system-ui,sans-serif;line-height:1.15;box-shadow:0 2px 8px #12376b08;transition:border-color .18s,box-shadow .18s}
.auricwell-partner-badge:hover{border-color:#9db1d0;background:#fff;color:#12376b;text-decoration:none;box-shadow:0 3px 12px #12376b14}
.auricwell-partner-badge:focus-visible{outline:3px solid #3a79c2;outline-offset:4px}
.auricwell-partner-badge .auricwell-partner-badge__mark{display:block;flex:none;width:32px;height:32px;max-width:32px;margin:0;padding:0;border:0;border-radius:0;object-fit:contain;filter:none}
.auricwell-partner-badge .auricwell-partner-badge__label{display:flex;flex-direction:column;gap:3px;white-space:nowrap}
.auricwell-partner-badge__label strong{color:#12376b;font-size:15px;font-weight:750;letter-spacing:-.025em;line-height:1.15}
.auricwell-partner-badge__label>span{color:#746538;font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;line-height:1.15}
.auricwell-partner-badge .auricwell-partner-badge__arrow{margin-left:6px;color:#71839d;font-size:17px;font-weight:500}
@media(prefers-reduced-motion:reduce){.auricwell-partner-badge{transition:none}}
</style>
