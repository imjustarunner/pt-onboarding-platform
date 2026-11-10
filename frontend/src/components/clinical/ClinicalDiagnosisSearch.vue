<template>
 <div class="cds">
  <label :for="inputId">{{ label }}</label>
  <input :id="inputId" :value="query" type="search" role="combobox" aria-autocomplete="list" :aria-expanded="open && items.length>0" :aria-controls="inputId+'-results'" :aria-activedescendant="active>=0?inputId+'-'+active:undefined" :disabled="disabled" autocomplete="off" maxlength="100" placeholder="Search diagnosis or ICD-10-CM code…" @input="change($event.target.value)" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="acceptActive" @keydown.esc="open=false" @focus="open=true" @blur="closeSoon" />
  <span v-if="loading" role="status">Searching diagnoses…</span><p v-if="error" role="alert">{{ error }}</p>
  <ul v-if="open && items.length" :id="inputId+'-results'" role="listbox"><li v-for="(item,index) in items" :id="inputId+'-'+index" :key="item.code" role="option" :aria-selected="active===index" @mousedown.prevent="select(item)"><button type="button" tabindex="-1" @click="select(item)"><strong>{{ item.code }}</strong> — {{ item.description }}</button></li></ul>
  <small v-if="!loading && searched && !items.length && !error && !modelValue">No matching code found. Try another word or code.</small>
 </div>
</template>
<script setup>
import {ref,watch,onBeforeUnmount,useId} from 'vue';
import api from '../../services/api';
const props=defineProps({modelValue:String,label:{type:String,default:'Diagnosis'},agencyId:[Number,String],dateOfService:String,disabled:Boolean,search:Function});
const emit=defineEmits(['update:modelValue','select']);
const inputId='diagnosis-'+useId(),query=ref(props.modelValue || ''),items=ref([]),active=ref(-1),open=ref(false),loading=ref(false),searched=ref(false),error=ref('');
let timer,blurTimer,sequence=0,controller;
watch(()=>props.modelValue,value=>{if(!value && props.modelValue!==query.value)query.value='';else if(value && !query.value.startsWith(value))query.value=value;});
watch(()=>[props.agencyId,props.dateOfService],()=>{cancel();items.value=[];searched.value=false;});
function cancel(){sequence++;clearTimeout(timer);controller?.abort();loading.value=false;}
function change(value) {
 cancel();query.value=value;items.value=[];active.value=-1;error.value='';searched.value=false;open.value=true;emit('update:modelValue',value);
 if(value.trim().length<2)return;
 const current=sequence;
 timer=setTimeout(async()=>{
  controller=new AbortController();loading.value=true;
  try {
   const payload={agencyId:Number(props.agencyId),query:value.trim(),...(props.dateOfService?{dateOfService:props.dateOfService}:{})};
   const result=props.search?await props.search(payload,{signal:controller.signal}):await api.post('/clinical-notes/diagnosis-search',payload,{skipGlobalLoading:true,signal:controller.signal});
   if(current!==sequence)return;
   items.value=(result.data || result).items || [];searched.value=true;
  } catch(e){if(current===sequence)error.value=e.response?.data?.error?.message || 'Diagnosis search is unavailable. Your note is preserved.';}
  finally{if(current===sequence)loading.value=false;}
 },250);
}
function select(item){cancel();query.value=`${item.code} — ${item.description}`;items.value=[];active.value=-1;open.value=false;emit('update:modelValue',item.code);emit('select',item);}
function move(step){open.value=true;if(items.value.length)active.value=active.value<0?(step>0?0:items.value.length-1):(active.value+step+items.value.length)%items.value.length;}
function acceptActive(){if(active.value>=0&&items.value[active.value])select(items.value[active.value]);}
function closeSoon(){blurTimer=setTimeout(()=>{open.value=false;},150);}
onBeforeUnmount(()=>{cancel();clearTimeout(blurTimer);});
</script>
<style scoped>
.cds{position:relative;display:grid;gap:6px;min-width:0;margin:9px 0}.cds label{font-size:13px;font-weight:600}.cds input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #bacddd;border-radius:7px;font:inherit;color:inherit}.cds ul{position:absolute;top:100%;left:0;right:0;z-index:30;max-height:280px;overflow:auto;list-style:none;padding:4px;margin:0;background:white;border:1px solid #bacddd;border-radius:7px;box-shadow:0 5px 18px #1233}.cds li[aria-selected=true]{background:#e9f2ff}.cds button{width:100%;padding:10px;text-align:left;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.cds button:hover{background:#e9f2ff}.cds span,.cds small,.cds p{font-size:12px;margin:0}.cds p{color:#9c2727}
</style>
