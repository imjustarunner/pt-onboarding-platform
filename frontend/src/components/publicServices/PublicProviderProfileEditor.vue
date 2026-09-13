<template>
 <section v-if="allowed" class="public-profile-editor" translate="no">
  <button v-if="!editing" type="button" @click="open">Edit public profile</button>
  <form v-else @submit.prevent="save">
   <h2>Edit provider profile</h2><p>Changes update this provider’s actual profile and all public listings. Private clinical records stay private.</p>
   <div class="editor-grid">
    <label>First name<input v-model="draft.firstName" required maxlength="100" /></label>
    <label>Last name<input v-model="draft.lastName" required maxlength="100" /></label>
    <label>Professional title<input v-model="draft.title" maxlength="160" /></label>
    <label>Photo<input type="file" accept="image/png,image/jpeg,image/webp" @change="photo=$event.target.files?.[0] || null" /><small>PNG, JPG or WebP, up to 8 MB. Saved as the provider’s profile photo.</small></label>
   </div>
   <label>Public biography<textarea v-model="draft.publicBlurb" rows="7" maxlength="4000" /></label>
   <div class="editor-grid">
    <label v-for="field in fields" :key="field.key">{{ field.label }}<textarea v-model="draft[field.key]" rows="2" placeholder="Separate entries with commas" /></label>
    <label>New client availability<select v-model="draft.accepting"><option value="default">Use schedule setting</option><option value="yes">Accepting new clients</option><option value="no">Contact team / waitlist</option></select></label>
   </div>
   <p>Specialties, populations, and clinical approaches come from the provider’s clinical profile. <router-link v-if="auth.user?.role !== 'staff'" :to="{name:'UserProfile',params:{userId:provider.id}}">Open full staff profile</router-link></p>
   <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
   <div class="editor-actions"><button type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save profile' }}</button><button type="button" :disabled="busy" @click="editing=false">Cancel</button></div>
  </form>
  <p v-if="!editing && notice" role="status">{{ notice }}</p>
 </section>
</template>
<script setup>
import {computed,reactive,ref,watch} from 'vue';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
const props=defineProps({provider:{type:Object,required:true},agencyId:{type:Number,required:true}});
const emit=defineEmits(['saved']);
const auth=useAuthStore(),verified=ref(false),editing=ref(false),busy=ref(false),error=ref(''),notice=ref(''),photo=ref(null),draft=reactive({});
const manager=computed(()=>['admin','super_admin','support','staff'].includes(auth.user?.role));
const allowed=computed(()=>manager.value && verified.value);
const fields=[{key:'insurances',label:'Insurance accepted'},{key:'languages',label:'Languages'},{key:'locations',label:'Public locations'},{key:'sessionFormats',label:'Session formats'}];
let savedProfile={},generation=0;
watch(()=>[props.provider.id,props.agencyId,manager.value],async()=>{
 const id=++generation;verified.value=false;editing.value=false;
 if(!manager.value || !props.agencyId)return;
 try{const {data}=await api.get(`/users/${props.provider.id}/provider-public-profile`,{params:{agencyId:props.agencyId},skipAuthRedirect:true});if(id===generation){savedProfile=data.profile||{};verified.value=true;}}catch{/* Authorization is decided by the protected API. */}
},{immediate:true});
function open(){Object.assign(draft,{firstName:props.provider.firstName||'',lastName:props.provider.lastName||'',title:props.provider.title||'',publicBlurb:savedProfile.publicBlurb||'',insurances:(savedProfile.insurances||[]).join(', '),accepting:savedProfile.acceptingNewClientsOverride===null?'default':savedProfile.acceptingNewClientsOverride?'yes':'no'});for(const k of ['languages','locations','sessionFormats'])draft[k]=(savedProfile.details?.[k]||[]).join(', ');photo.value=null;error.value='';notice.value='';editing.value=true;}
const list=value=>String(value||'').split(',').map(s=>s.trim()).filter(Boolean);
async function save(){busy.value=true;error.value='';notice.value='';try{
 if(photo.value && (photo.value.size>8*1024*1024 || !['image/png','image/jpeg','image/webp'].includes(photo.value.type)))throw new Error('Choose a PNG, JPG or WebP photo no larger than 8 MB.');
 const {data}=await api.put(`/users/${props.provider.id}/provider-public-profile`,{agencyId:props.agencyId,identity:{firstName:draft.firstName,lastName:draft.lastName,title:draft.title},publicBlurb:draft.publicBlurb,insurances:list(draft.insurances),details:Object.fromEntries(['languages','locations','sessionFormats'].map(k=>[k,list(draft[k])])),acceptingNewClientsOverride:draft.accepting==='default'?null:draft.accepting==='yes'});
 savedProfile=data.profile;notice.value='Profile details saved.';
 if(photo.value){const body=new FormData();body.append('photo',photo.value);await api.post(`/users/${props.provider.id}/profile-photo`,body);}
 editing.value=false;emit('saved');
 }catch(e){error.value=e.response?.data?.error?.message||e.message||'Could not save the profile.';}finally{busy.value=false;}}
</script>
<style scoped>
.public-profile-editor{padding:18px;margin-bottom:22px;border:1px solid #b8d4c6;border-radius:12px;background:#f3faf6;color:#183f36}.public-profile-editor label{display:grid;gap:6px;margin:12px 0;font-weight:600}.editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.public-profile-editor input,.public-profile-editor textarea,.public-profile-editor select{width:100%;box-sizing:border-box;min-width:0;padding:10px;border:1px solid #b9cfc3;border-radius:7px;background:#fff;color:inherit;font:inherit}.public-profile-editor small{font-weight:400}.public-profile-editor button{padding:11px 18px;border:1px solid #1b674e;border-radius:8px;background:#fff;color:#184d3c;cursor:pointer}.editor-actions{display:flex;gap:12px}.editor-actions button:first-child{background:#185d46;color:white}.public-profile-editor button:disabled{opacity:.5}.public-profile-editor p{line-height:1.6}@media(max-width:650px){.editor-grid{grid-template-columns:1fr}}
</style>
