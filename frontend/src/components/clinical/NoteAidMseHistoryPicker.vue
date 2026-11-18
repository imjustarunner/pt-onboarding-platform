<template>
  <div v-if="rows.length" class="mse-history">
    <label>Previous mental status exam
      <select v-model="selectedKey" @change="confirmed=false">
        <option value="">Choose a prior note…</option>
        <option v-for="row in rows" :key="row.key" :value="row.key">{{ row.sourceDate }}{{ row.noteId ? ` · Note ${row.noteId}` : '' }}</option>
      </select>
    </label>
    <template v-if="selected">
      <p class="mse-history__hint">Prior findings are a reference. Confirm them for this session before applying; review and edit any changes.</p>
      <label class="mse-history__confirm"><input v-model="confirmed" type="checkbox" />I reviewed these findings and confirm they describe this session.</label>
    </template>
    <button type="button" :disabled="!selected || !confirmed" @click="apply">Apply reviewed findings</button>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { mseHistoryRows } from '../../utils/noteAidMseHistory.js';
const props=defineProps({history:{type:Array,default:()=>[]}});
const emit=defineEmits(['apply']);
const selectedKey=ref(''),confirmed=ref(false);
const rows=computed(()=>mseHistoryRows(props.history));
const selected=computed(()=>rows.value.find(row=>row.key===selectedKey.value)||null);
watch(()=>JSON.stringify(selected.value),()=>{confirmed.value=false;});
function apply(){
  if(!selected.value || !confirmed.value)return;
  emit('apply',JSON.parse(JSON.stringify({...selected.value,confirmedForCurrentSession:true})));
  confirmed.value=false;
}
</script>
<style scoped>
.mse-history{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0;padding:12px;border:1px solid var(--border,#d7dfeb);border-radius:10px;background:var(--bg-secondary,#f8fafc)}.mse-history label{display:grid;gap:6px}.mse-history select,.mse-history button{font:inherit;padding:8px;border:1px solid var(--border,#cbd5e1);border-radius:7px;background:var(--bg-primary,#fff)}.mse-history__confirm{display:flex!important;align-items:start;gap:7px!important}.mse-history__hint{flex-basis:100%;margin:0;color:var(--text-secondary,#526078);font-size:.85rem}.mse-history button:disabled{opacity:.5}
</style>
