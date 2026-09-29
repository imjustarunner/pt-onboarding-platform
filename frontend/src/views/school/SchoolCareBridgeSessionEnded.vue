<template><main class="scb-ended"><SchoolCareBridgeBrand/><h1>Your session has ended</h1><p>Sign in again to return to your school portal.</p><a class="scb-button" :href="destination">Return to sign in →</a><p class="scb-pending">SchoolCareBridge · A program of MH4Kidz</p></main></template>
<script setup>
import {computed,onMounted} from 'vue';
import {useRoute} from 'vue-router';
import SchoolCareBridgeBrand from '../../components/schoolcarebridge/SchoolCareBridgeBrand.vue';
import {schoolCareBridgeExternalPath,schoolCareBridgePath} from '../../utils/schoolCareBridge';
import {readSessionEndedContext,clearSessionEndedContext,clearSessionEndedRedirecting} from '../../utils/sessionTimeoutBranding';
import '../../styles/schoolCareBridge.css';
const route=useRoute(),stored=readSessionEndedContext();
const destination=computed(()=>{const candidate=String(route.query.login||stored.loginUrl||'');return /^\/(?:schoolcarebridge\/)?app(?:[/?#]|$)/.test(candidate)&&!candidate.includes('\\')?schoolCareBridgeExternalPath(candidate):schoolCareBridgeExternalPath(schoolCareBridgePath());});
onMounted(()=>{clearSessionEndedContext();clearSessionEndedRedirecting();});
</script>
<style scoped>.scb-ended{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:22px;background:linear-gradient(120deg,#eef9ff,#f2fbf4);color:#123659;padding:30px}.scb-ended h1,.scb-ended p{margin:0}.scb-ended h1{font-size:32px}</style>
