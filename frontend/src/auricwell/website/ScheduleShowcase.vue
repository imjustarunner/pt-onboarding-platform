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
 {id:'calendar',label:'Weekly calendar',src:'/auricwell/examples/schedule-week-20261114.png',alt:'The shared calendar with fictional visits, daily highs, snow forecasts and a canceled visit.',caption:'Daily highs and snowfall sit above the calendar. Weather values and records are illustrative; canceled visits remain visible.'},
 {id:'info',label:'Session details',src:'/auricwell/examples/session-info-20261114.png',alt:'Compact session details showing Sunday, service add-ons, unconfirmed status and a linked guardian account.',caption:'A clear date, one service field, applicable add-ons and permitted client and guardian account links.'},
 {id:'reminders',label:'Reminder choices',src:'/auricwell/examples/session-reminders-20261114.png',alt:'Organization, personal and custom reminder controls with timing and mixed channels.',caption:'Organization and personal defaults, custom timing, and email, opted-in text and app choices.'},
 {id:'communications',label:'Communications',src:'/auricwell/examples/session-communications-20261114.png',alt:'The session communication timeline distinguishing notification outcomes, replies and secure session comments.',caption:'See what happened to each reminder, read session-linked replies and identify secure comments.'},
 {id:'progress',label:'Booking progress',src:'/auricwell/examples/session-booking-progress-20261114.png',alt:'Background progress for a fictional series of 26 sessions, with seven saved and the calendar still available.',caption:'An accepted reserved-office booking continues in the background. The schedule shows progress and its final result.'},
 {id:'letter',label:'Appointment letters',src:'/auricwell/examples/session-letter-20261114.png',alt:'A fictional signed appointment letter with email, portal and provider-text delivery choices in the session dialog.',caption:'Prepare, review and digitally sign a session-specific letter without opening another window. Choose email PDF, portal copy, provider text, or a combination.'},
 {id:'booking',label:'Book a session',src:'/auricwell/examples/session-booking-20261114.png',alt:'The real session booking screen with fictional practice context.',caption:'Start from the calendar and review the session, service, time and reminder choices. This capture cannot submit a booking.'}
];
const view = computed(()=>views.find(item=>item.id===selected.value));
</script>
<style scoped>
.schedule-showcase{border:1px solid #dce5f1;border-radius:12px;background:white;overflow:hidden}.schedule-example-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid #e3eaf3}.schedule-example-bar>div{display:flex;flex-wrap:wrap;gap:6px;padding:4px;background:#f2f6fc;border-radius:8px}.schedule-example-bar button{border:0;border-radius:6px;padding:10px 16px;color:#526476;background:transparent;font:inherit;font-size:13px;cursor:pointer}.schedule-example-bar button[aria-pressed=true]{background:var(--showcase-primary,#0649ce);color:white}.schedule-example-bar>span{font-size:11px;color:#64748b}.schedule-showcase figure{margin:0}.schedule-showcase img{display:block;width:100%;height:clamp(260px,42vw,650px);object-fit:contain;object-position:top;background:#fff}.schedule-showcase figcaption{padding:14px 20px;border-top:1px solid #e3eaf3;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:12px;line-height:1.6;color:#526476}.schedule-showcase :focus-visible{outline:3px solid #ba891e;outline-offset:-3px}@media(max-width:600px){.schedule-example-bar{padding:12px}.schedule-example-bar button{padding:10px}.schedule-showcase img{height:auto;max-height:500px}.schedule-showcase figcaption{padding:12px}}
</style>
