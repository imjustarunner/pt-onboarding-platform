<template>
  <section class="auricwell-school-transition">
    <h3>School schedule transition</h3>
    <p>Connect existing school planning slots with the provider’s real appointments. School staff see the same dated bookings and can change an upcoming appointment’s time.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <label v-if="schools.length">School<select v-model="schoolId" :disabled="busy"><option value="">Choose a school</option><option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option></select></label>
    <p v-else-if="!error">This provider has no active school assignments in this practice.</p>
    <SchoolBookedSessions v-if="schoolId" :school-organization-id="schoolId" :provider-user-id="providerId" allow-setup @busy="setBusy" />
  </section>
</template>
<script setup>
import { onBeforeUnmount,ref,watch } from 'vue';
import api from '../../services/api';
import SchoolBookedSessions from '../school/redesign/SchoolBookedSessions.vue';
const props=defineProps({agencyId:{type:[Number,String],required:true},providerId:{type:[Number,String],required:true}});
const emit=defineEmits(['busy']);
const busy=ref(false),schools=ref([]),schoolId=ref(''),error=ref('');let version=0;
const setBusy=value=>{busy.value=value;emit('busy',value);};
onBeforeUnmount(()=>{version++;emit('busy',false);});
watch(()=>[props.agencyId,props.providerId],async()=>{const token=++version;schools.value=[];schoolId.value='';error.value='';if(!props.agencyId||!props.providerId)return;try{const result=await api.get('/school-appointment-transition/schools',{params:{agencyId:props.agencyId,providerId:props.providerId}});if(token!==version)return;schools.value=result.data.schools||[];if(schools.value.length===1)schoolId.value=schools.value[0].id;}catch(e){if(token===version)error.value=e.response?.data?.error?.message||'School assignments could not be loaded.';}},{immediate:true});
</script>
<style scoped>
.auricwell-school-transition label{display:grid;gap:7px;max-width:420px}.auricwell-school-transition select{padding:10px;font:inherit;border:1px solid var(--border,#cbd5e1);border-radius:8px;background:var(--bg-primary,#fff);color:inherit}.auricwell-school-transition p{line-height:1.6}
</style>
