<template>
 <section class="card scb-billing"><h3>SchoolCareBridge · MH4Kidz</h3><router-link class="btn btn-primary" to="/admin/schoolcarebridge">Manage partners, tenants &amp; agreements</router-link><p>Program revenue recipient: <strong>MH4Kidz</strong>. Platform usage invoice issuer: <strong>Plot Twist Co</strong>.</p><p>Preparation only. SchoolCareBridge does not issue invoices, collect payments, or reallocate existing agency charges.</p><p v-if="error" role="alert">{{error}}</p><template v-if="config"><p role="status">{{config.setupComplete?'Organization and billing account linked. Pricing and usage allocation remain unconfigured.':'Setup incomplete: link the MH4Kidz organization and configure its existing billing account.'}}</p><form @submit.prevent="save"><label>MH4Kidz organization ID <input type="number" min="1" step="1" v-model="operatorId" required/></label><button class="btn btn-secondary" :disabled="saving">{{saving?'Saving…':'Link organization'}}</button></form><router-link v-if="config.operatorAgencyId" :to="`/admin/settings?agencyId=${config.operatorAgencyId}`">Open MH4Kidz settings</router-link><p class="muted">Automatic ITSCO routing: {{config.deployment.legacyRedirectEnabled?'enabled':'disabled'}}. Public address: {{config.deployment.origin}}{{config.deployment.basePath}}</p></template><button v-else class="btn btn-secondary" @click="load">Load configuration</button></section>
</template>
<script setup>
import {onMounted,ref} from 'vue';
import api from '../../services/api';
const config=ref(null),operatorId=ref(''),error=ref(''),saving=ref(false);
async function load(){try{const {data}=await api.get('/schoolcarebridge/program-config');config.value=data;operatorId.value=data.operatorAgencyId||'';error.value='';}catch(e){error.value=e.response?.data?.error?.message||'SchoolCareBridge configuration is unavailable. Apply its foundation migration first.';}}
async function save(){saving.value=true;error.value='';try{const {data}=await api.put('/schoolcarebridge/program-config',{operatorAgencyId:Number(operatorId.value)});config.value=data;}catch(e){error.value=e.response?.data?.error?.message||'Could not save configuration.';}finally{saving.value=false;}}
onMounted(load);
</script>
<style scoped>
.scb-billing form{display:flex;gap:15px;align-items:end;flex-wrap:wrap;margin:20px 0}.scb-billing label{display:flex;flex-direction:column;gap:6px}.scb-billing input{padding:9px;border:1px solid #c9d8e3;border-radius:6px}
</style>
