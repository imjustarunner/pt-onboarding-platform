<template>
  <div class="aw-demo">
    <div v-if="notice" class="aw-demo-notice" role="status"><span>{{ notice }}</span><button type="button" @click="notice = ''" aria-label="Dismiss demo notice">×</button></div>
    <App :demo-context="{practice,actor}">
      <template #clients><DemoPeople section="clients" /></template>
      <template #providers><DemoPeople section="providers" /></template>
      <template #tasks><DemoTasks /></template>
      <template #documentation><DemoDocumentation /></template>
      <template #appointments>
        <p class="aw-caption">The shared scheduling workspace · Fictional appointments and confirmation states. Try the calendar views or open Book session; bookings and notifications are not sent.</p>
        <ScheduleWorkspace :agency="practice" :actor="actor" :week-start="weekStart" />
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
const route=useRoute();
const notice=ref('');watch(()=>route.path,()=>{notice.value='';});const notify=event=>{notice.value=String(event.detail);};
window.addEventListener('aw-demo-notice',notify);
onBeforeUnmount(()=>window.removeEventListener('aw-demo-notice',notify));
</script>
<style>
.aw-demo-notice{position:sticky;top:0;z-index:10000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;background:#fff7df;border-bottom:1px solid #d0a342;color:#614500;font:14px/1.5 Inter,Arial,sans-serif}.aw-demo-notice button{background:transparent;border:0;padding:8px;font-size:22px;color:inherit;cursor:pointer}.aw-demo .aw-content{min-width:0}.aw-demo .aw-header{position:static}
.aw-demo .aw-identity button{margin-left:auto;padding:7px 12px;border:1px solid #c8bb96;background:white;color:#65512c;border-radius:6px;cursor:pointer}
</style>
