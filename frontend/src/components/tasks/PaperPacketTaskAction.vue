<template>
  <section class="client-action-banner">
    <p>Review the uploaded school packet, match the child, and process enrollment. Existing paper signatures remain the source.</p>
    <button type="button" class="btn btn-primary" :disabled="loading" @click="openPacket">{{ loading ? 'Opening…' : 'Process paper packet enrollment' }}</button>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <ReferralUpload v-if="opened && packet && !packet.clientId" :organization-slug="packet.organizationSlug" :initial-draft="packet" @submitted="attached" @close="opened=false" />
    <Teleport to="body"><div v-if="opened && packet?.clientId" class="paper-task-overlay"><div class="paper-task-dialog" role="dialog" aria-label="Paper packet enrollment">
      <SchoolPaperPacketWorkflow :client-id="packet.clientId" @close="opened=false" @processed="$emit('processed')" />
    </div></div></Teleport>
  </section>
</template>
<script setup>
import { ref } from 'vue';
import api from '../../services/api';
import ReferralUpload from '../school/ReferralUpload.vue';
import SchoolPaperPacketWorkflow from '../clients/SchoolPaperPacketWorkflow.vue';
const props=defineProps({draftId:{type:[String,Number],required:true}});
defineEmits(['processed']);
const loading=ref(false),error=ref(''),opened=ref(false),packet=ref(null);
async function openPacket(){loading.value=true;error.value='';try{
  const {data}=await api.get(`/referral-packet-drafts/${Number(props.draftId)}/processing`,{skipGlobalLoading:true});
  packet.value=data.draft;opened.value=true;
}catch(e){error.value=e.response?.data?.error?.message||'Could not open this packet.';}finally{loading.value=false;}}
async function attached(){await openPacket();}
</script>
<style scoped>
.paper-task-overlay{position:fixed;inset:0;background:#0008;z-index:12000;display:flex;align-items:center;justify-content:center;padding:12px}.paper-task-dialog{width:min(1200px,100%);max-height:95dvh;overflow:auto;background:white;border-radius:12px;padding:16px}
</style>
