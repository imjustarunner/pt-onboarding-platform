<template>
  <section class="provider-day" aria-label="Provider day schedules">
    <p class="day-key">{{ date }} · {{ timeZone }} · Each column is one provider. Cards show appointment type, source, and exact time. Opening a provider’s calendar does not start a session.</p>
    <div class="day-scroll"><div class="day-grid" :style="{gridTemplateColumns:`76px repeat(${userIds.length},minmax(190px,1fr))`}">
      <div class="day-heading">Time</div><button v-for="id in userIds" :key="id" class="day-heading" :style="color(id)" @click="$emit('open-user',Number(id))">{{ userLabels[id] || `Provider #${id}` }}<small>{{ entries[id].length }} calendar items</small></button>
      <template v-for="hour in hours" :key="hour"><div class="day-time">{{ hourLabel(hour) }}</div><div v-for="id in userIds" :key="`${id}:${hour}`" class="day-cell"><article v-for="item in entries[id].filter(e=>e.hour===hour)" :key="item.key" class="day-event" :style="color(id)"><strong>{{ item.type }}</strong><span>{{ item.title }}</span><span v-if="item.serviceCode">{{ item.serviceCode }}</span><small>{{ item.allDay?'All day':item.timeLabel }}</small><small>{{ item.source }}</small></article></div></template>
    </div></div>
    <p v-if="!Object.values(entries).some(list=>list.length)">No calendar items returned for the selected day.</p>
  </section>
</template>
<script setup>
import {computed} from 'vue';
import {dayScheduleEntries} from '../../utils/providerDaySchedule.js';
const props=defineProps({userIds:{type:Array,default:()=>[]},userLabels:{type:Object,default:()=>({})},summaries:{type:Object,default:()=>({})},date:{type:String,required:true},timeZone:{type:String,default:'America/Denver'},detailLevel:{type:String,default:'full'}});
defineEmits(['open-user']);
const entries=computed(()=>Object.fromEntries(props.userIds.map(id=>[id,dayScheduleEntries(props.summaries[id],props.date,props.timeZone,props.detailLevel)])));
const hours=computed(()=>{const values=Object.values(entries.value).flat().map(e=>e.hour);const start=Math.min(7,...values),end=Math.max(21,...values);return Array.from({length:end-start+1},(_,i)=>start+i);});
const color=id=>({'--provider-color':`hsl(${Number(id)*47%360} 55% 45%)`});
const hourLabel=h=>`${h%12 || 12} ${h<12?'AM':'PM'}`;
</script>
<style scoped>
.day-key{font-size:.85rem;color:var(--text-secondary,#526277);line-height:1.5}.day-scroll{overflow:auto;border:1px solid var(--border-color,#dbe3eb);border-radius:10px}.day-grid{display:grid;min-width:max-content;background:var(--bg-primary,#fff)}.day-heading{position:sticky;top:0;z-index:1;background:var(--bg-secondary,#eff5f8);padding:14px;border:0;border-bottom:3px solid var(--provider-color,#adbac8);font:inherit;text-align:left;color:inherit}.day-heading small{display:block;margin-top:5px;color:var(--text-secondary,#526277)}.day-time,.day-cell{border-right:1px solid var(--border-color,#dbe3eb);border-bottom:1px solid var(--border-color,#dbe3eb);padding:8px;min-height:66px}.day-time{font-weight:600;font-size:.85rem}.day-event{display:flex;flex-direction:column;gap:3px;border-left:4px solid var(--provider-color);border-radius:7px;background:var(--bg-secondary,#f2f6fa);padding:9px;margin-bottom:7px;font-size:.85rem;max-width:260px;overflow-wrap:anywhere}.day-event strong{color:var(--text-primary,#163650)}.day-event small{color:var(--text-secondary,#526277)}
</style>
