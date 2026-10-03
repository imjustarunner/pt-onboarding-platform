<template>
  <div class="schedule-showcase">
    <div class="schedule-example-bar"><div role="group" aria-label="Scheduling examples"><button v-for="item in views" :key="item.id" type="button" :aria-pressed="selected === item.id" @click="selected = item.id">{{ item.label }}</button></div><span>Actual app screens · Synthetic records</span></div>
    <figure aria-live="polite"><a :href="view.src" target="_blank" rel="noopener" :aria-label="`Open ${view.label.toLowerCase()} capture at full size`"><img :src="view.src" :alt="view.alt" loading="lazy"></a><figcaption><span>{{ view.caption }}</span><a :href="view.src" target="_blank" rel="noopener">View full size ↗</a></figcaption></figure>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
const selected = ref('calendar');
const views = [
  {id:'calendar',label:'Weekly calendar',src:'/auricwell/examples/staff-calendar.png',alt:'The actual shared app weekly calendar showing fictional individual therapy appointments across five days.',caption:'The existing staff calendar, populated with fictional appointments.'},
  {id:'booking',label:'Book a session',src:'/auricwell/examples/schedule-booking.png',alt:'The actual shared app booking screen opened from the calendar, with synthetic practice context.',caption:'The existing scheduling form, opened directly from the calendar. This capture cannot submit a booking.'}
];
const view = computed(()=>views.find(item=>item.id===selected.value));
</script>
<style scoped>
.schedule-showcase{border:1px solid #dce5f1;border-radius:12px;background:white;overflow:hidden}.schedule-example-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid #e3eaf3}.schedule-example-bar>div{display:flex;gap:6px;padding:4px;background:#f2f6fc;border-radius:8px}.schedule-example-bar button{border:0;border-radius:6px;padding:10px 16px;color:#526476;background:transparent;font:inherit;font-size:13px;cursor:pointer}.schedule-example-bar button[aria-pressed=true]{background:#0649ce;color:white}.schedule-example-bar>span{font-size:11px;color:#64748b}.schedule-showcase figure{margin:0}.schedule-showcase img{display:block;width:100%;height:clamp(260px,42vw,650px);object-fit:contain;object-position:top;background:#fff}.schedule-showcase figcaption{padding:14px 20px;border-top:1px solid #e3eaf3;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:12px;line-height:1.6;color:#526476}.schedule-showcase :focus-visible{outline:3px solid #ba891e;outline-offset:-3px}@media(max-width:600px){.schedule-example-bar{padding:12px}.schedule-example-bar button{padding:10px}.schedule-showcase img{height:auto;max-height:500px}.schedule-showcase figcaption{padding:12px}}
</style>
