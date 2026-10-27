<template>
  <main class="account-support-page">
    <h1>Account Support</h1>
    <p>Help a client with portal access, payment setup, and account questions.</p>
    <router-link v-if="canBill" :to="billingLink" class="btn btn-primary">Manage balances, splits &amp; payment plans</router-link>
    <p v-if="loading" role="status">Loading clients…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <label>Find a client<input v-model="search" type="search" placeholder="Name or client ID" /></label>
    <label>Client<select v-model="clientId"><option :value="null">Select a client</option><option v-for="client in visibleClients" :key="client.id" :value="client.id">{{ clientLabel(client) }} · {{ client.id }}</option></select></label>
    <ClientAccountSupport v-if="clientId" :key="`${agencyId}-${clientId}`" :client-id="clientId" :agency-id="agencyId" @manage-contacts="openClient" />
    <router-link v-if="clientId" :to="clientLink">Open client account</router-link>
  </main>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { canAccessMedicalBilling } from '../../config/medicalBillingAccess';
import ClientAccountSupport from '../../components/billing/ClientAccountSupport.vue';
import api from '../../services/api';
const route=useRoute(),router=useRouter(),agencyStore=useAgencyStore(),auth=useAuthStore();
const agencyId=computed(()=>Number(agencyStore.currentAgency?.id));
const prefix=computed(()=>route.params.organizationSlug?`/${route.params.organizationSlug}`:'');
const canBill=computed(()=>canAccessMedicalBilling(auth.user,agencyId.value));
const billingLink=computed(()=>({path:`${prefix.value}/admin/family-billing`,query:{agencyId:String(agencyId.value)}}));
const clients=ref([]),clientId=ref(null),search=ref(''),loading=ref(false),error=ref('');
let generation=0;
const clientLabel=c=>c.full_name||[c.first_name,c.last_name].filter(Boolean).join(' ')||c.initials||`Client ${c.id}`;
const visibleClients=computed(()=>clients.value.filter(c=>`${clientLabel(c)} ${c.id}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const clientLink=computed(()=>({path:`${prefix.value}/admin/clients/${clientId.value}`,query:{tab:'account'}}));
const openClient=()=>router.push(clientLink.value);
watch(agencyId,async id=>{
  const own=++generation;clients.value=[];clientId.value=null;error.value='';loading.value=false;if(!id)return;
  loading.value=true;
  try{const {data}=await api.get('/clients',{params:{agency_id:id}});if(own===generation)clients.value=Array.isArray(data)?data:[];}
  catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Clients could not be loaded.';}
  finally{if(own===generation)loading.value=false;}
},{immediate:true});
</script>
<style scoped>
.account-support-page{max-width:1100px;margin:32px auto;padding:24px}.account-support-page>label{display:grid;gap:8px;margin:20px 0}.account-support-page input,.account-support-page select{padding:12px;max-width:100%;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-primary)}[role=alert]{color:var(--app-text-red,#b91c1c)}
</style>
