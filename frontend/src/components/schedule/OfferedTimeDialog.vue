<script setup>
import { ref } from 'vue';
import api from '../../services/api.js';
const props = defineProps({item:{type:Object,required:true}});
const emit=defineEmits(['close','released']);
const busy=ref(false),error=ref('');
const when=v=>v?new Date(v).toLocaleString():'';
async function release(){if(busy.value)return;busy.value=true;error.value='';try{await api.post(`/appointments/replacement-slots/${props.item.replacementSlotId}/release`,{}, {skipGlobalLoading:true});emit('released');}catch(e){error.value=e.response?.data?.error?.message||'Could not release this offered time.';}finally{busy.value=false;}}
</script>
<template>
  <Teleport to="body"><div class="offer-backdrop" @click.self="!busy && emit('close')" @keydown.esc="!busy && emit('close')">
    <section role="dialog" aria-modal="true" aria-labelledby="offered-time-title" class="offered-time">
      <header><h2 id="offered-time-title">{{ item.offerRequested ? 'Replacement selected' : 'Offered for rescheduling' }}</h2><button :disabled="busy" aria-label="Close" @click="emit('close')">×</button></header>
      <p>{{ when(item.startAt) }} – {{ when(item.endAt) }}</p>
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
</style>
