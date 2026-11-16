<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import {useFamilyLocale} from '../../composables/useFamilyLocale';
import {tenantLegalProfiles,canonicalLegalSlug} from '../../content/tenantLegalProfiles';
const props=defineProps({clientId:[Number,String],agencyId:[Number,String]});
const emit=defineEmits(['context','messages']);
const {ft}=useFamilyLocale();
const context=ref(null),loading=ref(false),error=ref('');let sequence=0;
const contact=computed(()=>{const saved=context.value?.contact||{},published=tenantLegalProfiles[canonicalLegalSlug(saved.slug)]||{};return {name:published.name||saved.name,phone:saved.phone||published.phone,email:saved.email||published.email,extension:saved.extension};});
const phoneLink=computed(()=>`tel:${String(contact.value.phone||'').replace(/[^+0-9]/g,'')}${contact.value.extension?';ext='+contact.value.extension:''}`);
const emailLink=computed(()=>`mailto:${contact.value.email}`);
async function load(){const request=++sequence;context.value=null;error.value='';loading.value=false;emit('context',null);if(!props.agencyId||!props.clientId)return;loading.value=true;try{const {data}=await api.get('/guardian-portal/help-context',{params:{agencyId:props.agencyId,clientId:props.clientId},skipGlobalLoading:true});if(request===sequence){context.value=data;emit('context',data);}}catch{if(request===sequence)error.value='Contact details could not be loaded. Try again or use secure messages.';}finally{if(request===sequence)loading.value=false;}}
watch(()=>[props.agencyId,props.clientId],load,{immediate:true});onBeforeUnmount(()=>sequence++);
</script>
<template><section class="practice-contact" :aria-label="ft('Contact your practice')"><h2>{{ ft('Contact your practice') }}</h2><p v-if="loading" role="status">{{ ft('Loading contact details…') }}</p><p v-if="error" role="alert">{{ ft(error) }} <button type="button" @click="load">{{ ft('Try again') }}</button></p><template v-if="context"><h3>{{ contact.name }}</h3><dl><template v-if="contact.phone"><dt>{{ ft('Main number') }}</dt><dd><a :href="phoneLink">{{ contact.phone }}<template v-if="contact.extension"> {{ ft('ext.') }} {{ contact.extension }}</template></a></dd></template><template v-if="contact.email"><dt>{{ ft('Support email') }}</dt><dd><a :href="emailLink">{{ contact.email }}</a></dd></template><dt>{{ ft('Support hours') }}</dt><dd>{{ ft('8 AM–5 PM Mountain Time') }}</dd></dl><p>{{ ft('Use secure messages for private care or billing details. Phone and email are also available for general questions.') }}</p><button type="button" @click="$emit('messages')">{{ ft('Open secure messages') }}</button></template></section></template>
<style scoped>.practice-contact{padding:20px;margin-bottom:20px;border:1px solid #d9e5ef;border-radius:14px;background:#fff;color:#173451}.practice-contact h2{margin-top:0}.practice-contact dl{display:grid;grid-template-columns:auto 1fr;gap:8px 20px}.practice-contact dt{font-weight:600}.practice-contact dd{margin:0;overflow-wrap:anywhere}.practice-contact p{line-height:1.6}.practice-contact button{font:inherit;padding:10px 14px;border:1px solid #bed2e4;border-radius:8px;background:#edf5fb;color:#17436f;cursor:pointer}[role=alert]{color:#a02828}@media(max-width:560px){.practice-contact dl{grid-template-columns:1fr;gap:4px}.practice-contact dd{margin-bottom:10px}}</style>
