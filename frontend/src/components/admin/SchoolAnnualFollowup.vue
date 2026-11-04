<template>
  <section v-if="row.annualEligible && row.status !== 'finalized'" class="annual-followup">
    <h4>Outstanding information</h4>
    <ul><li v-for="(item,index) in row.outstanding || []" :key="index">{{ item.label }}</li></ul>
    <p>Schools and Support own this follow-up. Saved answers remain available in Sections.</p>
    <p v-if="row.followup">Follow-up: {{ row.followup.status }}<span v-if="row.followup.extension_until"> · extension through {{ String(row.followup.extension_until).slice(0,10) }}</span><br>{{ row.followup.resolution_note }}</p>
    <form v-if="row.cycleId" @submit.prevent="save">
      <label>Action<select v-model="action"><option value="extend">Grant a dated extension</option><option value="waive">Waive outstanding follow-up</option><option value="reopen">Reopen staff follow-up</option></select></label>
      <label v-if="action === 'extend'">Extension end date<input v-model="extensionUntil" type="date" required></label>
      <label>Follow-up note<textarea v-model="note" required maxlength="2000" placeholder="Record the contact plan or reason for this decision."></textarea></label>
      <button class="btn btn-primary btn-sm" :disabled="busy">Save follow-up</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </section>
</template>
<script setup>
import { ref } from 'vue';import api from '../../services/api';
const props=defineProps({row:{type:Object,required:true}}),emit=defineEmits(['saved']);
const action=ref('extend'),extensionUntil=ref(''),note=ref(''),busy=ref(false),error=ref('');
async function save(){busy.value=true;error.value='';try{await api.put(`/school-reinit/cycles/${props.row.cycleId}/followup`,{action:action.value,extensionUntil:extensionUntil.value,note:note.value});note.value='';emit('saved');}catch(e){error.value=e?.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
</script>
<style scoped>.annual-followup{padding:14px;background:var(--bg-secondary,#f4f8fb);border-radius:8px;margin-bottom:16px}.annual-followup label{display:grid;gap:5px;margin:10px 0}.annual-followup input,.annual-followup select,.annual-followup textarea{padding:8px;border:1px solid #bbc8d0;border-radius:6px}.annual-followup textarea{min-height:70px}[role=alert]{color:#a12222}</style>
