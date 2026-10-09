<template>
 <section class="guide-editor">
  <h3>Photos &amp; videos for each Provider Update section</h3>
  <p>Choose a section, then add one or more named guides for its topics or subsections. Staff open each guide using a pulsing button in that section. These attachments are separate from the Admin Update newsletter.</p>
  <label>Provider Update section<select v-model="sectionKey" :disabled="saving" @change="loadGuides"><option v-for="s in sections" :key="s.key" :value="s.key">{{s.title}}{{config[s.key]?'':' (section off)'}}</option></select></label>
  <p v-if="!config[sectionKey]">Turn this section on in the update’s section settings for staff to see it.</p>
  <fieldset :disabled="saving">
   <label>Guide / subsection name<input v-model="title" maxlength="120" placeholder="For example: Adding virtual availability" /></label>
   <TrainingMediaAttachment :agency-id="agencyId" @attach="attach" />
   <ol><li v-for="(guide,index) in guides" :key="guide.id"><input v-model="guide.title" aria-label="Guide button label" maxlength="120" /><button type="button" @click="guides.splice(index,1)">Remove guide</button></li></ol>
   <label class="notify-choice"><input v-model="notify" type="checkbox" /> Email assigned recipients about new or changed guides, including people who completed the update.</label>
   <p>Emails are queued for automatic delivery. Each email names this section and links to the video or photos. Saving unchanged guides does not resend successful notifications. Save again to retry failed deliveries.</p>
   <button type="button" @click="save">{{notify?'Save guides & notify recipients':'Save guides for this section'}}</button>
  </fieldset>
  <p role="status">{{notice}}</p><p v-if="error" role="alert">{{error}}</p>
 </section>
</template>
<script setup>
import {nextTick,ref,watch} from 'vue';
import api from '../../services/api';
import {PROVIDER_UPDATE_SECTIONS} from '../../utils/providerUpdate';
import TrainingMediaAttachment from './TrainingMediaAttachment.vue';
const props=defineProps({agencyId:{type:[String,Number],required:true},pushId:{type:[String,Number],required:true},config:{type:Object,required:true}}),emit=defineEmits(['saved']);
const sections=PROVIDER_UPDATE_SECTIONS,sectionKey=ref('pin'),guides=ref([]),title=ref(''),notice=ref(''),error=ref(''),saving=ref(false),notify=ref(true);
function loadGuides(){guides.value=JSON.parse(JSON.stringify(props.config._training?.[sectionKey.value]||[]));notice.value='';error.value='';}
watch(()=>props.config,loadGuides,{immediate:true});
function attach(html){if(guides.value.length>=12){error.value='Use up to 12 guides in one section.';return;}guides.value.push({id:crypto.randomUUID(),title:title.value.trim()||'Instructions',html});title.value='';notice.value='Added. Save guides for this section to make them available.';}
async function save(){saving.value=true;error.value='';notice.value='';try{
 const {data}=await api.post(`/provider-update/pushes/${props.pushId}/training/${sectionKey.value}`,{agencyId:Number(props.agencyId),guides:guides.value.map(g=>({...g,title:g.title.trim()||'Instructions'})),notify:notify.value});
 emit('saved',data.push);await nextTick();
 const d=data.delivery;
 notice.value='Guides saved.'+(d?` Email notifications: ${d.sent} sent, ${d.pending} queued / pending delivery, ${d.failed} failed. No new recipients are invited.`:' No notification emails sent.');

 }catch(e){error.value=e.response?.data?.error?.message||'Could not save guides.';}finally{saving.value=false;}}
</script>
<style scoped>.guide-editor{padding:20px;border:1px solid #ccd9e1;border-radius:14px;margin:20px 0;background:#f8fafc}.guide-editor label{display:grid;gap:6px;margin:12px 0}.guide-editor input,.guide-editor select,.guide-editor button{font:inherit;padding:9px;border-radius:7px;border:1px solid #aabdc9}.guide-editor fieldset{border:0;padding:0}.guide-editor .notify-choice{display:flex;align-items:center;gap:10px}.guide-editor li{display:flex;gap:10px;margin:8px 0}.guide-editor li input{flex:1;min-width:0}</style>
