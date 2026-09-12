<template>
  <section class="range-membership" aria-labelledby="range-membership-title">
    <h3 id="range-membership-title">Mental Range Collective</h3>
    <p>Choose whether this tenant appears on the public network website. Provider listings still require active public service enrollment and public booking.</p>
    <p v-if="loading" role="status">Loading membership…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="loaded && eligible">
      <label><input v-model="form.included" type="checkbox" /> Included in Mental Range Collective</label>
      <div class="range-membership-fields">
        <label v-for="[key,label] in fields" :key="key">{{ label }}<textarea v-if="key==='description'" v-model="form[key]" maxlength="2000" rows="3"/><input v-else v-model="form[key]" maxlength="2000" /></label>
      </div>
      <fieldset><legend>Partner categories</legend><label v-for="[key,label] in services" :key="key"><input v-model="form.services" type="checkbox" :value="key"/> {{ label }}</label></fieldset>
      <button class="btn btn-primary" type="button" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save collective membership' }}</button>
      <a href="/p/range/network" target="_blank" rel="noopener">View public network ↗</a>
      <p role="status">{{ status }}</p>
    </template>
    <p v-else-if="loaded">This organization is not eligible. Membership is for tenants; demos, Burning Sage, and affiliated organizations are excluded.</p>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({ agencyId:{type:Number,required:true} });
const loading=ref(false),loaded=ref(false),eligible=ref(false),saving=ref(false),error=ref(''),status=ref(''),form=ref({});
const fields=[['description','Public description'],['audience','Who you support'],['focus','Areas of focus'],['website_url','Public website URL'],['contact_url','Public contact URL']];
const services=[['counseling','Mental health'],['tutoring','Tutoring'],['coaching','Life coaching'],['youth','Youth programs'],['skills','Skills programs'],['operations','Management support']];
let version=0;
watch(()=>props.agencyId,async id=>{const n=++version;loading.value=true;loaded.value=false;error.value='';status.value='';try{const {data}=await api.get(`/platform/mental-range/${id}`);if(n!==version)return;form.value=data.membership;eligible.value=data.eligible;loaded.value=true;}catch{if(n===version)error.value='Could not load collective membership.';}finally{if(n===version)loading.value=false;}},{immediate:true});
async function save(){const n=version,id=props.agencyId;saving.value=true;error.value='';status.value='';try{await api.put(`/platform/mental-range/${id}`,form.value);if(n===version)status.value='Collective membership saved.';}catch(e){if(n===version)error.value=e.response?.data?.error?.message||'Could not save membership.';}finally{saving.value=false;}}
</script>
<style scoped>
.range-membership{margin:20px 0;padding:24px;border:1px solid #cdded3;border-radius:14px;background:#f5faf6}.range-membership h3{margin-top:0}.range-membership p{max-width:850px}.range-membership-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}.range-membership-fields label{display:grid;gap:6px}.range-membership input:not([type=checkbox]),.range-membership textarea{width:100%;padding:10px;border:1px solid #b8c8bf;border-radius:6px}.range-membership fieldset{display:flex;flex-wrap:wrap;gap:15px;margin-bottom:18px}.range-membership a{margin-left:16px}@media(max-width:650px){.range-membership-fields{grid-template-columns:1fr}}
</style>
