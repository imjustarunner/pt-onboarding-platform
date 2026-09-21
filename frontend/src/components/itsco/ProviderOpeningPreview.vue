<template>
 <section class="opening-preview" aria-label="Appointment availability">
  <div class="next-opening"><Icon name="calendar"/><div><small>Next opening</small><strong>{{nextLabel || message}}</strong></div></div>
  <template v-if="days.length"><small class="week-label">This week · Mountain time</small><div class="week-times"><div v-for="day in days" :key="day.key"><span>{{day.label}}</span><small v-for="slot in day.slots.slice(0,2)" :key="slot.startAt+slot.programType"><Icon :name="slot.programType==='VIRTUAL'?'screen':'pin'"/>{{formatTime(slot.startAt)}}</small><span v-if="!day.slots.length" class="no-time">—</span><span v-if="day.slots.length>2">+{{day.slots.length-2}} more</span></div></div></template>
 </section>
</template>
<script setup>
import {computed} from 'vue';
import Icon from '../rise/RiseIcon.vue';
import {openingWeek} from '../../utils/providerOpenings';
const props=defineProps({next:String,slots:{type:Array,default:()=>[]},message:String});
const formatTime=v=>new Date(v).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Denver'});
const nextLabel=computed(()=>props.next?new Date(props.next).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver'})+' MT':'');
const days=computed(()=>openingWeek(props.slots));
</script>
<style scoped>.opening-preview{border-top:1px solid #dfe9e4;padding-top:12px;margin-top:auto}.next-opening{display:flex;gap:10px;align-items:center}.next-opening>svg{width:23px;height:23px;color:#2b7255;flex-shrink:0}.next-opening small{display:block;color:#566b64;font-size:11px}.next-opening strong{display:block;font-size:13px;line-height:1.5;color:#246449}.week-label{display:block;font-size:11px;margin:10px 0 6px}.week-times{display:flex;overflow-x:auto;gap:4px}.week-times>div{flex:1;min-width:43px;background:#f1f6f4;border-radius:9px;padding:6px 2px;display:flex;align-items:center;flex-direction:column;gap:5px;font-size:10px}.week-times small{font-size:9px;white-space:nowrap;background:#d9f1e5;border-radius:8px;padding:3px;display:flex;align-items:center;gap:2px}.week-times svg{width:10px;height:10px}.no-time{color:#788980}</style>
