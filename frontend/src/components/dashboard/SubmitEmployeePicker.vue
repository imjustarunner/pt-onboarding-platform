<template>
  <section class="submit-employee-picker" aria-label="Choose whose Submit page to view">
    <label for="submit-employee-search">View or submit for an employee</label>
    <input id="submit-employee-search" v-model="search" type="search" placeholder="Search employees by name" :disabled="loading || !agencyId" />
    <select aria-label="Employee Submit page" :value="selected?.id || ''" :disabled="loading || !agencyId" @change="selectEmployee($event.target.value)">
      <option value="">My Submit page</option>
      <option v-for="person in filtered" :key="person.id" :value="person.id">{{ person.lastName }}, {{ person.firstName }}</option>
    </select>
    <button v-if="selected" class="btn btn-secondary" type="button" @click="selectEmployee('')">Return to my Submit</button>
    <p v-if="loading" role="status">Loading employees…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({agencyId:[Number,String],selected:Object});
const emit=defineEmits(['select']);
const employees=ref([]), search=ref(''), loading=ref(false), error=ref('');
let generation=0;
const filtered=computed(()=>employees.value.filter(p=>Number(p.id)===Number(props.selected?.id) || `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.value.trim().toLowerCase())));
function selectEmployee(id) { emit('select',employees.value.find(p=>Number(p.id)===Number(id)) || null); }
async function load(){
  const seq=++generation; employees.value=[]; error.value=''; loading.value=false;
  if(!props.agencyId)return;
  loading.value=true;
  try { const {data}=await api.get('/payroll/submit-for/employees',{params:{agencyId:props.agencyId}}); if(seq===generation)employees.value=data; }
  catch(e){if(seq===generation)error.value=e.response?.data?.error?.message || 'Could not load employees.';}
  finally{if(seq===generation)loading.value=false;}
}
watch(()=>props.agencyId,()=>{emit('select',null); search.value=''; load();},{immediate:true});
</script>
<style scoped>
.submit-employee-picker { display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:16px; margin-bottom:18px; border:1px solid #cbd5e1; border-radius:12px; }
label { font-weight:650; }
input,select { min-width:180px; max-width:100%; padding:9px; border:1px solid #94a3b8; border-radius:6px; }
p { flex-basis:100%; margin:0; }
@media(max-width:600px){ input,select { width:100%; } }
</style>
