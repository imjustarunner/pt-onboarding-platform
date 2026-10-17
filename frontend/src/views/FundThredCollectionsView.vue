<template>
 <div class="ft-surface collections-workspace"><header><router-link to="/fundthred/app"><FundThredBrand/></router-link><nav aria-label="Finance navigation"><router-link to="/admin/medical-billing">Practice billing</router-link><router-link to="/fundthred/services">Finance services</router-link></nav></header>
 <main><p class="ft-eyebrow">PlotTwistCo · Finance operations</p><h1>Collections workspace</h1><p>Reviewed referrals and assigned cases. The originating practice remains identified alongside each balance.</p>
 <p v-if="error" role="alert">{{error}}</p><p v-if="loading" role="status">Loading your authorized organizations…</p>
 <label v-if="organizations.length>1">Organization<select v-model="selectedId"><option v-for="org in organizations" :key="org.id" :value="org.id">{{org.name}}</option></select></label><h2 v-else-if="selected">{{selected.name}}</h2>
 <section v-if="!loading&&!selected&&!error" class="collections-setup"><h2>No collections workspaces available</h2><p>Your account needs billing access to an active agency. Collections permissions are assigned separately.</p></section>
 <section v-if="selected&&!selected.ready" class="collections-setup"><h2>Collections setup is pending</h2><p>Routine billing remains available through the practice. Before referring balances, configure the signed service agreement, named collections permissions, and the collections workflow for this organization.</p><router-link class="ft-button" :to="billingLink">Open practice billing →</router-link></section>
 <template v-if="selected?.ready"><p><router-link class="ft-text-link" :to="billingLink">Review balances and prepare a referral →</router-link></p><CollectionHandoff :key="selected.id" :agency-id="selected.id"/></template>
 <aside><h2>A dedicated service identity</h2><p><strong>FundThred is PlotTwistCo’s finance division.</strong> Initial insurance follow-ups and statements use the practice’s billing address. FundThred’s collections sender is <strong>collections@fundthred.com</strong>; it requires verified email setup and approved collections procedures before outbound use.</p><p>A referral preserves the existing receivable and payment history. It does not send a notice or charge a card.</p></aside>
 </main></div>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {useRoute} from 'vue-router';
import {useAuthStore} from '../store/auth';
import api from '../services/api';
import FundThredBrand from '../components/fundthred/FundThredBrand.vue';
import CollectionHandoff from '../components/billing/CollectionHandoff.vue';
import {useFundThredBranding} from '../composables/useFundThredBranding';
import '../styles/fundthred.css';
const route=useRoute(),auth=useAuthStore(),organizations=ref([]),selectedId=ref(null),loading=ref(false),error=ref('');let sequence=0;
useFundThredBranding('Collections | FundThred');
const selected=computed(()=>organizations.value.find(o=>o.id===selectedId.value));
const billingLink=computed(()=>({path:`/${selected.value?.slug}/admin/family-billing`,query:{tab:'collections',agencyId:String(selectedId.value)}}));
async function load(){const own=++sequence;organizations.value=[];selectedId.value=null;error.value='';loading.value=false;if(!auth.isAuthenticated)return;loading.value=true;try{const {data}=await api.get('/family-billing/collections/organizations');if(own!==sequence)return;organizations.value=data.organizations||[];selectedId.value=organizations.value.find(o=>o.id===Number(route.query.agencyId))?.id||organizations.value.find(o=>o.slug==='plottwistco')?.id||organizations.value[0]?.id||null;}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Collections access could not be loaded.';}finally{if(own===sequence)loading.value=false;}}
watch(()=>auth.user?.id,load,{immediate:true});onBeforeUnmount(()=>sequence++);
</script>
<style scoped>
.collections-workspace{min-height:100vh;background:#f5f9f8}.collections-workspace>header{display:flex;align-items:center;justify-content:space-between;padding:22px clamp(20px,4vw,65px);border-bottom:1px solid #d9e6e3;background:white;gap:24px;flex-wrap:wrap}.collections-workspace nav{display:flex;gap:24px}.collections-workspace main{max-width:1250px;margin:0 auto;padding:35px 24px}.collections-workspace h1{font-size:clamp(30px,4vw,45px)}.collections-workspace label{display:grid;gap:8px;max-width:450px;margin:25px 0}.collections-workspace select{padding:12px;font:inherit;border:1px solid #b7cec9;border-radius:8px;background:#fff}.collections-setup,.collections-workspace aside{background:white;border:1px solid #d9e6e3;border-radius:16px;padding:25px;margin:24px 0}.collections-workspace aside{background:#eaf5f0}.collections-workspace h2{font-size:23px}.collections-workspace p{line-height:1.65}.collections-workspace [role=alert]{color:#a52525}
</style>
