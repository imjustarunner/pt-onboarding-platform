<template>
 <fieldset class="directory-multi"><legend>{{ label }} <small>{{ modelValue?.length || 0 }} selected</small></legend>
  <input v-model="search" type="search" :aria-label="`Search ${label}`" placeholder="Search options…" />
  <div class="directory-options"><label v-for="option in filtered" :key="option"><input type="checkbox" :checked="modelValue?.includes(option)" @change="toggle(option,$event.target.checked)" /> {{ option }}</label></div>
  <div v-if="custom" class="custom-option"><input v-model="other" :aria-label="`Add ${label} option`" placeholder="Add another option" maxlength="100" @keydown.enter.prevent="add" /><button type="button" @click="add">Add</button></div>
 </fieldset>
</template>
<script setup>
import {ref,computed} from 'vue';
const props=defineProps({label:String,options:Array,modelValue:Array,custom:Boolean});const emit=defineEmits(['update:modelValue']);
const search=ref(''),other=ref('');
const filtered=computed(()=>[...new Set([...(props.options||[]),...(props.modelValue||[])])].filter(v=>v.toLowerCase().includes(search.value.toLowerCase())));
function toggle(v,on){emit('update:modelValue',on?[...new Set([...(props.modelValue||[]),v])]:(props.modelValue||[]).filter(x=>x!==v));}
function add(){if(other.value.trim()){toggle(other.value.trim(),true);other.value='';}}
</script>
<style scoped>
.directory-multi{border:1px solid #ded7e3;border-radius:12px;padding:16px;min-width:0}.directory-multi legend{font-weight:700;padding:0 6px}.directory-multi small{font-weight:400;margin-left:8px;color:#716579}.directory-options{max-height:190px;overflow:auto;margin-top:10px;display:grid;gap:8px}.directory-options label{display:flex;align-items:center;gap:8px;font-size:14px}.directory-options input{width:auto!important;accent-color:#631957}.custom-option{display:flex;gap:6px;margin-top:10px}
</style>
