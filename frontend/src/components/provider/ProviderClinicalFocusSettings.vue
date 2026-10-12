<template>
  <section class="clinical-focus-settings" aria-labelledby="clinical-focus-heading">
    <header><div><h2 id="clinical-focus-heading">{{ title }}</h2><p>Saved Provider Update choices appear here. Set which clients can match you and the top three highlights shown in each area on your public profile.</p></div><button v-if="loaded && !editing" type="button" @click="edit">Edit matching & top three</button></header>
    <p v-if="loading" role="status">Loading your saved clinical profile…</p>
    <div v-if="error" class="focus-error" role="alert">{{ error }} <button v-if="!loaded" type="button" @click="load">Try again</button></div>
    <p v-if="notice" class="focus-notice" role="status">{{ notice }}</p>
    <template v-if="loaded">
      <form v-if="editing" @submit.prevent="save">
        <fieldset :disabled="busy"><ProviderFocusEditor v-model="draft" :groups="groups" require-three :show-errors="showErrors" /></fieldset>
        <div class="focus-actions"><button type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save matching & top three' }}</button><button type="button" :disabled="busy" class="secondary" @click="cancel">Cancel</button></div>
      </form>
      <ProviderFocusSummary v-else :focus="saved" :facets="facets" />
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { missingFocusGroups } from '../../navigation/providerFocus.js';
import { invalidatePublicWebsite } from '../../services/publicWebsiteRead.js';
import ProviderFocusEditor from './ProviderFocusEditor.vue';
import ProviderFocusSummary from './ProviderFocusSummary.vue';
const props=defineProps({userId:{type:Number,required:true},agencyId:Number,title:{type:String,default:'My clinical profile & matching'}});
const emit=defineEmits(['saved']);
const loading=ref(false),loaded=ref(false),editing=ref(false),busy=ref(false),showErrors=ref(false),error=ref(''),notice=ref('');
const groups=ref([]),saved=ref({}),draft=ref({}),resolvedAgencyId=ref(null);
const copy=value=>JSON.parse(JSON.stringify(value));
const facets=computed(()=>Object.fromEntries(groups.value.map(g=>[g.key,g.options.filter(v=>!saved.value.excluded?.[g.key]?.includes(v))])));
let generation=0;
async function load(){
 const current=++generation;loading.value=true;loaded.value=false;error.value='';editing.value=false;notice.value='';
 try{
  const {data:agencies}=await api.get(`/users/${props.userId}/agencies`);
  const agency=agencies.find(a=>Number(a.id)===props.agencyId && (!a.organization_type || a.organization_type==='agency')) || agencies.find(a=>!a.organization_type || a.organization_type==='agency');
  if(!agency)throw new Error('An agency must be assigned before your clinical profile can be edited.');
  const {data}=await api.get(`/users/${props.userId}/provider-clinical-focus`,{params:{agencyId:agency.id}});
  if(current!==generation)return;
  resolvedAgencyId.value=Number(agency.id);groups.value=data.groups;saved.value=data.clinicalFocus;loaded.value=true;
 }catch(e){if(current===generation)error.value=e.response?.data?.error?.message||e.message||'Could not load your clinical profile.';}
 finally{if(current===generation)loading.value=false;}
}
watch(()=>[props.userId,props.agencyId],()=>{if(props.userId)load();},{immediate:true});
function edit(){draft.value=copy(saved.value);editing.value=true;showErrors.value=false;error.value='';notice.value='';}
function cancel(){editing.value=false;error.value='';showErrors.value=false;}
async function save(){
 error.value='';showErrors.value=true;
 if(missingFocusGroups(draft.value,groups.value).length){error.value='Choose three highlights or select the waiver for each unfinished category.';return;}
 busy.value=true;
 try{
  const {data}=await api.put(`/users/${props.userId}/provider-clinical-focus`,{agencyId:resolvedAgencyId.value,clinicalFocus:draft.value});
  groups.value=data.groups;saved.value=data.clinicalFocus;editing.value=false;notice.value='Saved. Your matching choices and public profile highlights are up to date.';
  invalidatePublicWebsite('/public/marketing-pages/itsco/website-data');emit('saved');
 }catch(e){error.value=e.response?.data?.error?.message||'Could not save. Your changes are still here; please try again.';}
 finally{busy.value=false;}
}
</script>
<style scoped>
.clinical-focus-settings{margin:24px 0;padding:24px;border:1px solid #d5e2db;border-radius:18px;background:#f7faf8;color:#24463d;min-width:0}.clinical-focus-settings header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px}.clinical-focus-settings h2{margin:0 0 8px;color:#24463d}.clinical-focus-settings header p{max-width:780px;margin:0;line-height:1.6}.clinical-focus-settings button{padding:12px 18px;border:1px solid #35624b;border-radius:10px;background:#35624b;color:#fff;font:inherit;font-weight:700;cursor:pointer;white-space:normal}.clinical-focus-settings header button{flex-shrink:0}.clinical-focus-settings button:disabled{opacity:.6;cursor:default}.clinical-focus-settings button.secondary{background:#fff;color:#35624b}.clinical-focus-settings fieldset{min-width:0;padding:0;border:0;margin:0}.focus-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.focus-error{padding:14px;border-radius:10px;background:#fff0ee;color:#942c23;margin-bottom:16px}.focus-notice{padding:14px;border-radius:10px;background:#e6f3e9;color:#245d36}@media(max-width:700px){.clinical-focus-settings{padding:16px}.clinical-focus-settings header{display:grid}.clinical-focus-settings header button{width:100%}}
</style>
