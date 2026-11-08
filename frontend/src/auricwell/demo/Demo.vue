<template>
  <div class="aw-demo">
    <div v-if="notice" class="aw-demo-notice" role="status"><span>{{ notice }}</span><button type="button" @click="notice = ''" aria-label="Dismiss demo notice">×</button></div>
    <App :demo-context="{practice,actor}">
      <template #clients><DemoPeople section="clients" /></template>
      <template #providers><DemoPeople section="providers" /></template>
      <template #tasks><DemoTasks /></template>
      <template #documentation><DemoDocumentation /></template>
      <template #appointments>
        <section class="demo-calendar" aria-label="Fictional practice calendar">
        <p class="aw-caption">A week in the practice · One-hour visits, virtual and couples sessions, supervision and team time. All examples are fictional; no bookings or notifications are sent.</p>
        <div class="demo-calendar-key" aria-label="Calendar color key"><span v-for="type in calendarTypes" :key="type.key"><i :style="{background:type.color}" aria-hidden="true" />{{ type.label }}</span><span class="demo-canceled-label"><i class="demo-canceled-key" aria-hidden="true"/>Canceled session</span></div>
        <ScheduleWorkspace :agency="practice" :actor="actor" :week-start="weekStart" />
        </section>
      </template>
    </App>
  </div>
</template>
<script setup>
import {ref,onBeforeUnmount,watch} from 'vue';
import App from '../App.vue';
import DemoPeople from './DemoPeople.vue';
import DemoTasks from './DemoTasks.vue';
import DemoDocumentation from './DemoDocumentation.vue';
import {useRoute} from 'vue-router';
import ScheduleWorkspace from '../ScheduleWorkspace.vue';
import {practice,actor,weekStart} from './fixtures';
import {SCHEDULE_COLOR_OPTIONS} from '../../utils/scheduleAppearance';
const calendarTypes=SCHEDULE_COLOR_OPTIONS.filter(type=>['client_session','supervision','team_meeting','town_hall','cpa_meeting'].includes(type.key));
const route=useRoute();
const notice=ref('');watch(()=>route.path,()=>{notice.value='';});const notify=event=>{notice.value=String(event.detail);};
window.addEventListener('aw-demo-notice',notify);
onBeforeUnmount(()=>window.removeEventListener('aw-demo-notice',notify));
</script>
<style>
.demo-calendar-key{display:flex;flex-wrap:wrap;gap:10px 18px;font-size:12px;color:#506681;margin:0 0 16px}.demo-calendar-key>span{display:inline-flex;align-items:center;gap:7px}.demo-calendar-key i{display:inline-block;width:11px;height:11px;border-radius:3px}.demo-calendar-key .demo-canceled-key{background:#1D4ED8;opacity:.6}.demo-canceled-label{text-decoration:line-through;color:#748296}
.aw-demo-notice{position:sticky;top:0;z-index:10000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;background:#fff7df;border-bottom:1px solid #d0a342;color:#614500;font:14px/1.5 Inter,Arial,sans-serif}.aw-demo-notice button{background:transparent;border:0;padding:8px;font-size:22px;color:inherit;cursor:pointer}.aw-demo .aw-content{min-width:0}.aw-demo .aw-header{position:static}
.aw-demo .aw-identity button{margin-left:auto;padding:7px 12px;border:1px solid #c8bb96;background:white;color:#65512c;border-radius:6px;cursor:pointer}
</style>
