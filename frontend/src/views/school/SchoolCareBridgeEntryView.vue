<template>
 <div class="scb-entry" :class="{'school-login-view':school&&!auth.isAuthenticated}" :style="schoolStyle">
  <header v-if="!portalOpen" class="scb-header">
   <SchoolCareBridgeBrand />
   <nav class="scb-entry-links" aria-label="Portal navigation">
    <router-link :to="schoolCareBridgePath()">{{school ? 'Switch school' : 'Portal home'}}</router-link>
    <a v-if="!school" href="https://mh4kidz.org">MH4Kidz ↗</a>
    <button v-if="auth.isAuthenticated" @click="logout">Sign out</button>
   </nav>
  </header>
  <p v-if="busy" class="scb-status" role="status">Opening your portal…</p>
  <section v-else-if="error" class="scb-status" role="alert"><h1>We couldn’t open this portal</h1><p>{{error}}</p><router-link :to="schoolCareBridgePath()">Choose a school</router-link> <button @click="load">Try again</button></section>
  <template v-else-if="auth.isAuthenticated">
   <OrganizationDashboardView v-if="school && authorized" />
   <main v-else class="scb-school-picker"><p class="scb-eyebrow">SchoolCareBridge · A program of MH4Kidz</p><h1>Choose your school</h1><p>Open a school portal available to your account.</p><div v-if="partners.length" class="scb-partner-picker"><h2>Your agency’s SchoolCareBridge</h2><div class="scb-picker-grid"><router-link v-for="partner in partners" :key="partner.id" :to="schoolCareBridgePartnerPath(partner.slug)"><img v-if="partner.logoUrl||partner.slug==='itsco'" :src="asset(partner.logoUrl||'/assets/itsco/logo.png')" :alt="partner.name"/><strong>{{partner.name}}</strong><span>SchoolCareBridge →</span></router-link></div></div><div class="scb-picker-grid"><router-link v-for="item in schools" :key="item.id" :to="schoolCareBridgePath(item.slug)"><img v-if="item.logoUrl" :src="asset(item.logoUrl)" alt="" @error="hideImage"/><strong>{{item.name}}</strong><span>→</span></router-link></div><p v-if="!schools.length">No active school portals are available to this account. Contact your school or agency administrator for access.</p><a v-if="auth.user?.role!=='school_staff'" class="scb-button scb-outline" :href="agencyWorkspace">Open agency workspace ↗</a></main>
  </template>
  <main v-else class="scb-login-layout">
   <section v-if="!school" class="scb-login-story">
    <p class="scb-eyebrow">Connecting schools. Supporting students.</p>
    <h1>A shared place for schools and care teams.</h1>
    <p>Find your school, connect with your care partners, and keep everyday coordination in one place.</p>
    <router-link to="/schoolcarebridge/for-schools">Explore SchoolCareBridge →</router-link>
    <router-link class="scb-find-partner" to="/schoolcarebridge/partners">Find your agency →</router-link>
   </section>
   <section class="scb-auth-card" aria-labelledby="scb-sign-in-heading">
    <div v-if="school" class="scb-school-welcome">
     <img v-if="school.logoUrl" class="scb-school-crest" :src="asset(school.logoUrl)" alt="" @error="hideImage" />
     <p class="scb-eyebrow">School portal</p>
     <h1>{{school.name}}</h1>
    </div>
    <h2 id="scb-sign-in-heading">{{school ? 'Sign in' : 'Welcome back'}}</h2>
    <p>Start with your email address.</p>
    <LoginView />
    <div v-if="school" class="scb-quick-view">
     <a :href="`https://qv.app.schoolcarebridge.org/?organization=${encodeURIComponent(school.slug)}`">Open Quick View <span aria-hidden="true">↗</span></a>
    </div>
   </section>
  </main>
  <div v-if="!portalOpen && school?.agencies?.length" class="scb-affiliates" role="group" aria-label="Affiliated agencies">
   <span>Affiliated agencies</span>
   <div v-for="agency in school.agencies" :key="agency.id">
    <img v-if="agency.logoUrl" :src="asset(agency.logoUrl)" alt="" @error="hideImage" />
    <strong>{{agency.name}}</strong>
   </div>
  </div>
  <ServiceUseNotice v-if="busy || error || auth.isAuthenticated" school-portal />
  <footer class="scb-entry-footer">SchoolCareBridge · A program of MH4Kidz <span>Technology managed by Plot Twist Co.</span><router-link to="/schoolcarebridge/security">Access & privacy</router-link></footer>
 </div>
</template>
<script setup>
import {computed,onMounted,onUnmounted,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import SchoolCareBridgeBrand from '../../components/schoolcarebridge/SchoolCareBridgeBrand.vue';
import ServiceUseNotice from '../../components/legal/ServiceUseNotice.vue';
import LoginView from '../LoginView.vue';
import OrganizationDashboardView from '../OrganizationDashboardView.vue';
import {useAuthStore} from '../../store/auth';
import {useAgencyStore} from '../../store/agency';
import {useOrganizationStore} from '../../store/organization';
import {useBrandingStore} from '../../store/branding';
import api from '../../services/api';
import {toUploadsUrl} from '../../utils/uploadsUrl';
import {schoolCareBridgePath,schoolCareBridgeExternalPath} from '../../utils/schoolCareBridge';
import {schoolCareBridgePartnerPath} from '../../utils/schoolCareBridgeTenant';
import '../../styles/schoolCareBridge.css';
import { setPendingLoginRoute } from '../../utils/loginRemember';
const route=useRoute(),router=useRouter(),auth=useAuthStore(),agencyStore=useAgencyStore(),organizationStore=useOrganizationStore(),brandingStore=useBrandingStore();
const partners=ref([]);
const school=ref(null),schools=ref([]),busy=ref(true),error=ref(''),authorized=ref(false);
const portalOpen=computed(()=>auth.isAuthenticated && school.value && authorized.value && !busy.value && !error.value);
const asset=value=>value?.startsWith('/assets/')?value:toUploadsUrl(value);
const hideImage=event=>{event.target.style.display='none';};
const options={skipAuthRedirect:true,skipGlobalLoading:true};
const schoolStyle=computed(()=>{const color=school.value?.colors?.primary;return /^#(?:[a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(color||'')?{'--scb-school-color':color}:{};});
const agencyWorkspace=computed(()=>{const agency=(agencyStore.userAgencies||[]).find(a=>a.organization_type==='agency');return `https://plottwisthq.com/${encodeURIComponent(agency?.portal_url||agency?.slug||'')}${agency?'/dashboard':'dashboard'}`;});
let loadVersion=0;
onUnmounted(()=>loadVersion++);
async function load(){const version=++loadVersion;busy.value=true;error.value='';authorized.value=false;school.value=null;schools.value=[];try{
 const slug=String(route.params.organizationSlug||'');
 if(slug){const {data}=await api.get(`/schoolcarebridge/schools/${encodeURIComponent(slug)}`,options);if(version!==loadVersion)return;school.value=data.school;}
 if(route.query.routingHint){const token=String(route.query.routingHint);const clean={...route.query};delete clean.routingHint;try{const {data}=await api.post('/schoolcarebridge/routing-hint/consume',{token,destination:window.location.origin+schoolCareBridgeExternalPath(route.path)},options);setPendingLoginRoute({username:data.username,path:route.path});}finally{await router.replace({path:route.path,query:clean});}}
 if(version!==loadVersion)return;
 if(auth.isAuthenticated){
  if(!agencyStore.userAgencies?.length)await agencyStore.fetchUserAgencies();
  if(slug){await api.get(`/schoolcarebridge/access/${encodeURIComponent(slug)}`,options);if(version!==loadVersion)return;await organizationStore.fetchBySlug(slug);if(version!==loadVersion)return;brandingStore.setActiveRouteSlug(slug);await brandingStore.fetchAgencyTheme(slug);if(version!==loadVersion)return;authorized.value=true;}
  else {const [schoolResponse,partnerResponse]=await Promise.all([api.get('/schoolcarebridge/my-schools',options),api.get('/schoolcarebridge/my-partners',options)]);schools.value=schoolResponse.data.schools||[];partners.value=partnerResponse.data.partners||[];}
 }
 document.title=school.value?`${school.value.name} | SchoolCareBridge`:'Sign in | SchoolCareBridge';
}catch(e){if(version!==loadVersion)return;if(e.response?.status===401 && auth.isAuthenticated){auth.clearAuth();error.value='';}else{error.value=e.response?.data?.error?.message||'Please try again or contact your school administrator.';}}finally{if(version===loadVersion)busy.value=false;}}
async function logout(){await auth.logout();if(auth.isAuthenticated)return;window.location.assign(schoolCareBridgeExternalPath(schoolCareBridgePath(school.value?.slug||'')));}
watch(()=>[auth.isAuthenticated,route.params.organizationSlug],()=>load());
onMounted(load);
</script>
<style scoped>
.scb-entry{background:#f5faff}.scb-header{background:white;max-width:none;padding:8px 35px;border-bottom:1px solid #e2ebf1}.scb-entry-links{display:flex;gap:20px;font-size:12px;align-items:center}.scb-entry-links button{border:1px solid #ccdce9;background:white;border-radius:8px;padding:8px 13px}.scb-affiliates{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:24px;background:white;border-bottom:1px solid #e2ebf1;padding:12px;font-size:12px}.scb-affiliates>span{color:#65758a;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.scb-affiliates>div{display:flex;align-items:center;gap:8px}.scb-affiliates img{max-width:95px;height:30px;object-fit:contain}.scb-login-layout{max-width:1440px;margin:auto;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:55px;padding:65px 65px 85px;background:linear-gradient(125deg,#f1fbffdd,#f6fbf5ee),url('/assets/mh4kidz/mountains.webp') center/cover}.scb-login-story h1{font-size:clamp(34px,3.7vw,54px);letter-spacing:-.035em;line-height:1.12;margin:0 0 25px;color:var(--scb-school-color,#102e53)}.scb-login-story>p:not(.scb-eyebrow){font-size:18px;color:#465f76}.scb-auth-card{padding:35px 30px;background:white;box-shadow:0 14px 50px #16394f14;border:1px solid #e2eaf0;border-radius:22px;min-width:0}.scb-auth-card>h2{font-size:29px;text-align:center;margin-bottom:10px}.scb-auth-card>p{text-align:center;color:#5a7085;font-size:14px}.scb-auth-card :deep(.login-page){padding:0!important;background:none!important;min-height:0!important;display:block!important}.scb-auth-card :deep(.login-container){background:none!important;width:100%!important;max-width:none!important;padding:0!important;margin:0!important}.scb-auth-card :deep(.login-card){width:100%!important;max-width:none!important;padding:0!important;box-shadow:none!important;border:0!important;background:none!important;display:block!important}.scb-auth-card :deep(.login-dual-brand),.scb-auth-card :deep(.login-logo),.scb-auth-card :deep(.logo),.scb-auth-card :deep(.login-card>h2),.scb-auth-card :deep(.login-card>h1),.scb-auth-card :deep(.login-card>.subtitle),.scb-auth-card :deep(.app-preview-toggle-group),.scb-auth-card :deep(.platform-footer),.scb-auth-card :deep(video){display:none!important}.scb-entry-footer{display:flex;gap:25px;justify-content:center;flex-wrap:wrap;padding:28px 20px;font-size:12px;color:#5a7085}.scb-entry-footer span{font-size:11px}.scb-school-picker{max-width:1000px;margin:auto;padding:65px 25px;min-height:60vh}.scb-school-picker h1{font-size:38px}.scb-picker-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:15px;margin:30px 0}.scb-picker-grid a{display:flex;align-items:center;gap:14px;background:white;border:1px solid #dce8f0;border-radius:14px;padding:25px;text-decoration:none}.scb-picker-grid img{width:42px;height:42px;object-fit:contain}.scb-picker-grid span{margin-left:auto}
@media(max-width:900px){.scb-login-layout{gap:25px;padding:40px 25px}.scb-header{flex-wrap:wrap;padding:8px 20px}.scb-entry-links{width:100%;justify-content:center;padding-bottom:10px}.scb-auth-card{padding:25px 20px}}
@media(max-width:650px){.scb-login-layout{grid-template-columns:1fr;padding:30px 18px}.scb-login-story h1{font-size:33px}.scb-login-story>p:not(.scb-eyebrow){font-size:16px}.scb-picker-grid{grid-template-columns:1fr}.scb-auth-card{padding:28px 18px}.scb-entry-footer{gap:10px;text-align:center}}

.scb-auth-card :deep(.login-credentials-wrap){display:flex!important;flex-direction:column;gap:18px!important}.scb-auth-card :deep(.form-group){margin-bottom:0}.scb-auth-card :deep(.intakes-trigger-row){display:none}.scb-auth-card :deep(.btn-primary){background:linear-gradient(120deg,#008de5,#0768cc)!important;border-color:transparent!important;color:white!important;border-radius:9px;min-height:46px}.scb-auth-card :deep(input:not([type=checkbox])),.scb-auth-card :deep(select){border:1px solid #c6d5e2!important;border-radius:8px!important;min-height:48px!important;background:white!important;color:#173b5e!important;font-size:15px!important}.scb-auth-card :deep(.help-link),.scb-auth-card :deep(.login-security-link),.scb-auth-card :deep(.password-toggle){color:#006ec6!important}.scb-auth-card :deep(label){color:#183958}.scb-auth-card :deep(.login-help){line-height:1.8}.scb-auth-card :deep(.login-security-footer){background:none;padding-top:16px}.scb-auth-card :deep(.remember-row){margin-top:20px}.scb-auth-card :deep(.login-page){--primary-color:#007cdd;--secondary-color:#139e61}

.scb-find-partner{display:block;margin-top:18px;font-weight:700;color:#007f97!important}
.scb-partner-picker h2{font-size:22px;margin-top:30px}
.scb-partner-picker .scb-picker-grid a{border-color:#a4d5d7;background:#f5fffc}
.scb-partner-picker .scb-picker-grid img{width:100px;height:70px}

/* School entry is a sign-in page, without a dashboard preview or marketing hero. */
.school-login-view{display:flex;flex-direction:column;min-height:100vh;background:#f3f6f8}
.school-login-view>.scb-header{width:100%;padding:8px clamp(20px,4vw,64px);gap:20px;flex-wrap:nowrap}
.school-login-view .scb-header :deep(.scb-brand){width:180px}
.school-login-view .scb-header :deep(.scb-brand img){height:64px}
.school-login-view .scb-header :deep(.scb-brand span){font-size:10px;margin-bottom:4px}
.school-login-view .scb-entry-links{width:auto;padding:0;font-size:14px}
.school-login-view .scb-entry-links a{padding:12px 0;text-decoration:underline;text-underline-offset:4px}
.school-login-view>.scb-login-layout{display:block;width:100%;max-width:600px;flex:1;padding:40px 20px 24px;background:none;margin:0 auto}
.school-login-view .scb-auth-card{padding:32px;border-radius:16px;box-shadow:0 4px 24px #16394f08;border-color:#dce5eb;border-top:3px solid var(--scb-school-color,#0875be)}
.scb-school-welcome{text-align:center;border-bottom:1px solid #e2eaf0;padding-bottom:24px;margin-bottom:24px}
.scb-school-crest{display:block;width:80px;height:80px;object-fit:contain;margin:0 auto 16px}
.scb-school-welcome .scb-eyebrow{color:#53677a;font-size:11px;letter-spacing:.1em;margin:0 0 6px}
.scb-school-welcome h1{font-size:clamp(24px,3vw,30px);font-family:inherit;color:#17364d;line-height:1.2;letter-spacing:-.025em;margin:0;overflow-wrap:anywhere}
.school-login-view .scb-auth-card>h2{font-size:23px;color:#17364d;margin:0 0 8px}
.school-login-view .scb-auth-card>p{margin:0 0 24px;color:#53677a}
.school-login-view .scb-auth-card :deep(.btn-primary){background:#0875be!important}
.school-login-view .scb-auth-card :deep(.btn-secondary){color:#234b67!important}
.school-login-view .scb-auth-card :deep(.powered-by-footer){background:none;border-top:1px solid #e2eaf0;padding:16px 0 0;margin-top:20px}
.scb-quick-view{margin-top:20px;padding-top:18px;border-top:1px solid #e2eaf0;text-align:center;font-size:14px}
.scb-quick-view a{color:#155d89;text-decoration:underline;text-underline-offset:4px;display:inline-block;padding:6px}
.school-login-view>.scb-affiliates{max-width:650px;margin:0 auto;padding:8px 24px 20px;background:none;border:0;gap:12px 20px;color:#425b70}
.school-login-view>.scb-affiliates>span{width:100%;text-align:center;color:#53677a;text-transform:none;letter-spacing:0;font-size:12px}
.school-login-view>.scb-entry-footer{font-size:12px;color:#53677a;padding:16px 24px 24px;gap:8px 20px;background:none}
@media(max-width:650px){
 .school-login-view>.scb-header{padding:8px 18px}
 .school-login-view .scb-header :deep(.scb-brand){width:150px}
 .school-login-view .scb-header :deep(.scb-brand img){height:54px}
 .school-login-view .scb-entry-links{font-size:13px}
 .school-login-view>.scb-login-layout{padding:24px 14px 20px}
 .school-login-view .scb-auth-card{padding:24px 20px}
 .school-login-view .scb-auth-card :deep(.login-help){font-size:12px}
 .scb-school-welcome{padding-bottom:20px;margin-bottom:20px}
}
.scb-auth-card :deep(.login-form){display:block!important;width:100%!important}.scb-auth-card :deep(.login-form .form-group){display:block!important;float:none!important;width:100%!important;max-width:none!important;margin:0 0 18px!important;grid-column:auto!important}.scb-auth-card :deep(.login-form .form-group input),.scb-auth-card :deep(.login-form .form-group select){width:100%!important;box-sizing:border-box}.scb-auth-card :deep(.login-form .form-group label){display:block;margin-bottom:8px}
</style>
