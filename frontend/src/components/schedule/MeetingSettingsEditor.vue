<template>
  <section class="meeting-settings">
    <div class="settings-heading"><strong>Meeting options</strong><button v-if="canEdit" type="button" class="btn btn-ghost btn-sm" @click="editingDefaults = !editingDefaults">{{ editingDefaults ? 'Back to this meeting' : 'Edit meeting type defaults' }}</button></div>
    <p v-if="editingDefaults">Defaults for {{ types.find(t => t.key === type)?.label || type }}. These apply to newly scheduled meetings.</p>
    <div class="settings-checks">
      <label v-for="(label, key) in labels" :key="key"><input type="checkbox" :checked="current[key]" :disabled="disabled || (key === 'compensation' && !canEdit)" @change="change(key, $event.target.checked)" /> {{ label }}</label>
    </div>
    <fieldset><legend>Confirm reminders</legend>
      <p>A booking invitation is sent when email invitations are enabled.</p>
      <label v-for="option in reminderOptions" :key="option.key"><input type="checkbox" :checked="(current.reminders || []).includes(option.key)" :disabled="disabled" @change="toggleReminder(option.key, $event.target.checked)" /> {{ option.label }}</label>
      <div class="custom-reminder"><input v-model.number="customMinutes" type="number" min="1" max="10080" aria-label="Custom reminder minutes before" placeholder="Minutes before" /><button type="button" class="btn btn-secondary btn-sm" @click="addReminder">Add reminder</button></div>
    </fieldset>
    <button v-if="editingDefaults" type="button" class="btn btn-secondary btn-sm" :disabled="saving || disabled" @click="saveDefaults">{{ saving ? 'Saving…' : 'Save type defaults' }}</button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: Number, type: { type: String, default:'general' }, modelValue: Object, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const types = ref([]), canEdit = ref(false), editingDefaults = ref(false), defaultsDraft = ref({}), saving = ref(false), error = ref(''), customMinutes = ref(null);
const labels = { agenda:'Agenda', goals:'Goals', actionItems:'Action items', attendance:'Track attendance', transcription:'Transcribe by default', screenShare:'Allow everyone to share their screen', compensation:'Attendance time claims for eligible participants' };
const fallback = () => ({agenda:props.type!=='interview',goals:props.type!=='interview',actionItems:props.type!=='interview',attendance:true,transcription:true,screenShare:true,compensation:['huddle','admin','town_hall','evaluation','leadership_circle','supervisors_meeting'].includes(props.type),reminders:['business_days_3',1440,5]});
const current = computed(() => editingDefaults.value ? defaultsDraft.value : (props.modelValue || types.value.find(t=>t.key===props.type)?.settings || fallback()));
const reminderOptions = computed(() => [...new Set(['business_days_3',1440,5,...(current.value.reminders||[])])].map(key=>({key,label:key==='business_days_3'?'3 business days before':key===1440?'24 hours before':`${key} minutes before`}))); 
function change(key,value) { const next={...current.value,[key]:value}; if(editingDefaults.value) defaultsDraft.value=next; else emit('update:modelValue',next); }
function toggleReminder(key,on) { change('reminders',on?[...new Set([...(current.value.reminders||[]),key])]:(current.value.reminders||[]).filter(v=>v!==key)); }
function addReminder() { if(Number.isInteger(customMinutes.value)&&customMinutes.value>0&&customMinutes.value<=10080) { toggleReminder(customMinutes.value,true);customMinutes.value=null; } }
watch(editingDefaults,on=>{if(on) defaultsDraft.value={...(types.value.find(t=>t.key===props.type)?.settings||fallback())};});
watch(()=>[props.agencyId,props.type],async()=>{const agencyId=props.agencyId,type=props.type; if(!agencyId)return; try{const {data}=await api.get('/team-meetings/types',{params:{agencyId},skipGlobalLoading:true});if(agencyId!==props.agencyId||type!==props.type)return;types.value=data.types||[];canEdit.value=!!data.canEdit;if(!props.modelValue)emit('update:modelValue',{...(types.value.find(t=>t.key===props.type)?.settings||fallback())});}catch(e){error.value=e.response?.data?.error?.message||'Could not load meeting defaults.';}},{immediate:true});
async function saveDefaults(){saving.value=true;error.value='';try{await api.put(`/team-meetings/types/${props.type}`,{agencyId:props.agencyId,settings:defaultsDraft.value});const found=types.value.find(t=>t.key===props.type);if(found)found.settings={...defaultsDraft.value};editingDefaults.value=false;}catch(e){error.value=e.response?.data?.error?.message||'Could not save defaults.';}finally{saving.value=false;}}
</script>
<style scoped>
.meeting-settings{border:1px solid #dbe4ec;border-radius:12px;padding:14px;margin:12px 0}.settings-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.settings-checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:12px 0}fieldset{border:1px solid #dbe4ec;border-radius:8px}fieldset label{display:inline-flex;gap:6px;margin:6px 18px 6px 0}.custom-reminder{display:flex;gap:8px;margin:8px 0}.custom-reminder input{width:140px}
</style>
