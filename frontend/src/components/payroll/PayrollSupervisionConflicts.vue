<template>
  <section class="psc">
    <h3>Review supervision conflicts</h3>
    <p>Choose which source to use when an imported supervision entry overlaps with recorded attendance. Existing compensation eligibility rules still apply.</p>
    <p v-if="loading" role="status">Checking supervision sources…</p>
    <p v-if="error" role="alert">{{ error }} <button class="btn btn-secondary" :disabled="loading" @click="reload">Retry review</button></p>
    <p v-if="loaded && !loading && !pending.length" role="status">No unresolved supervision conflicts.</p>
    <div v-if="pending.length" class="psc-table"><table><thead><tr><th>Provider</th><th>Date</th><th>Imported minutes</th><th>App attendance minutes</th><th>Use source</th></tr></thead>
      <tbody><tr v-for="row in pending" :key="`${row.user_id}:${row.service_date}:${row.legacy_service_code}`"><td>{{ row.provider_name }}</td><td>{{ row.service_date }}</td><td>{{ row.legacy_units_total }}</td><td>{{ row.app_attended_minutes }}</td><td class="psc-actions"><button class="btn btn-primary" :disabled="saving" @click="resolve(row,'use_app_attendance')">Use app attendance</button><button class="btn btn-secondary" :disabled="saving" @click="resolve(row,'use_legacy_import')">Use imported entry</button></td></tr></tbody>
    </table></div>
  </section>
</template>
<script setup>
import {ref,computed,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({periodId:{type:Number,required:true}}),emit=defineEmits(['changed','readiness']);
const rows=ref([]),loading=ref(false),loaded=ref(false),saving=ref(false),error=ref('');
const pending=computed(()=>rows.value.filter(r=>!r.resolution));
let generation=0;
async function reload(){const g=++generation;loading.value=true;loaded.value=false;error.value='';try{const {data}=await api.get(`/payroll/periods/${props.periodId}/reports/supervision-conflicts`,{skipGlobalLoading:true});if(g===generation){rows.value=data.rows || [];loaded.value=true;}}catch(e){if(g===generation)error.value=e?.response?.data?.error?.message || e.message;}finally{if(g===generation)loading.value=false;}}
async function resolve(row,resolution){saving.value=true;error.value='';try{await api.put(`/payroll/periods/${props.periodId}/supervision-conflicts/resolution`,{userId:row.user_id,serviceDate:row.service_date,resolution,note:'Reviewed overlapping supervision sources in the payroll wizard.'},{skipGlobalLoading:true});rows.value=rows.value.map(r=>r.user_id===row.user_id && r.service_date===row.service_date?{...r,resolution}:r);emit('changed');}catch(e){error.value=e?.response?.data?.error?.message || e.message;}finally{saving.value=false;}}
watch(()=>props.periodId,reload,{immediate:true});
watch([loading,saving,loaded,error,pending],()=>emit('readiness',{loading:loading.value,saving:saving.value,error:error.value,pendingCount:pending.value.length,ready:loaded.value && !loading.value && !saving.value && !error.value && !pending.value.length}),{immediate:true});
defineExpose({reload});
</script>
<style scoped>
.psc { margin-top:20px; padding:16px; border:1px solid var(--border-color,#dbe4ec); border-radius:12px; }
.psc-table { overflow:auto; } table {width:100%;border-collapse:collapse;} th,td {text-align:left;padding:10px;} .psc-actions {display:flex;flex-wrap:wrap;gap:8px;}
</style>
