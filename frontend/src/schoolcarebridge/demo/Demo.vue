<template>
 <div class="scb-demo-app">
  <header class="scb-demo-banner"><div><strong>SchoolCareBridge · Working product demo</strong><span>Actual portal components · Fictional providers, students and school · No live changes</span></div><div class="demo-tools"><button @click="reset">Reset demo</button><a :href="website" target="_top">SchoolCareBridge website ↗</a></div></header>
  <nav class="scb-demo-switch" aria-label="Explore SchoolCareBridge"><button v-for="[key,label] in views" :key="key" :aria-pressed="mode===key" @click="choose(key)">{{label}}</button></nav>
  <p v-if="notice" class="scb-demo-notice" role="status">{{notice}} <button @click="notice=''">Dismiss</button></p>
  <SchoolOverviewDashboard v-if="mode==='overview'||mode==='portals'" :key="mode"/>
  <SchoolPortalView v-else :preview-mode="true" public-demo-token="schoolcarebridge-fictional" />
 </div>
</template>
<script setup>
import {computed,onMounted,onUnmounted,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import SchoolPortalView from '../../views/school/SchoolPortalView.vue';
import SchoolOverviewDashboard from '../../views/admin/SchoolOverviewDashboard.vue';
import {useAuthStore} from '../../store/auth';
import {user} from './fixtures';
const route=useRoute(),router=useRouter(),auth=useAuthStore();
const views=[['home','School portal'],['providers','Provider profiles'],['days','Days / Schedule'],['roster','Student roster'],['overview','Agency overview'],['portals','All portals']];
const mode=computed(()=>route.name==='SchoolPortals'?'portals':route.name==='DemoOverview'||route.query.view==='overview'?'overview':route.query.sp||'home');
const website=location.hostname.replace(/^www\./,'')==='schoolcarebridge.org' ? '/' : '/schoolcarebridge';
const notice=ref('');
function onNotice(event){notice.value=event.detail;}
async function choose(key){await router.replace(key==='portals'?{path:'/admin/school-portals'}:{path:'/',query:key==='overview'?{view:'overview',orgType:'school'}:key==='home'?{}:{sp:key}});}
function reset(){location.href=location.pathname;}
watch(mode,key=>{auth.user={...user,role:['overview','portals'].includes(key)?'admin':'school_staff'};},{immediate:true});
onMounted(()=>{window.addEventListener('scb-demo-notice',onNotice);});
onUnmounted(()=>window.removeEventListener('scb-demo-notice',onNotice));
</script>
<style>
body{margin:0;background:#f6f9fc}.scb-demo-app{font-family:Inter,system-ui,sans-serif;color:#143550}.scb-demo-banner{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 22px;background:#11364f;color:white}.scb-demo-banner strong{font-size:15px}.scb-demo-banner span{display:block;font-size:11px;color:#dae9f1;margin-top:5px}.scb-demo-banner a{color:white;font-size:12px}.demo-tools{display:flex;gap:16px;align-items:center}.scb-demo-banner button{border:1px solid #668699;background:transparent;color:white;border-radius:6px;padding:8px 12px;cursor:pointer}.scb-demo-switch{display:flex;flex-wrap:wrap;gap:8px;padding:12px 22px;background:white;border-bottom:1px solid #d8e5ed}.scb-demo-switch button{background:white;border:1px solid #cfdee8;border-radius:7px;padding:10px 15px;color:#234c66;font:inherit;font-size:12px;cursor:pointer}.scb-demo-switch button[aria-pressed=true]{background:#e8f5fd;border-color:#248cc6;color:#00699f}.scb-demo-notice{padding:14px 22px;margin:0;background:#fff7df;color:#624b0c;font-size:13px}.scb-demo-notice button{margin-left:15px}.scb-demo-app .school-portal{min-height:800px}.scb-demo-app .sp-sidebar{position:sticky;top:0;height:calc(100vh - 124px)}.scb-demo-app .school-overview-page{padding:20px}.scb-demo-app :focus-visible{outline:3px solid #168acc;outline-offset:3px}@media(max-width:700px){.scb-demo-banner{padding:12px}.scb-demo-switch{padding:10px;gap:6px}.scb-demo-switch button{padding:9px;font-size:11px}.scb-demo-app .sp-sidebar{position:fixed;height:100vh}.scb-demo-app .school-overview-page{padding:12px}}
</style>
