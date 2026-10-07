<template>
 <section><h3>Handbook draft and Colorado appendix</h3><p>Edit the proposed sections here. Saving a draft does not publish a handbook or change pay.</p>
  <p v-if="error" role="alert">{{error}}</p>
  <div v-for="s in sections" :key="s.id" class="section"><details><summary>{{s.title}}</summary><label>Section title<input v-model="s.title" /></label><DraftHtmlEditor :agency-id="agencyId" v-model="s.body_html" :label="s.title" /><button :disabled="busy" @click="save(s)">Save section</button></details></div>
  <p role="status">{{notice}}</p>
 </section>
</template>
<script setup>
import {onMounted,ref,watch} from 'vue';import api from '../../services/api';import DraftHtmlEditor from '../admin/DraftHtmlEditor.vue';
const props=defineProps({agencyId:{type:[String,Number],required:true}});const sections=ref([]),error=ref(''),notice=ref(''),busy=ref(false);
async function load(){try{sections.value=(await api.get('/provider-update/handbook/draft',{params:{agencyId:props.agencyId}})).data.sections||[];}catch(e){error.value=e.response?.data?.error?.message||'Could not load handbook draft.';}}
async function save(s){busy.value=true;error.value='';try{await api.put(`/provider-update/handbook/sections/${s.id}`,{agencyId:props.agencyId,title:s.title,bodyHtml:s.body_html,sortOrder:s.sort_order,slug:s.slug});notice.value=`Saved: ${s.title}`;}catch(e){error.value=e.response?.data?.error?.message||'Could not save section.';}finally{busy.value=false;}}
onMounted(load);watch(()=>props.agencyId,load);
</script>
<style scoped>.section{margin:14px 0;border:1px solid #d7e2db;border-radius:10px;padding:15px}summary{cursor:pointer;font-weight:600}input{width:100%;padding:9px;margin:8px 0}button{margin-top:12px;padding:9px 15px;background:#3e6d54;border:0;border-radius:8px;color:white}</style>
