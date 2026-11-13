<script setup>
import { computed, ref, watch } from 'vue';
import { eventAgencies, eventAgencyColor, eventAgencyLogo } from '../../utils/eventBranding';
const props = defineProps({ branding: { type: Object, default: () => ({}) }, compact: Boolean });
const agencies = computed(() => eventAgencies(props.branding));
const host = computed(() => agencies.value.find(agency => agency.isHost) || agencies.value[0]);
const others = computed(() => agencies.value.filter(agency => agency !== host.value));
const failed = ref(new Set());
watch(() => props.branding, () => { failed.value = new Set(); });
const logo = agency => failed.value.has(eventAgencyLogo(agency)) ? '' : eventAgencyLogo(agency);
const fail = agency => { failed.value = new Set([...failed.value, eventAgencyLogo(agency)]); };
const initials = agency => String(agency.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
</script>

<template>
  <div class="event-host-identity" :class="{ 'event-host-identity--compact': compact }">
    <div class="event-host-primary" :style="{ '--host-accent': eventAgencyColor(host) }">
      <span class="event-host-mark"><img v-if="logo(host)" :src="logo(host)" alt="" @error="fail(host)" /><span v-else>{{ initials(host) }}</span></span>
      <span class="event-host-name"><small>Hosted by</small><strong>{{ host.name }}</strong></span>
    </div>
    <div v-if="!compact && others.length" class="event-host-partners">
      <small>Participating agencies</small>
      <div><span v-for="agency in others" :key="agency.slug || agency.name" class="event-host-partner" :style="{ '--host-accent': eventAgencyColor(agency) }"><img v-if="logo(agency)" :src="logo(agency)" alt="" @error="fail(agency)" /><i v-else aria-hidden="true" />{{ agency.name }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.event-host-identity{display:flex;align-items:center;gap:22px;min-width:0;flex-wrap:wrap}.event-host-primary{display:flex;align-items:center;gap:12px;min-width:0}.event-host-mark{width:48px;height:48px;border:1px solid color-mix(in srgb,var(--host-accent) 23%,#e5eaf3);border-radius:13px;display:grid;place-items:center;background:white;box-shadow:0 3px 12px #16295608;flex-shrink:0;overflow:hidden}.event-host-mark img{width:100%;height:100%;padding:5px;object-fit:contain}.event-host-mark>span{display:grid;place-items:center;width:100%;height:100%;background:color-mix(in srgb,var(--host-accent) 10%,white);font-size:17px;font-weight:750;color:#223659}.event-host-name{display:grid;gap:3px;min-width:0}.event-host-name small,.event-host-partners>small{text-transform:uppercase;letter-spacing:1.3px;font-size:9px;font-weight:700;color:#64718a}.event-host-name strong{font-size:19px;line-height:1.25;letter-spacing:-.4px;color:#1c2e4d;overflow-wrap:anywhere}.event-host-partners{display:grid;gap:7px;border-left:1px solid #e2e8f1;padding-left:22px;min-width:0}.event-host-partners>div{display:flex;gap:7px;flex-wrap:wrap}.event-host-partner{display:inline-flex;align-items:center;gap:7px;border:1px solid #e0e6f0;background:#fff;border-radius:20px;padding:5px 9px;font-size:10px;font-weight:600;color:#445572;overflow-wrap:anywhere}.event-host-partner img{width:21px;height:21px;object-fit:contain}.event-host-partner i{width:7px;height:7px;background:var(--host-accent);border-radius:50%;flex-shrink:0}.event-host-identity--compact{margin-left:auto;flex-wrap:nowrap}.event-host-identity--compact .event-host-mark{width:32px;height:32px;border-radius:9px}.event-host-identity--compact .event-host-primary{gap:9px}.event-host-identity--compact .event-host-name small{font-size:8px;letter-spacing:1px}.event-host-identity--compact .event-host-name strong{font-size:12px;max-width:180px}.event-host-identity--compact .event-host-mark>span{font-size:11px}@media(max-width:680px){.event-host-name strong{font-size:18px}.event-host-partners{border-left:0;border-top:1px solid #e2e8f1;padding:12px 0 0;width:100%}.event-host-identity{gap:12px}.event-host-identity--compact .event-host-name strong{max-width:115px;font-size:10px}.event-host-identity--compact .event-host-mark{width:29px;height:29px}}
</style>
