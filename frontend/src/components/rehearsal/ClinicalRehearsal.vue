<template><section class="clinical-rehearsal"><header><h2>AuricWell · ITSCO clinical-form rehearsal</h2><p>Alex Example is fictional. Open any prepared sample below, edit it, add live signatures, or share it to the simulated client/guardian portal. All actions stay in this page. Printing produces a rehearsal copy.</p><button @click="portal=false">Staff workspace</button><button @click="showPortal(21)">Client portal</button><button @click="showPortal(22)">Guardian portal</button><button @click="reset">Reset sample forms</button></header><Portal v-if="portal" :key="`${generation}:${recipient}`" :client-id="41"/><Panel v-else :key="generation" :agency-id="bundle.agency.id" :client-id="41"/></section></template>
<script setup>
import {ref,provide} from 'vue';
import Panel from '../safetyPlans/SafetyPlansPanel.vue';
import Portal from '../safetyPlans/PortalSafetyPlans.vue';
import {createClinicalRehearsalEngine} from './clinicalEngine';
const props=defineProps({bundle:Object});
const bundle={...props.bundle,branding:{...props.bundle.branding,name:`${props.bundle.branding.name} · REHEARSAL — NOT A CLINICAL RECORD`}};
const http=createClinicalRehearsalEngine(bundle);provide('clinicalFormsHttp',http);
const portal=ref(false),recipient=ref(21),generation=ref(0);
function showPortal(id){recipient.value=id;http.setRecipient(id);portal.value=true;}
function reset(){http.reset();generation.value++;portal.value=false;}
</script>
<style scoped>.clinical-rehearsal>header{padding:24px;border-radius:12px;background:#edf3ef;color:#194c3b}p{line-height:1.8}button{padding:12px;margin:6px;border:1px solid #85a291;border-radius:8px;background:white;color:#194c3b;font:inherit;cursor:pointer}</style>
