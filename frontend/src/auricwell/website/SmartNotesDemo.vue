<template>
 <section class="smart-demo" aria-label="Blank Smart Notes demonstration">
  <p class="smart-notice" role="status">{{ NARRIVA_DEMO_INPUT_NOTICE }}</p>
  <nav aria-label="Smart Notes categories"><button v-for="(label,index) in categories" :key="label" type="button" :aria-current="step===index+1?'step':undefined" @click="step=index+1"><span>{{ index+1 }}</span>{{ label }}</button></nav>
  <div class="smart-preview">
   <NoteAidCsNoteBuildPanel preview-only :preview-step="step" :is-telehealth="true" :goals="blankGoals" />
   <button class="smart-overlay" type="button" aria-label="Demonstration only: fields do not accept data" @click="$emit('entry-attempt')"></button>
  </div>
  <footer><button type="button" :disabled="step===1" @click="step--">Previous category</button><span>{{ step }} of {{ categories.length }}</span><button type="button" :disabled="step===categories.length" @click="step++">Next category</button></footer>
 </section>
</template>
<script setup>
import {ref} from 'vue';
import NoteAidCsNoteBuildPanel from '../../components/clinical/NoteAidCsNoteBuildPanel.vue';
import {NARRIVA_DEMO_INPUT_NOTICE} from '../demo/narriva.js';
defineEmits(['entry-attempt']);
const step=ref(1);
const categories=['Start time','End time','Participants','Session focus','Interventions','How interventions were used','Client response','Medical necessity','MSE & safety','Treatment progress','Telehealth verification','Next-service plan'];
const blankGoals=[{id:'blank-preview-goal',goal_text:'Treatment goal',objectives:[{id:'blank-preview-objective',objective_text:'Treatment objective'}]}];
</script>
<style scoped>
.smart-demo{margin-top:20px;min-width:0}.smart-notice{background:#fff7e2;border:1px solid #eddaad;padding:12px;border-radius:8px;font-size:12px;line-height:1.7}.smart-demo nav{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0}.smart-demo nav button{font:inherit;font-size:11px;line-height:1.5;padding:8px;border:1px solid #cbdbea;background:#fff;border-radius:6px;color:#335e80;cursor:pointer}.smart-demo nav button span{margin-right:5px;color:#98772e}.smart-demo nav button[aria-current]{background:#e7f3fc;border-color:#4786af}.smart-preview{position:relative;min-width:0}.smart-overlay{position:absolute;inset:0;width:100%;height:100%;background:transparent;border:0;cursor:help;border-radius:12px}.smart-demo footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:15px;font-size:11px}.smart-demo footer button{font:inherit;border:1px solid #c7d9e8;padding:9px;border-radius:6px;background:white;color:#2c5e89;cursor:pointer}.smart-demo footer button:disabled{opacity:.4}.smart-demo :deep(.csnb-head h2){font-size:20px}.smart-demo :deep(.csnb-head p){font-size:12px}.smart-demo :deep(input),.smart-demo :deep(textarea),.smart-demo :deep(select){opacity:1!important;-webkit-text-fill-color:#34495e}.smart-demo :deep(.csnb){padding:15px}.smart-demo :deep(.csnb-two){grid-template-columns:1fr}.smart-demo :deep(.csnb-step h3){font-size:15px}.smart-demo :deep(.csnb-chips){flex-wrap:wrap}
</style>
