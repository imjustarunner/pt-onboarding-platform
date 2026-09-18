<template>
  <section class="calendar-sharing">
    <h2>{{ family?'Share our family calendar':'Share my work calendar' }}</h2>
    <p>{{ family?'Create a shared Google calendar for your household, or subscribe from any calendar app. Linked parents are added automatically.':'Keep a separate work calendar in your personal Google, Apple or Outlook account. SSO is not required. Sessions show their type and client initials; meetings include participant join links.' }}</p>
    <p>Manage events in this app. Google copies refresh about every five minutes. Subscription refresh timing is controlled by your calendar app.</p>
    <label v-if="family" class="details"><input type="checkbox" :checked="status.details" @change="details($event.target.checked)" :disabled="busy" /> Share event titles, family members and locations (otherwise “Personal event”)</label>
    <div class="actions"><button v-if="!status.googleCalendarId" @click="act('google')" :disabled="busy">Create shared Google calendar</button><template v-else><a :href="status.googleAddUrl" target="_blank" rel="noopener noreferrer">Add to Google Calendar ↗</a><button @click="act('sync')" :disabled="busy">Sync now</button></template><button @click="issue" :disabled="busy">{{ status.hasSubscription?'Replace subscription link':'Create subscription link' }}</button><button v-if="status.hasSubscription" @click="revoke" :disabled="busy">Revoke subscription</button></div>
    <div v-if="link" class="subscription"><label>Private subscription link<input readonly :value="link" @focus="$event.target.select()" /></label><button @click="copy">Copy link</button><p>In Google Calendar on a computer: Other calendars → + → From URL. Paste this link. Anyone with this link can read the shared details. Replacing or revoking it stops the old link.</p></div>
    <template v-if="status.googleCalendarId"><h3>Who can see this calendar</h3><ul><li v-for="reader in status.readers" :key="reader.email">{{ reader.email }} <small v-if="reader.managed_member">Linked account</small><button v-else :disabled="busy" @click="remove(reader.email)">Remove</button></li></ul><form @submit.prevent="add"><label>Personal or additional Google account<input type="email" v-model="email" required placeholder="you@gmail.com" /></label><button :disabled="busy">Give read access</button></form><p>After adding an account, open the “Add to Google Calendar” link while signed in to that account.</p><p v-if="!status.lastSyncedAt">The first sync is preparing your calendar. This can take a few minutes.</p><small v-if="status.lastSyncedAt">Last synced {{ new Date(status.lastSyncedAt).toLocaleString() }}</small><button class="stop" @click="stop" :disabled="busy">Stop Google sharing</button></template>
    <p v-if="busy" role="status">Updating calendar…</p><p v-if="message" role="status">{{ message }}</p><p v-if="error || status.lastError" role="alert">{{ error || status.lastError }}</p>
  </section>
</template>
<script setup>
import {onMounted,ref,watch} from 'vue';
import workApi from '../services/api';
import axios from 'axios';
const props=defineProps({householdId:[Number,String],agencyId:[Number,String]});
const family=!!props.householdId;
const api=family?axios.create({baseURL:'/api/family',withCredentials:true}):workApi;
const status=ref({readers:[]}),busy=ref(false),error=ref(''),message=ref(''),link=ref(''),email=ref('');
const path=()=>`/calendar-sharing/${family?`family/${props.householdId}`:`work/${props.agencyId}`}`;
async function load(){status.value=(await api.get(path())).data;}
async function run(fn){if(busy.value)return;busy.value=true;error.value='';message.value='';try{await fn();await load();}catch(e){error.value=e.response?.data?.error?.message || 'Could not update the calendar. Check Google access and try again.';}finally{busy.value=false;}}
const act=action=>run(()=>api.post(`${path()}/${action}`));
const details=value=>run(()=>api.put(`${path()}/details`,{details:value}));
async function issue(){if(status.value.hasSubscription&&!window.confirm('Replace the old subscription link? Existing subscriptions must use the new link.'))return;await run(async()=>{link.value=(await api.post(`${path()}/subscription`)).data.url;});}
async function revoke(){await run(async()=>{await api.delete(`${path()}/subscription`);link.value='';message.value='Subscription revoked.';});}
async function add(){await run(async()=>{await api.post(`${path()}/readers`,{email:email.value});email.value='';});}
const remove=email=>run(()=>api.delete(`${path()}/readers`,{data:{email}}));
async function stop(){if(!window.confirm('Delete the Google copy and remove its readers? Events in this app remain.'))return;await run(()=>api.delete(`${path()}/google`));}
async function copy(){try{await navigator.clipboard.writeText(link.value);message.value='Link copied.';}catch{message.value='Select and copy the link above.';}}
watch(()=>[props.householdId,props.agencyId],()=>{link.value='';run(load);});onMounted(()=>run(load));
</script>
<style scoped>
.calendar-sharing{--share-ink:var(--ink,#25313c);padding:24px;margin:20px 0;border:1px solid var(--line,#d6d5ce);border-radius:16px;background:var(--surface,#fffdf8);color:var(--share-ink);max-width:950px}.calendar-sharing h2{font-size:20px;margin:0 0 12px}.calendar-sharing p{font-size:14px;line-height:1.6}.calendar-sharing label{display:flex;flex-direction:column;gap:6px;font-size:14px}.calendar-sharing label.details{flex-direction:row;align-items:center;margin:16px 0}.calendar-sharing input,.calendar-sharing button,.calendar-sharing a{font:inherit;padding:10px;border:1px solid #979ca5;border-radius:8px;background:var(--surface,#fffdf8);color:var(--share-ink)}.calendar-sharing button,.calendar-sharing a{cursor:pointer;background:var(--soft,#eeeaf8);font-size:14px}.actions,form{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.subscription{margin:20px 0}.subscription input{width:100%;box-sizing:border-box}.calendar-sharing li{margin:10px 0;overflow-wrap:anywhere}.calendar-sharing small{margin:0 10px;color:var(--muted,#56616c)}.stop{display:block;margin-top:18px}.calendar-sharing button:disabled{opacity:.6}
</style>
