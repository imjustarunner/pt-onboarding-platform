import {createApp} from 'vue';
import {createPinia} from 'pinia';
import {createRouter,createWebHashHistory} from 'vue-router';
import {AxiosError} from 'axios';
import api from '../../services/api';
import {i18n} from '../../i18n';
import {practice,actor,demoResponse} from './fixtures';
import Demo from './Demo.vue';
import { initializeAuricwellAnalytics } from '../website/analytics.js';
import '../../style.css';
import '../../styles/data-surfaces.css';
import '../style.css';
const notify=message=>window.dispatchEvent(new CustomEvent('aw-demo-notice',{detail:message}));
const adapter=async config=>{
 try{return {data:structuredClone(demoResponse(config.url,config)),status:200,statusText:'OK',headers:{},config};}
 catch(error){if(import.meta.env.DEV)console.info('DEMO_FIXTURE',config.method,config.url);if(!['get','head'].includes(String(config.method).toLowerCase()) && !/\/(audit|note-aid-setup-complete|sync-client-lifecycle|preferences)$/.test(config.url))notify(error.message);throw new AxiosError(error.message,'AW_DEMO_ONLY',config,null,{status:409,data:{error:{message:error.message}},headers:{},config});}
};
api.defaults.adapter=adapter;
api.interceptors.request.use(config=>{config.adapter=adapter;config.withCredentials=false;config.skipAuthRedirect=true;config.skipGlobalLoading=true;return config;});
window.open=()=>{notify('Demo only: external sessions and downloads are not connected.');return null;};
// No capture prompts, even when visitors explore the shared transcription controls.
if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia=async()=>{notify('Recording is not available in the fictional demo.');throw new DOMException('Recording is disabled in this demo.','NotAllowedError');};
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/:organizationSlug/note-aid',name:'NoteAid',redirect:to=>({path:`/${to.params.organizationSlug}/documentation`,query:to.query})},{path:'/note-aid',redirect:to=>({path:`/${practice.slug}/documentation`,query:to.query})},{path:'/:organizationSlug/my-schedule',redirect:to=>({path:`/${to.params.organizationSlug}/appointments`,query:to.query})},{path:'/:organizationSlug/dashboard',redirect:to=>({path:`/${to.params.organizationSlug}/overview`,query:to.query})},{path:'/:organizationSlug/admin/clients/:clientId',redirect:to=>({path:`/${to.params.organizationSlug}/clients`,query:{clientId:to.params.clientId}})},{path:'/:organizationSlug/:section?',component:{template:'<span />'},meta:{auricwellPreview:true}},{path:'/:organizationSlug/tasks/lists/:listId',redirect:to=>({path:`/${to.params.organizationSlug}/tasks`,query:{listId:to.params.listId}})},{path:'/:pathMatch(.*)*',redirect:`/${practice.slug}`} ]});
router.beforeEach(to=>{
 if(to.params.organizationSlug!==practice.slug)return `/${practice.slug}`;
 if(to.params.section&&!['overview','appointments','clients','documentation','billing','providers','reports','tasks'].includes(to.params.section)){notify('That screen is outside this fictional demo.');return `/${practice.slug}`;}
});
const app=createApp(Demo);app.use(createPinia());app.use(router);app.use(i18n);
sessionStorage.setItem('sched_office_reminder_seen','1');
localStorage.setItem(`schedule.overlayPrefs.v2:${actor.id}:${practice.id}`,JSON.stringify({rowHeightMode:'large',hideWeekend:true,spanMode:'week'}));
export const ready=router.isReady().then(()=>{
  app.mount('#aw-demo');
  initializeAuricwellAnalytics({mode:'demo',router,context:window.__auricwellDemoAnalyticsContext});
  delete window.__auricwellDemoAnalyticsContext;
});
