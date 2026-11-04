<template>
  <section class="supervision-history">
    <h3>Supervisee supervision history</h3>
    <AssistantPacket :value="summary" />
    <template v-for="table in histories" :key="table.key">
      <h4>{{ table.label }} ({{ table.rows.length }})</h4>
      <p v-if="!table.rows.length">No recorded history.</p>
      <template v-else>
        <AssistantPacket :value="table.rows.slice((pages[table.key]-1)*50,pages[table.key]*50)" />
        <div class="history-pages"><button type="button" @click="pages[table.key]--" :disabled="pages[table.key]<=1">Previous</button><span>Page {{ pages[table.key] }} of {{ Math.ceil(table.rows.length/50) }}</span><button type="button" @click="pages[table.key]++" :disabled="pages[table.key]*50>=table.rows.length">Next</button></div>
      </template>
    </template>
  </section>
</template>
<script setup>
import {computed,reactive,watch} from 'vue';
import AssistantPacket from './AssistantPacket.vue';
const props=defineProps({value:{type:Object,required:true}}),pages=reactive({sessionHistory:1,tierHistory:1,importedPeriodHistory:1});
const summary=computed(()=>Object.fromEntries(Object.entries(props.value).filter(([key])=>!Object.hasOwn(pages,key))));
const histories=computed(()=>[{key:'sessionHistory',label:'Received supervision sessions'},{key:'tierHistory',label:'Saved pay-period tiers'},{key:'importedPeriodHistory',label:'Imported supervision periods'}].map(table=>({...table,rows:props.value[table.key]||[]})));
watch(()=>props.value,()=>{for(const key of Object.keys(pages))pages[key]=1;});
</script>
<style scoped>.supervision-history{margin:20px 0;padding:16px;border:1px solid #d7e2df;border-radius:8px}.history-pages{display:flex;align-items:center;gap:16px;flex-wrap:wrap}button{padding:8px 12px;cursor:pointer}button:disabled{opacity:.4;cursor:default}</style>
