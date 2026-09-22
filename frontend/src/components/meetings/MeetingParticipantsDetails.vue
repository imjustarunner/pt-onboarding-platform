<template>
 <section class="participant-details"><h4>Participants</h4><p v-if="error" class="error">{{ error }}</p>
 <div v-for="person in participants" :key="person.id" class="participant-row"><div><strong>{{ person.name }}</strong><small>{{ person.rsvp === 'accepted' ? 'Confirmed' : person.rsvp === 'declined' ? 'Declined' : 'Awaiting RSVP' }}{{ person.isHost ? ' · Host' : '' }}</small><small v-if="person.compensation">{{ person.compensation }}</small></div>
 <label><input type="checkbox" :checked="!!person.is_required" :disabled="!canEdit || saving" @change="save(person,'is_required',$event.target.checked)" /> Mandatory</label>
 <label><input type="checkbox" :checked="person.isHost || !!person.is_cohost" :disabled="!canEdit || saving || person.isHost" @change="save(person,'is_cohost',$event.target.checked)" /> Co-host</label>
 </div></section>
</template>
<script setup>
import { ref, watch } from 'vue';import api from '../../services/api';
const emit=defineEmits(['updated']);
const props=defineProps({eventId:{type:[Number,String],required:true}}),participants=ref([]),canEdit=ref(false),saving=ref(false),error=ref('');
watch(()=>props.eventId,async(id)=>{if(!Number(id))return;try{const{data}=await api.get(`/team-meetings/${id}/participants`,{skipGlobalLoading:true});participants.value=data.participants||[];canEdit.value=!!data.canEdit;}catch(e){error.value=e.response?.data?.error?.message||'Could not load participants.';}},{immediate:true});
async function save(person,key,value){saving.value=true;error.value='';try{const next={...person,[key]:value};await api.put(`/team-meetings/${props.eventId}/participants/${person.id}`,{isRequired:!!next.is_required,isCohost:!!next.is_cohost});person[key]=value;emit('updated');}catch(e){error.value=e.response?.data?.error?.message||'Could not update participant.';}finally{saving.value=false;}}
</script>
<style scoped>
.participant-details{border:1px solid #dce5e9;border-radius:10px;padding:12px;margin:10px 0}.participant-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5ebef}.participant-row>div{flex:1;min-width:180px}.participant-row small{display:block;color:#546b76;margin-top:3px}
</style>
