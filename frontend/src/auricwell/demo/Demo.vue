<template>
  <div class="aw-demo">
    <div v-if="notice" class="aw-demo-notice" role="status"><span>{{ notice }}</span><button type="button" @click="notice = ''" aria-label="Dismiss demo notice">×</button></div>
    <App :demo-context="{practice,actor}">
      <template #appointments>
        <p class="aw-caption">The shared scheduling workspace · Fictional appointments and confirmation states. Try the calendar views or open Book session; bookings and notifications are not sent.</p>
        <Schedule :user-id="actor.id" :agency-id="practice.id" :week-start-ymd="weekStart" compact-page-chrome schedule-title="Practice schedule" :show-company-events-calendar-button="false" :show-skill-builders-programs-button="false" />
      </template>
    </App>
  </div>
</template>
<script setup>
import {ref,onBeforeUnmount,defineAsyncComponent,watch} from 'vue';
import App from '../App.vue';
import {useRoute} from 'vue-router';
const Schedule=defineAsyncComponent(()=>import('../../components/schedule/ScheduleAvailabilityGrid.vue'));
import {practice,actor,weekStart} from './fixtures';
const route=useRoute();
const notice=ref('');watch(()=>route.fullPath,()=>{notice.value='';});const notify=event=>{notice.value=String(event.detail);};
window.addEventListener('aw-demo-notice',notify);
onBeforeUnmount(()=>window.removeEventListener('aw-demo-notice',notify));
</script>
<style>
.aw-demo-notice{position:sticky;top:0;z-index:10000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;background:#fff7df;border-bottom:1px solid #d0a342;color:#614500;font:14px/1.5 Inter,Arial,sans-serif}.aw-demo-notice button{background:transparent;border:0;padding:8px;font-size:22px;color:inherit;cursor:pointer}.aw-demo .sched-wrap{--primary:#155ac7;--primary-color:#155ac7}.aw-demo .aw-content{min-width:0}.aw-demo .aw-header{position:static}
.aw-demo .aw-app .sched-command__book{background:#155ac7;box-shadow:none}.aw-demo .aw-app .sched-command__book:hover:not(:disabled){background:#104895}.aw-demo .aw-app .sched-command__outline{border-color:#ceddf5;color:#155ac7}.aw-demo .aw-app .sched-command__outline:hover:not(:disabled){background:#f0f5ff}.aw-demo .aw-identity button{margin-left:auto;padding:7px 12px;border:1px solid #c8bb96;background:white;color:#65512c;border-radius:6px;cursor:pointer}
@media(max-width:600px){.aw-demo .aw-app .sched-command__brand{flex-wrap:wrap}.aw-demo .aw-app .sched-command__dates{flex-wrap:wrap}.aw-demo .aw-app .sched-command__range{white-space:normal}}
.aw-demo .aw-app .sched-command__title-icon{background:#eaf2ff;color:#155ac7}
</style>
