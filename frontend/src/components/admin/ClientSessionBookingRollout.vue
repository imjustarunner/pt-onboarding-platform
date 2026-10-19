<template>
  <section class="booking-rollout" aria-labelledby="booking-rollout-title">
    <h2 id="booking-rollout-title">Client session booking · provider rollout</h2>
    <p>Enable providers as each group transitions from TherapyNotes. Everyone starts with “Coming soon.” Select up to 10 people at a time; office requests, availability and supervision remain available.</p>
    <p>Recommended: start with 5–10 providers, confirm their scheduling transition, and review their first week before enabling the next group.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div class="rollout-toolbar">
      <label>Find a provider<input v-model="search" type="search" placeholder="Search names" :disabled="busy" /></label>
      <label>Show<select v-model="filter"><option value="all">All providers</option><option value="pending">Coming soon</option><option value="enabled">Enabled</option></select></label>
      <button type="button" :disabled="busy" @click="load">Refresh</button>
    </div>
    <p v-if="loaded">{{ enabledCount }} enabled · {{ providers.length - enabledCount }} coming soon · {{ selected.length }}/10 selected</p>
    <div class="rollout-list" aria-label="Providers for session booking rollout">
      <label v-for="provider in filteredProviders" :key="provider.id" class="rollout-provider">
        <input v-model="selected" type="checkbox" :value="provider.id" :disabled="busy || (!selected.includes(provider.id) && selected.length >= 10)" />
        <span>{{ provider.name }}</span><span class="rollout-status">{{ enabled(provider.id) ? 'Enabled' : 'Coming soon' }}</span>
      </label>
      <p v-if="loaded && !filteredProviders.length">No matching active client-facing providers.</p>
    </div>
    <form v-if="loaded" @submit.prevent="save">
      <label>For the selected providers<select v-model="action" :disabled="busy"><option value="enable">Enable client session booking</option><option value="pause">Pause new client session booking</option></select></label>
      <label>Transition note<textarea v-model="note" maxlength="1000" required :disabled="busy" placeholder="For example: October cohort; scheduling transition reviewed. No client information." /></label>
      <label v-if="action === 'enable'" class="rollout-confirm"><input v-model="reviewed" type="checkbox" required :disabled="busy" />Their move from TherapyNotes scheduling is ready, and their schedule has been reviewed to avoid double booking.</label>
      <p>Pausing stops new session bookings and keeps existing appointments and records. Enabling here does not turn on public self-booking or change claims settings.</p>
      <button class="btn btn-primary" :disabled="busy || !selected.length || !note.trim() || (action === 'enable' && !reviewed)">{{ action === 'enable' ? 'Enable' : 'Pause' }} booking for {{ selected.length }} provider{{ selected.length === 1 ? '' : 's' }}</button>
    </form>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true } });
const busy=ref(false), loaded=ref(false), error=ref(''), notice=ref(''), providers=ref([]), policy=ref({ revision:0, entries:[] });
const selected=ref([]), search=ref(''), filter=ref('all'), action=ref('enable'), note=ref(''), reviewed=ref(false);
let request=0;
const enabled = id => policy.value.entries.some(entry => Number(entry.providerUserId)===id && entry.enabled===true);
const enabledCount=computed(()=>providers.value.filter(provider=>enabled(provider.id)).length);
const filteredProviders=computed(()=>providers.value.filter(provider=>provider.name.toLowerCase().includes(search.value.toLowerCase()) && (filter.value==='all' || (filter.value==='enabled')===enabled(provider.id))));
async function load() {
  const ticket=++request, agencyId=props.agencyId;
  busy.value=true; error.value=''; selected.value=[]; reviewed.value=false;
  try { const {data}=await api.get('/appointments/booking-rollout',{params:{agencyId}}); if(ticket!==request)return; policy.value=data.policy; providers.value=data.providers; loaded.value=true; }
  catch(e){if(ticket===request)error.value=e.response?.data?.error?.message || 'Unable to load session booking rollout.';}
  finally{if(ticket===request)busy.value=false;}
}
async function save() {
  if(busy.value || !selected.value.length)return;
  const ticket=++request, agencyId=props.agencyId;
  busy.value=true; error.value=''; notice.value='';
  try {const {data}=await api.put('/appointments/booking-rollout',{agencyId,providerUserIds:selected.value,enabled:action.value==='enable',transitionReviewed:reviewed.value,note:note.value,revision:policy.value.revision});
    if(ticket!==request)return; policy.value=data.policy; notice.value=`Session booking ${action.value==='enable'?'enabled':'paused'} for ${selected.value.length} provider(s).`;selected.value=[];reviewed.value=false;note.value='';}
  catch(e){if(ticket===request)error.value=e.response?.data?.error?.message || 'Unable to update session booking rollout.';}
  finally{if(ticket===request)busy.value=false;}
}
watch(()=>props.agencyId,()=>{ loaded.value=false;providers.value=[];policy.value={revision:0,entries:[]};notice.value='';note.value='';void load();},{immediate:true});
onBeforeUnmount(()=>request++);
</script>
<style scoped>
.booking-rollout{border:1px solid var(--border,#d7dfeb);padding:18px;border-radius:12px;margin:16px 0;background:var(--bg-primary,#fff)}.booking-rollout h2{margin:0 0 8px}.rollout-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:12px}.booking-rollout label{display:grid;gap:6px}.booking-rollout input,.booking-rollout select,.booking-rollout textarea{font:inherit;padding:8px}.rollout-list{max-height:320px;overflow:auto;border:1px solid var(--border,#d7dfeb);border-radius:8px;margin:12px 0}.rollout-provider{display:flex!important;align-items:center;padding:10px;gap:10px;border-bottom:1px solid var(--border,#d7dfeb)}.rollout-status{margin-left:auto;font-size:.85em;font-weight:600}.booking-rollout form{display:grid;gap:12px;max-width:740px}.rollout-confirm{display:flex!important;align-items:start;gap:8px}.booking-rollout [role=alert]{color:var(--danger,#b42318)}
</style>
