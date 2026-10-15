<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api.js';
const props = defineProps({item:{type:Object,required:true}});
const emit=defineEmits(['close','released']);
const busy=ref(false),error=ref('');
const details=ref(null),loading=ref(false),detailsError=ref('');let sequence=0;
const when=v=>v?new Date(v).toLocaleString(undefined,{timeZone:details.value?.slot?.timeZone || 'America/Denver',dateStyle:'medium',timeStyle:'short'}):'';
const statusLabel = status => ({open:'Awaiting response',requested:'Selected — awaiting confirmation',confirmed:'Confirmed',declined:'Declined',declined_by_team:'Declined by care team',selected_other_time:'Selected another time',expired:'Expired',released:'Released'}[status] || status);
const formatLabel = format => ({IN_PERSON:'In office',VIRTUAL:'Virtual',BOTH:'In office or virtual — client chooses'}[format] || format);
async function loadDetails() {
  const own=++sequence;details.value=null;detailsError.value='';loading.value=true;
  try { const {data}=await api.get(`/appointments/replacement-slots/${props.item.replacementSlotId}`,{skipGlobalLoading:true});if(own===sequence)details.value=data; }
  catch(e){if(own===sequence)detailsError.value=e.response?.data?.error?.message || 'Could not load offer recipients. Try again.';}
  finally{if(own===sequence)loading.value=false;}
}
watch(()=>props.item.replacementSlotId,loadDetails,{immediate:true});
async function release(){if(busy.value)return;busy.value=true;error.value='';try{await api.post(`/appointments/replacement-slots/${props.item.replacementSlotId}/release`,{}, {skipGlobalLoading:true});emit('released');}catch(e){error.value=e.response?.data?.error?.message||'Could not release this offered time.';}finally{busy.value=false;}}
</script>
<template>
  <Teleport to="body"><div class="offer-backdrop" @click.self="!busy && emit('close')" @keydown.esc="!busy && emit('close')">
    <section role="dialog" aria-modal="true" aria-labelledby="offered-time-title" class="offered-time">
      <header><h2 id="offered-time-title">{{ item.offerRequested ? 'Replacement selected' : 'Offered for rescheduling' }}</h2><button :disabled="busy" aria-label="Close" @click="emit('close')">×</button></header>
      <p>{{ when(item.startAt) }} – {{ when(item.endAt) }}</p>
      <p v-if="details">{{ formatLabel(details.slot.modality) }}<template v-if="details.slot.roomLabel"> · {{ details.slot.buildingName }} {{ details.slot.roomLabel }}</template> · {{ details.slot.timeZone }}</p>
      <p v-if="loading" role="status">Loading offer recipients…</p>
      <div v-if="detailsError"><p role="alert">{{ detailsError }}</p><button type="button" @click="loadDetails">Retry details</button></div>
      <section v-if="details" aria-label="Offer recipients">
        <h3>Offered to</h3>
        <ul class="offer-recipients"><li v-for="recipient in details.recipients" :key="recipient.offerId">
          <strong>{{ recipient.clientName }}</strong> <span>{{ statusLabel(recipient.status) }}</span>
          <p>Offered {{ when(recipient.offeredAt) }}<br>Response deadline: {{ when(recipient.expiresAt) }}<template v-if="recipient.selectedModality"><br>Chosen format: {{ formatLabel(recipient.selectedModality) }}</template></p>
        </li></ul>
        <p v-if="!details.recipients.length">No client offers are recorded for this time.</p>
      </section>
      <p v-if="item.offerRequested">A client selected this time. It is reserved while the care team confirms the appointment. Review the appointment request before changing this reservation.</p>
      <template v-else><p>Offered to {{ item.invitedCount }} client(s). The first completed selection reserves the time. Other clients immediately see the remaining choices.</p>
        <p>Hidden from public booking while these offers are active.<template v-if="item.offerExpiresAt"> Last offer expires {{ when(item.offerExpiresAt) }}.</template></p>
        <p>Releasing this time removes it from every active offer. Your underlying published availability determines whether it becomes public again.</p>
        <button :disabled="busy" @click="release">{{ busy ? 'Releasing…' : 'Release this offered time' }}</button>
      </template><p v-if="error" role="alert">{{ error }}</p>
    </section>
  </div></Teleport>
</template>
<style scoped>
.offer-backdrop{position:fixed;inset:0;background:#0f172a80;z-index:22000;display:flex;align-items:center;justify-content:center;padding:20px}.offered-time{background:var(--bg-card,#fff);color:var(--text-primary,#1e293b);border-radius:16px;padding:24px;width:min(540px,100%);max-height:90vh;overflow:auto}.offered-time header{display:flex;align-items:center;justify-content:space-between;gap:16px}.offered-time h2{margin:0;font-size:20px}.offered-time p{line-height:1.5}.offered-time button{padding:9px 14px;cursor:pointer}.offered-time [role=alert]{color:#a43121}
.offer-recipients{list-style:none;margin:0;padding:0}.offer-recipients li{padding:12px;border:1px solid #dce4ee;border-radius:10px;margin:8px 0}.offer-recipients span{display:block;font-size:13px;color:var(--text-secondary,#526174)}.offer-recipients p{font-size:13px;margin:6px 0 0}
</style>
