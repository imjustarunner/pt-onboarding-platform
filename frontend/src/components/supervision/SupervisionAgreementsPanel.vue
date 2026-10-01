<template><section v-if="agreements.length || error"><SupervisionAgreementCard v-for="agreement in agreements" :key="agreement.id" :agreement="agreement" @signed="load" /><p v-if="error" role="alert">{{error}}</p></section></template>
<script setup>
import {ref,watch} from 'vue';import api from '../../services/api';import SupervisionAgreementCard from './SupervisionAgreementCard.vue';
const props=defineProps({userId:[Number,String],agencyId:[Number,String]});const agreements=ref([]),error=ref('');
async function load(){if(!props.userId||!props.agencyId)return;try{const{data}=await api.get('/supervision/agreements',{params:{userId:props.userId,agencyId:props.agencyId}});agreements.value=data.agreements||[];error.value='';}catch(e){error.value=e.response?.data?.error?.message||'Unable to load supervision agreements.';}}
watch(()=>[props.userId,props.agencyId],load,{immediate:true});
</script>
