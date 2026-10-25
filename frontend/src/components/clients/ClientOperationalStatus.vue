<template>
  <section class="operational-status" aria-label="Session and documentation status">
    <h3>Sessions &amp; documentation status</h3>
    <p v-if="loading">Loading session status…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else>
      <p>{{ scope }}</p>
      <p v-if="!sessions.length">No recorded clinical sessions yet.</p>
      <div class="table-wrap" v-else><table>
        <thead><tr><th>Session date</th><th>Session</th><th>Note</th><th>Claim</th></tr></thead>
        <tbody><tr v-for="session in sessions" :key="session.sessionId">
          <td>{{ session.startsAt || 'Date not recorded' }}</td><td>{{ session.sessionStatus }}</td>
          <td>{{ session.noteStatus }}</td><td>{{ session.claimStatus }}</td>
        </tr></tbody>
      </table></div>
    </template>
    <button type="button" :disabled="loading" @click="load">Refresh status</button>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:{type:Number,required:true}});
const sessions=ref([]),scope=ref(''),loading=ref(false),error=ref('');let generation=0;
async function load(){const version=++generation;sessions.value=[];error.value='';loading.value=true;
  try{const {data}=await api.get(`/clients/${props.clientId}/operational-status`);if(version===generation){sessions.value=data.sessions;scope.value=data.scope;}}
  catch{if(version===generation)error.value='Session status is unavailable. Retry or ask the care team; this does not mean a note or claim is missing.';}
  finally{if(version===generation)loading.value=false;}
}
watch(()=>props.clientId,load,{immediate:true});
</script>
<style scoped>.operational-status{border:1px solid #d9e2ec;border-radius:10px;padding:16px;margin:14px 0}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #e4eaf1}p{font-size:13px;color:#52667c}</style>
