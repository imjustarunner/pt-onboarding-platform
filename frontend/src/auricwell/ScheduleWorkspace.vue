<template><section class="aw-shared-schedule" data-analytics-area="schedule"><Schedule :key="providerId" :user-id="providerId" :agency-id="agency.id" :mode="providerId===Number(actor.id)?'self':'admin'" :week-start-ymd="date" :span-mode="span" @update:span-mode="setSpan" @update:week-start-ymd="setWeek" compact-page-chrome :schedule-title="providerId===Number(actor.id)?'My Schedule':'Provider schedule'" :show-company-events-calendar-button="false" :show-skill-builders-programs-button="false" /></section></template>
<script setup>
import {computed,defineAsyncComponent} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import './schedule.css';
const props=defineProps({agency:Object,actor:Object,weekStart:String});const route=useRoute(),router=useRouter();
const Schedule=defineAsyncComponent(()=>import('../components/schedule/ScheduleAvailabilityGrid.vue'));
const providerId=computed(()=>Number(route.query.scheduleViewAs||route.query.providerId)||Number(props.actor.id));
const date=computed(()=>String(route.query.weekStart||route.query.start||route.query.date||props.weekStart||'')||null);
const span=computed(()=>['day','agenda','week'].includes(route.query.view)?route.query.view:null);
function setSpan(view){if(view!==route.query.view)router.replace({query:{...route.query,view}});}
function setWeek(weekStart){if(weekStart!==date.value)router.replace({query:{...route.query,weekStart}});}
</script>
