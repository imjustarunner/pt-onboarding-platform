<template>
  <section class="booking-rollout" aria-labelledby="booking-rollout-title">
    <h2 id="booking-rollout-title">Client session booking · individual provider rollout</h2>
    <p v-if="policy.enabledForAllProviders" role="status">Scheduling is open for all eligible providers in this practice, including new providers. Individual pauses below still apply.</p>
    <p v-else>Enable each provider’s self-scheduling as they transition from TherapyNotes. Select one person or up to 10 reviewed providers; office requests, availability and supervision remain available.</p>
    <p v-if="agencyId === 2">ITSCO support and administrators can book on behalf of eligible providers before self-scheduling is enabled. Providers cannot enable themselves.</p>
    <p class="account-readiness">Booking selection alone does not create a Google Group or change Google sign-in. Use Individual account conversion to prepare an ITSCO provider’s Group and password access after their original Workspace user is suspended and preserved. A group-login flag alone does not verify that a mailbox exists.</p>
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
        <span>{{ provider.name }} <a :href="`/admin/users/${provider.id}?tab=account&section=workspace-security`" @click.stop>Review account &amp; sign-in</a> <a v-if="agencyId === 2" href="#provider-conversion" @click.prevent.stop="openConversion(provider)">Individual account conversion</a></span><span class="rollout-status">{{ enabled(provider.id) ? 'Enabled' : 'Coming soon' }}</span>
      </label>
      <p v-if="loaded && !filteredProviders.length">No matching active client-facing providers.</p>
    </div>
    <section v-if="conversionProvider" id="provider-conversion" class="account-conversion" aria-label="Individual provider account conversion">
      <h3>{{ conversionProvider.name }} · individual account conversion</h3>
      <p>Keep their current work address as a Google Group. Their original Workspace user and data are preserved. This app never suspends, renames or deletes that user.</p>
      <p v-if="conversionBusy" role="status">Verifying…</p><p v-if="conversionError" role="alert">{{ conversionError }}</p>
      <template v-if="conversionData">
        <dl><dt>Work / Group address</dt><dd>{{ conversionData.targetEmail }}</dd><dt>Personal recovery recipient</dt><dd>{{ conversionData.recoveryEmail }}</dd><dt>Progress</dt><dd>{{ conversionData.conversion?.state || 'Not started' }}</dd></dl>
        <p>{{ conversionData.message }}</p>
        <template v-if="conversionData.conversion?.state !== 'active'">
          <label v-if="!conversionData.conversion">Original Google user ID (required if its address was already renamed)<input v-model="originalGoogleId" :disabled="conversionBusy" /><span v-if="conversionData.originalWorkspace">Found: {{ conversionData.originalWorkspace.email }} · {{ conversionData.originalWorkspace.suspended ? 'Suspended' : 'Not suspended' }}</span></label>
          <label>Confirm the exact personal recovery email<input v-model="recoveryConfirmation" type="email" :disabled="conversionBusy" autocomplete="off" /></label>
          <label class="rollout-confirm"><input v-model="conversionConfirmed" type="checkbox" :disabled="conversionBusy" />I reviewed this provider, the preserved Google identity and the separate personal recovery recipient.</label>
          <button v-if="!conversionData.conversion" type="button" :disabled="!conversionReady" @click="conversionAction('capture')">Capture preserved identity</button>
          <template v-if="conversionData.conversion?.state === 'captured'">
            <p>In Google Admin, suspend the captured user, rename it to a preserved address, and remove this original address from its aliases. Suspension alone does not free the address. Return here after that work is complete.</p>
            <button type="button" :disabled="!conversionReady" @click="conversionAction('prepare')">Verify address release &amp; prepare Group password access</button>
          </template>
          <template v-if="['password_pending','ready'].includes(conversionData.conversion?.state)">
            <p>The Group and password-login mode are ready. Self-scheduling stays closed until password access and mail delivery are confirmed. Password recovery goes to the personal recipient above.</p>
            <a :href="`/admin/users/${conversionProvider.id}?tab=account&section=workspace-security`">Open Set / Reset Password</a>
            <p v-if="conversionData.passwordResetVerified">A lasting password was set after Group setup.</p>
            <p v-else-if="conversionData.passwordStampAvailable">The provider must finish setting their password before activation. Refresh after they finish.</p>
            <label v-else class="rollout-confirm"><input v-model="passwordAccessConfirmed" type="checkbox" />The provider confirmed working password access; this legacy account has no password-change timestamp.</label>
            <label class="rollout-confirm"><input v-model="deliveryConfirmed" type="checkbox" />I confirmed actual Group/app mail delivery and personal recovery delivery.</label>
            <label>Delivery verification details (no passwords, reset links or client information)<textarea v-model="deliveryEvidence" maxlength="1000" /></label>
            <button type="button" :disabled="!conversionReady || !deliveryConfirmed || !deliveryEvidence.trim() || !(conversionData.passwordResetVerified || (!conversionData.passwordStampAvailable && passwordAccessConfirmed))" @click="conversionAction('activate')">Confirm access &amp; enable this provider’s scheduling</button>
          </template>
        </template>
        <p v-else role="status">Account conversion and individual scheduling are enabled.</p>
      </template>
      <button type="button" :disabled="conversionBusy" @click="refreshConversion">Refresh readiness</button><button type="button" :disabled="conversionBusy" @click="conversionProvider=null">Close</button>
    </section>
    <form v-if="loaded" @submit.prevent="save">
      <label>For the selected providers<select v-model="action" :disabled="busy"><option value="enable">Enable provider self-scheduling</option><option value="pause">Pause provider self-scheduling</option></select></label>
      <label>Transition note<textarea v-model="note" maxlength="1000" required :disabled="busy" placeholder="For example: October cohort; scheduling transition reviewed. No client information." /></label>
      <label v-if="action === 'enable'" class="rollout-confirm"><input v-model="reviewed" type="checkbox" required :disabled="busy" />Their move from TherapyNotes scheduling is ready, and their schedule has been reviewed to avoid double booking.</label>
      <p>Pausing stops provider self-scheduling and keeps existing appointments and records. ITSCO’s authorized staff can still arrange care. Enabling here does not turn on public client booking or change claims settings.</p>
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
const conversionProvider=ref(null),conversionData=ref(null),conversionBusy=ref(false),conversionError=ref(''),originalGoogleId=ref(''),recoveryConfirmation=ref(''),conversionConfirmed=ref(false),deliveryConfirmed=ref(false),passwordAccessConfirmed=ref(false),deliveryEvidence=ref('');
const conversionReady=computed(()=>!conversionBusy.value && conversionConfirmed.value && recoveryConfirmation.value.trim().toLowerCase()===conversionData.value?.recoveryEmail);
let conversionRequest=0;
async function openConversion(provider){conversionProvider.value=provider;conversionData.value=null;originalGoogleId.value='';recoveryConfirmation.value='';conversionConfirmed.value=false;deliveryConfirmed.value=false;passwordAccessConfirmed.value=false;deliveryEvidence.value='';await refreshConversion();}
async function refreshConversion(){if(!conversionProvider.value)return;const ticket=++conversionRequest;conversionBusy.value=true;conversionError.value='';try{const {data}=await api.get(`/appointments/booking-rollout/providers/${conversionProvider.value.id}/conversion`,{params:{agencyId:props.agencyId}});if(ticket!==conversionRequest)return;conversionData.value=data;if(data.originalWorkspace?.id)originalGoogleId.value=data.originalWorkspace.id;}catch(e){if(ticket===conversionRequest)conversionError.value=e.response?.data?.error?.message || 'Account readiness could not be verified.';}finally{if(ticket===conversionRequest)conversionBusy.value=false;}}
async function conversionAction(stage){if(!conversionReady.value)return;const ticket=++conversionRequest,providerId=conversionProvider.value.id;conversionBusy.value=true;conversionError.value='';try{const {data}=await api.post(`/appointments/booking-rollout/providers/${providerId}/conversion/${stage}`,{agencyId:props.agencyId,revision:conversionData.value?.conversion?.revision,originalWorkspaceUserId:originalGoogleId.value,originalIdentityReviewed:conversionConfirmed.value,confirmRecoveryEmail:recoveryConfirmation.value,confirmed:conversionConfirmed.value,deliveryConfirmed:deliveryConfirmed.value,passwordAccessConfirmed:passwordAccessConfirmed.value,deliveryEvidence:deliveryEvidence.value});if(ticket!==conversionRequest)return;conversionData.value=data;conversionConfirmed.value=false;if(stage==='activate')await load();}catch(e){if(ticket===conversionRequest)conversionError.value=e.response?.data?.error?.message || 'Conversion did not finish. Scheduling remains protected; refresh readiness before retrying.';}finally{if(ticket===conversionRequest)conversionBusy.value=false;}}
let request=0;
const enabled = id => { if(providers.value.find(provider=>provider.id===id)?.accountConversionPending)return false;const entry=policy.value.entries.find(entry => Number(entry.providerUserId)===id); return entry ? entry.enabled===true : policy.value.enabledForAllProviders===true; };
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
watch(()=>props.agencyId,()=>{conversionRequest++;conversionProvider.value=null;conversionData.value=null;loaded.value=false;providers.value=[];policy.value={revision:0,entries:[]};notice.value='';note.value='';void load();},{immediate:true});
onBeforeUnmount(()=>{request++;conversionRequest++;});
</script>
<style scoped>
.booking-rollout{border:1px solid var(--border,#d7dfeb);padding:18px;border-radius:12px;margin:16px 0;background:var(--bg-primary,#fff)}.booking-rollout h2{margin:0 0 8px}.rollout-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:12px}.booking-rollout label{display:grid;gap:6px}.booking-rollout input,.booking-rollout select,.booking-rollout textarea{font:inherit;padding:8px}.rollout-list{max-height:320px;overflow:auto;border:1px solid var(--border,#d7dfeb);border-radius:8px;margin:12px 0}.rollout-provider{display:flex!important;align-items:center;padding:10px;gap:10px;border-bottom:1px solid var(--border,#d7dfeb)}.rollout-status{margin-left:auto;font-size:.85em;font-weight:600}.booking-rollout form{display:grid;gap:12px;max-width:740px}.rollout-confirm{display:flex!important;align-items:start;gap:8px}.booking-rollout [role=alert]{color:var(--danger,#b42318)}
</style>
