<template>
  <details class="phone-setup" @toggle="onToggle">
    <summary>Phone setup · menu, ring groups, and voicemail</summary>
    <p class="notice"><strong>Preparation mode.</strong> Save and preview your phone workflow here. This does not move your number, change Grasshopper, or place calls.</p>
    <section v-if="lineRoles" class="line-roles">
      <h3>Two separate numbers</h3>
      <p><strong>Public main line — contact the organization.</strong> Calls use the support menu; texts go to agency support. Use this for general questions, scheduling, and billing.</p>
      <p>Saved public texting number: {{ lineRoles.publicLines.length ? lineRoles.publicLines.map(n => n.phoneNumber).join(', ') : 'None added yet' }}.</p>
      <p><strong>Shared provider/client care line — contact the care team.</strong> Texts use client assignments; unassigned or unfamiliar senders go to support review.</p>
      <p>Selected shared care texting number: {{ lineRoles.careLine?.phoneNumber || 'None selected yet' }}. Select it under Agency SMS Settings.</p>
      <p class="hint">Number assignments shown here are for texting. Calls and voicemail transcription are not connected yet. Keep your current main carrier until the phone workflow is tested.</p>
    </section>
    <p v-if="loading" role="status">Loading phone setup…</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="success" role="status">{{ success }}</p>
    <form v-if="config" @submit.prevent="save">
      <fieldset class="form-fields" :disabled="saving || loading || previewing">
      <ol class="steps">
        <li>Choose the public main number, greeting, and business hours.</li>
        <li>Set destinations for each menu digit. Keep 0 available for support.</li>
        <li>Preview the route, then save. Test live calling on a separate number before moving your main line.</li>
      </ol>
      <div class="grid">
        <label>Planned public main number (calls and texts)<input v-model="config.mainNumber" type="tel" placeholder="Choose a separate public main number" /><small>For planning only; this does not change your published contact number.</small></label>
        <label>Business time zone<input v-model="config.timeZone" list="phone-timezones" /><datalist id="phone-timezones"><option v-for="zone in zones" :key="zone" :value="zone" /></datalist></label>
      </div>
      <label>Opening greeting<textarea v-model="config.greeting" maxlength="1000" rows="2" /><small>The enabled menu choices below are added to this greeting automatically.</small></label>
      <label class="check"><input v-model="config.businessHoursEnabled" type="checkbox" /> Apply business hours</label>
      <div v-if="config.businessHoursEnabled" class="hours">
        <div v-for="h in config.hours" :key="h.day" class="hours-row">
          <label class="check"><input v-model="h.open" type="checkbox" /> {{ days[h.day] }}</label>
          <input v-model="h.start" type="time" :disabled="!h.open" :aria-label="`${days[h.day]} opening time`" />
          <span>to</span>
          <input v-model="h.end" type="time" :disabled="!h.open" :aria-label="`${days[h.day]} closing time`" />
        </div>
      </div>
      <label>After-hours destination<select v-model="config.afterHours"><option value="voicemail">Support voicemail</option><option value="support">Ring support, then support voicemail</option></select></label>
      <p class="hint">These hours apply to the main menu. Use numbers staffed for the chosen hours. Individual provider calendar-based call routing still needs live integration.</p>
      <div class="grid">
        <label>Hold music<select v-model="config.holdMusicId"><option value="">No track selected</option><option v-for="track in tracks" :key="track.id" :value="track.id">{{ track.title }}</option></select></label>
        <div class="music-preview"><button type="button" :disabled="!config.holdMusicId || musicLoading" @click="previewMusic">{{ musicLoading ? 'Loading…' : 'Preview selected music' }}</button><audio v-if="musicUrl" :src="musicUrl" controls preload="none" /></div>
      </div>
      <p><strong>Voicemail on both lines: audio plus a transcript.</strong> The transcript should stay with the voicemail and its follow-up record. Staff should verify unclear words against the audio; a failed transcript must not hide the voicemail. Notifications should say “New voicemail” and link into the app, without including the transcript.</p>
      <p class="hint">This is the required workflow for the live phone integration. Automatic recording and transcription are not active yet.</p>
      <label>Support voicemail greeting<textarea v-model="config.voicemailGreeting" maxlength="1000" rows="3" /></label>
      <p class="hint">This is the final destination when nobody accepts a call. Voicemail capture and storage require the live phone integration.</p>
      <h3>Menu choices 0–9</h3>
      <p>Sequential rings one destination at a time in the order shown. Simultaneous rings the group together. The planned workflow requires staff to press 1 to accept, so a personal voicemail cannot take the caller.</p>
      <fieldset v-for="option in config.menu" :key="option.key" class="option">
        <legend>Press {{ option.key }} · {{ option.label }}</legend>
        <label class="check"><input v-model="option.enabled" type="checkbox" :disabled="option.key === '0'" /> {{ option.key === '0' ? 'Always available for support' : 'Include in greeting' }}</label>
        <template v-if="option.enabled">
          <div class="grid">
            <label>Menu label<input v-model="option.label" maxlength="60" :disabled="option.key === '0'" /></label>
            <label>Follow-up ticket category<select v-model="option.ticketTopic"><option value="general">General support</option><option value="billing">Billing</option></select></label>
            <label>Ring mode<select v-model="option.ringMode"><option value="sequential">One at a time</option><option value="simultaneous">All at once</option></select></label>
            <label>{{ option.ringMode === 'sequential' ? 'Seconds per destination' : 'Seconds for the group' }}<input v-model.number="option.ringSeconds" type="number" min="10" max="45" /></label>
            <label>If nobody accepts<select v-model="option.fallback" :disabled="option.key === '0'"><option v-if="option.key !== '0'" value="support">Try support (0), then voicemail</option><option value="voicemail">Support voicemail</option></select></label>
          </div>
          <div v-for="(target,index) in option.targets" :key="index" class="target">
            <span>{{ index + 1 }}.</span>
            <label>Destination name<input v-model="target.label" maxlength="80" placeholder="Billing desk" /></label>
            <label>Phone number<input v-model="target.phone" type="tel" placeholder="+17195550123" /></label>
            <button v-if="option.ringMode === 'sequential'" type="button" :disabled="index === 0" :aria-label="`Move destination ${index + 1} earlier`" @click="moveEarlier(option,index)">↑</button>
            <button type="button" :aria-label="`Remove destination ${index + 1} from option ${option.key}`" @click="option.targets.splice(index,1)">Remove</button>
          </div>
          <button type="button" :disabled="option.targets.length >= 5" @click="option.targets.push({label:'',phone:''})">Add destination</button>
          <p v-if="!option.targets.length" class="hint">No destinations yet. This option will use its unanswered-call fallback.</p>
        </template>
      </fieldset>
      <section class="preview">
        <h3>Preview a call</h3>
        <div class="grid">
          <label>Caller presses<select v-model="previewDigit"><option v-for="key in 10" :key="key" :value="String(key-1)">{{ key-1 }}</option><option value="none">No input</option><option value="invalid">Invalid input</option></select></label>
          <label>Hours scenario<select v-model="previewHours"><option value="current">Current time in business time zone</option><option value="open">During business hours</option><option value="closed">After hours</option></select></label>
        </div>
        <button type="button" :disabled="previewing || saving" @click="preview">{{ previewing ? 'Building preview…' : 'Preview without calling' }}</button>
        <ol v-if="simulation" class="simulation" aria-live="polite">
          <li v-for="(step,index) in simulation.steps" :key="index">
            <template v-if="step.type === 'ring'"><strong>{{ step.label }}:</strong> {{ step.mode === 'simultaneous' ? 'Ring together' : 'Ring in order' }} for {{ step.seconds }} seconds {{ step.mode === 'sequential' ? 'each' : 'total' }}: {{ step.targets.map(t => `${t.label} (${t.phone})`).join(' → ') }}. {{ step.onAnswer }}</template>
            <template v-else>{{ step.text }}<span v-if="step.type === 'voicemail'"> {{ step.recordingNotice }} Final destination: {{ step.destination }} (when voice is activated). Audio plus transcript requested; transcription is not connected yet.</span></template>
          </li>
        </ol>
        <p v-if="simulation?.followUp">Follow-up destination: <strong>{{ simulation.followUp.destination }}</strong>. Answering a call does not resolve the ticket. Automatic creation requires live voice integration; log current calls through Support Hub → Log a phone follow-up.</p>
        <p v-if="simulation" class="hint">This shows the unanswered-call path. Once a staff member accepts, fallback ringing stops. No calls were placed.</p>
      </section>
      <section v-if="readiness">
        <h3>Before live calls</h3>
        <ul><li v-for="issue in readiness.issues" :key="issue">{{ issue }}</li><li v-for="item in readiness.remaining" :key="item">{{ item }}</li></ul>
      </section>
      <div class="actions"><button type="submit" :disabled="saving || previewing">{{ saving ? 'Saving…' : 'Save phone setup' }}</button><button type="button" :disabled="saving" @click="load">Reload saved setup</button></div>
      </fieldset>
    </form>
  </details>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props = defineProps({agencyId:{type:[Number,String],required:true}});
const config=ref(null), revision=ref(0), tracks=ref([]), readiness=ref(null), lineRoles=ref(null);
const loading=ref(false), saving=ref(false), previewing=ref(false), error=ref(''), success=ref('');
const previewDigit=ref('0'), previewHours=ref('open'), simulation=ref(null), musicUrl=ref(''), musicLoading=ref(false);
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const zones=['America/Denver','America/New_York','America/Chicago','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu'];
let generation=0, musicGeneration=0;
const endpoint=()=>`/sms-numbers/agency/${props.agencyId}/phone-workflow`;
const message=(e)=>e.response?.data?.error?.message || 'Unable to update phone setup.';
async function load() {
  const current=++generation; loading.value=true; error.value=''; success.value='';
  try { const {data}=await api.get(endpoint()); if(current!==generation)return; config.value=data.config; lineRoles.value=data.lineRoles || null; revision.value=data.revision; tracks.value=data.tracks; readiness.value=data.readiness; }
  catch(e){if(current===generation)error.value=message(e);}
  finally{if(current===generation)loading.value=false;}
}
function onToggle(e){if(e.target.open && !config.value && !loading.value)load();}
async function save(){
  saving.value=true; error.value=''; success.value='';const current=generation;
  try {const {data}=await api.put(endpoint(),{config:config.value,revision:revision.value});if(current!==generation)return;config.value=data.config; revision.value=data.revision;readiness.value=data.readiness;success.value='Phone setup saved. Live carrier routing has not changed.';}
  catch(e){if(current===generation)error.value=message(e);}finally{if(current===generation)saving.value=false;}
}
async function preview(){
  previewing.value=true;error.value='';const current=generation;
  try{const {data}=await api.post(`${endpoint()}/preview`,{config:config.value,digit:previewDigit.value,hours:previewHours.value});if(current===generation)simulation.value=data;}
  catch(e){if(current===generation)error.value=message(e);}finally{if(current===generation)previewing.value=false;}
}
function moveEarlier(option,index){if(index>0){const [target]=option.targets.splice(index,1);option.targets.splice(index-1,0,target);}}
function clearMusic(){musicGeneration++;if(musicUrl.value)URL.revokeObjectURL(musicUrl.value);musicUrl.value='';musicLoading.value=false;}
async function previewMusic(){
  clearMusic();const current=musicGeneration;musicLoading.value=true;error.value='';
  try{const {data}=await api.get(`/focus-music/stream/${encodeURIComponent(config.value.holdMusicId)}`,{responseType:'blob',headers:{'x-agency-id':String(props.agencyId)}});if(current===musicGeneration)musicUrl.value=URL.createObjectURL(data);}
  catch(e){if(current===musicGeneration)error.value='Unable to preview this music track.';}finally{if(current===musicGeneration)musicLoading.value=false;}
}
watch([config,previewDigit,previewHours],()=>{simulation.value=null;},{deep:true});
watch(()=>config.value?.holdMusicId,clearMusic);
watch(()=>props.agencyId,()=>{generation++;config.value=null;readiness.value=null;lineRoles.value=null;clearMusic();load();});
onBeforeUnmount(()=>{generation++;clearMusic();});
</script>
<style scoped>
.form-fields{border:0;padding:0;margin:0;min-width:0}
.phone-setup{padding:20px;border:1px solid var(--border,#d7dce3);border-radius:12px;margin:16px 0;background:var(--bg-primary,#fff);color:var(--text-primary,#263449)}
summary{cursor:pointer;font-size:1.1rem;font-weight:700}.notice,.preview{background:var(--bg-secondary,#f0f5f9);padding:14px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}label{display:flex;flex-direction:column;gap:6px;margin:10px 0;font-weight:600}.check{flex-direction:row;align-items:center}.check input{width:auto}.hint,small{font-weight:400;font-size:.88rem;color:var(--text-secondary,#566273)}input,select,textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--border,#ccd2db);border-radius:6px;background:var(--bg-primary,#fff);color:inherit;font:inherit}.option{margin:18px 0;padding:16px;border:1px solid var(--border,#d7dce3);border-radius:8px}.option legend{font-weight:700}.target{display:flex;gap:10px;align-items:center}.target label{flex:1;min-width:0}.hours-row{display:flex;gap:10px;align-items:center}.hours-row label{min-width:130px}.hours-row input[type=time]{max-width:150px}button{padding:9px 14px;border-radius:6px;border:1px solid var(--border,#bcc7d5);background:var(--bg-primary,#fff);color:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.actions{display:flex;gap:10px;margin-top:18px}.actions button:first-child{background:var(--primary,#2563eb);color:white}.error{color:#b42318}.simulation li,.steps li{margin:10px 0}audio{display:block;max-width:100%;margin-top:10px}.music-preview{align-self:center}@media(max-width:680px){.grid{grid-template-columns:1fr}.target{flex-wrap:wrap}.target label{flex-basis:40%}.hours-row{flex-wrap:wrap}}
</style>
