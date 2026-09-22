<template>
 <label>Preferred day<select :value="modelValue.day||''" @change="update('day',$event.target.value)"><option value="">Any day</option><option v-for="[value,label] in appointmentDays" :key="value" :value="value">{{label}}</option></select></label>
 <label>At or after<input type="time" :value="modelValue.timeFrom||''" @input="update('timeFrom',$event.target.value)"/><button type="button" class="time-shortcut" @click="update('timeFrom','16:00')">After 4 PM</button></label>
 <label>At or before<input type="time" :value="modelValue.timeTo||''" @input="update('timeTo',$event.target.value)"/></label>
 <p v-if="modelValue.day||modelValue.timeFrom||modelValue.timeTo" class="time-filter-note">Matches posted appointment start times over the next four weeks · {{timeZone==='America/Denver'?'Mountain time':timeZone}}. <button type="button" @click="$emit('update:modelValue',{})">Clear time preferences</button></p>
</template>
<script setup>
import {appointmentDays} from '../../utils/providerTimeSearch';
const props=defineProps({modelValue:{type:Object,default:()=>({})},timeZone:{type:String,default:'America/Denver'}}),emit=defineEmits(['update:modelValue']);
const update=(key,value)=>emit('update:modelValue',{...props.modelValue,[key]:value});
</script>
<style scoped>label{display:grid;align-content:start;gap:5px;font-size:12px;font-weight:600;min-width:0}select,input{box-sizing:border-box;padding:10px 12px;font:inherit;font-size:13px;min-width:0;min-height:42px;border:1px solid #cbdcd4;border-radius:9px;background:white;color:#244c42;width:100%}.time-shortcut,.time-filter-note button{font:inherit;color:inherit;border:0;background:transparent;text-decoration:underline;cursor:pointer;text-align:left;padding:3px 0}.time-filter-note{grid-column:1/-1;font-size:12px;margin:0}.time-filter-note button{margin-left:8px}</style>
