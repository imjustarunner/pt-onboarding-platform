<template>
  <section class="presence" aria-label="Team presence">
    <header><h2>Team presence</h2><button :disabled="busy" @click="load">Refresh</button></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="enabled">
      <form @submit.prevent="setAway">
        <h3>My status</h3>
        <label>Status<select v-model="reason"><option value="meal">Out for meal</option><option value="fitness">Out for fitness</option><option value="family">Out for family</option><option value="personal">Out for personal</option><option value="call">Available for call</option><option value="text">Available for text</option><option value="call_text">Available for call &amp; text</option><option value="out_day">Out for the day</option><option value="custom">Custom</option></select></label>
        <label v-if="reason==='custom'">Status label<input v-model="customLabel" maxlength="60" required /></label>
        <label v-if="reason!=='out_day'">Back in<select v-model.number="durationMinutes"><option :value="15">15 minutes</option><option :value="30">30 minutes</option><option :value="60">1 hour</option><option :value="90">90 minutes</option><option :value="120">2 hours</option></select></label>
        <label>Reachable by<select v-model="reachable"><option value="">No preference</option><option value="call">Call</option><option value="text">Text</option><option value="call_text">Call or text</option></select></label>
        <div class="actions"><button :disabled="busy" type="submit">Set status</button><button :disabled="busy" type="button" @click="clearStatus">I’m back</button></div>
        <p v-if="notice" role="status">{{ notice }}</p>
      </form>
      <ul><li v-for="person in people" :key="person.id"><span class="dot" :class="presenceDotClassForPerson(person)" /><div><strong>{{ person.first_name }} {{ person.last_name }}</strong><p>{{ label(person) }}</p><small v-if="person.presence_expected_return_at">Back {{ new Date(person.presence_expected_return_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) }}</small><p v-if="person.presence_note">{{ person.presence_note }}</p></div></li></ul>
      <p v-if="!people.length && !busy">No admin team members to show.</p>
    </template>
    <p v-else-if="!busy && !error">Team presence is available to administrators and support staff.</p>
  </section>
</template>
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { presenceDotClassForPerson, statusSubtitle, presenceSortRankForPerson } from '../../utils/presenceStatus';
const props=defineProps({http:{required:true}});
const people=ref([]),enabled=ref(false),busy=ref(false),error=ref(''),notice=ref('');
const reason=ref('personal'),durationMinutes=ref(30),customLabel=ref(''),reachable=ref('');
let timer,alive=true;
function label(person){
  if(person.status==='offline')return 'Inactive (offline or timed out)';
  if(person.session_phase==='timedown')return 'Timedown · signed in, inactive';
  return statusSubtitle(person);
}
async function load(){
  if(busy.value)return;busy.value=true;
  try{const {data}=await props.http.get('/presence');if(!alive)return;enabled.value=data.enabled;people.value=(data.people||[]).sort((a,b)=>presenceSortRankForPerson(a)-presenceSortRankForPerson(b));error.value='';}
  catch(e){if(alive)error.value=e.response?.data?.error?.message||'Could not refresh presence.';}
  finally{if(alive)busy.value=false;}
}
async function update(path,body){if(busy.value)return;busy.value=true;notice.value='';try{await props.http.post(path,body);notice.value='Your status is updated.';}catch(e){error.value=e.response?.data?.error?.message||'Could not update status.';return;}finally{busy.value=false;}await load();}
function setAway(){return update('/presence/away',{reason:reason.value,durationMinutes:durationMinutes.value,customLabel:customLabel.value,reachable:reachable.value});}
function clearStatus(){return update('/presence/clear',{});}
onMounted(()=>{load();timer=setInterval(()=>{if(!document.hidden)load();},30000);});
onUnmounted(()=>{alive=false;clearInterval(timer);});
</script>
<style scoped>
.presence{padding:18px;color:var(--qv-text)}header,.actions{display:flex;align-items:center;justify-content:space-between;gap:10px}h2{font-size:20px}h3{margin-top:0}form{padding:16px;background:var(--qv-surface);border:1px solid var(--qv-border);border-radius:12px}label{display:flex;flex-direction:column;gap:6px;margin:12px 0}button,input,select{font:inherit;padding:10px;border:1px solid var(--qv-border);border-radius:8px;background:var(--qv-surface);color:var(--qv-text)}button{cursor:pointer}button:disabled{opacity:.5}.actions{justify-content:flex-start;flex-wrap:wrap}ul{list-style:none;padding:0}li{display:flex;gap:12px;padding:15px 0;border-bottom:1px solid var(--qv-border)}p{margin:6px 0;font-size:14px}small{color:var(--qv-muted)}.dot{width:11px;height:11px;border-radius:50%;margin-top:5px;background:#89929e;flex-shrink:0}.dot-available{background:#4cbd87}.dot-away-reachable{background:#f7bc50}.dot-unavailable{background:#ef7979}.dot-available-offline{background:#83a4dd}
</style>
