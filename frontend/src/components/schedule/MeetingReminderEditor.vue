<template>
  <fieldset class="meeting-reminders" :disabled="disabled">
    <legend>Reminders</legend>
    <p>Choose every reminder you want before each session.</p>
    <label v-for="option in options" :key="option.value">
      <input type="checkbox" :checked="modelValue.includes(option.value)" @change="toggle(option.value, $event.target.checked)" /> {{ option.label }}
    </label>
    <div><input v-model.number="minutes" type="number" min="1" max="10080" aria-label="Additional reminder minutes before" placeholder="Minutes before" />
      <button type="button" :disabled="!valid || modelValue.length >= 10" @click="add">Add reminder</button></div>
    <p v-if="!modelValue.length">No reminders selected.</p>
  </fieldset>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ modelValue: {type:Array,default:()=>[5]}, disabled:Boolean });
const emit = defineEmits(['update:modelValue']);
const minutes = ref(null);
const valid = computed(()=>Number.isInteger(minutes.value)&&minutes.value>0&&minutes.value<=10080);
const options = computed(()=>[...new Set([5,15,30,60,1440,'business_days_3',...props.modelValue])].map(value=>({value,label:value==='business_days_3'?'3 business days before':value===1440?'1 day before':value===60?'1 hour before':`${value} minutes before`})));
function toggle(value,on){emit('update:modelValue',on?[...new Set([...props.modelValue,value])].slice(0,10):props.modelValue.filter(v=>v!==value));}
function add(){if(valid.value){toggle(minutes.value,true);minutes.value=null;}}
</script>
<style scoped>
.meeting-reminders{border:1px solid #dbe4ec;border-radius:10px;padding:12px}.meeting-reminders label{display:inline-flex;gap:8px;margin:6px 18px 6px 0}.meeting-reminders input[type=number]{width:130px;margin:8px}.meeting-reminders p{font-size:.85rem}
</style>
