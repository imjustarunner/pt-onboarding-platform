<template>
  <div class="record-calendar" :style="{'--calendar-days':days}" aria-label="Schedule calendar">
    <section v-for="day in calendarDays" :key="day.key" class="record-day">
      <h2>{{ day.label }}</h2>
      <p v-if="!day.records.length" class="empty">No events</p>
      <ol v-else><li v-for="record in day.records" :key="record.key" :class="{'canceled':/cancel/i.test(record.status)}">
        <button type="button" @click="$emit('select',record)"><time>{{ record.timeLabel || time(record) }}</time><strong>{{ record.clientName || record.title }}</strong><span v-if="record.clientName">{{ record.title }}</span><span>{{ record.providerName }}</span><span>{{ record.location }}</span><small v-if="record.status">{{ record.status.replaceAll('_',' ') }}</small></button>
      </li></ol>
    </section>
  </div>
</template>
<script setup>
import {computed} from 'vue';
const props=defineProps({records:{type:Array,default:()=>[]},start:{type:String,required:true},days:{type:Number,default:7},timeZone:{type:String,default:'America/Denver'}});
defineEmits(['select']);
const calendarDays=computed(()=>Array.from({length:props.days},(_,index)=>{
  const date=new Date(`${props.start}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+index);const key=date.toISOString().slice(0,10);
  return {key,label:new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(date),records:props.records.filter(r=>occursOn(r,key)).sort((a,b)=>String(a.startAt||'').localeCompare(String(b.startAt||'')))};
}));
function zonedDate(value){const parts=new Intl.DateTimeFormat('en-US',{timeZone:props.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));return ['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');}
function occursOn(record,key){if(!record.startAt||!record.endAt)return record.date===key;return zonedDate(record.startAt)<=key&&zonedDate(new Date(record.endAt).getTime()-1)>=key;}
function time(record){if(record.allDay)return 'All day';if(!record.startAt)return 'Time not set';const format=new Intl.DateTimeFormat('en-US',{timeZone:props.timeZone,hour:'numeric',minute:'2-digit'});return `${format.format(new Date(record.startAt))}–${format.format(new Date(record.endAt))}`;}
</script>
<style scoped>
.record-calendar{display:grid;grid-template-columns:repeat(var(--calendar-days),minmax(145px,1fr));gap:10px;overflow:auto;padding:3px 3px 18px}.record-day{border:1px solid #d7e2f0;border-radius:12px;background:#fff;min-height:270px;min-width:0;padding:12px}.record-day h2{font-size:15px;margin:0 0 16px;color:#173c62}.empty{color:#64748b;font-size:13px}ol{list-style:none;padding:0;margin:0;display:grid;gap:10px}li{border-left:3px solid #2467a7;border-radius:6px;background:#edf5fc}.record-calendar button{display:flex;flex-direction:column;gap:5px;width:100%;text-align:left;border:0;background:transparent!important;color:#173c62!important;padding:10px!important;font:inherit;cursor:pointer;overflow-wrap:anywhere}time,span,small{font-size:12px}strong{font-size:14px}.canceled{opacity:.65;border-color:#64748b}.canceled strong{text-decoration:line-through}@media(max-width:700px){.record-calendar{grid-template-columns:1fr}.record-day{min-height:100px}}
</style>
