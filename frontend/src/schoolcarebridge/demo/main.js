import {createApp} from 'vue';
import {createPinia} from 'pinia';
import {createRouter,createWebHashHistory} from 'vue-router';
import {AxiosError} from 'axios';
import api from '../../services/api';
import {useAuthStore} from '../../store/auth';
import {useOrganizationStore} from '../../store/organization';
import {useAgencyStore} from '../../store/agency';
import {useBrandingStore} from '../../store/branding';
import {school,agency,user,demoResponse} from './fixtures';
import App from './Demo.vue';
import '../../style.css';
import '../../styles/data-surfaces.css';
import '../../styles/schoolCareBridgeWorkspaceBrand.css';
// A separate document and Pinia instance: neither live app stores nor login credentials are changed.
const notify=message=>window.dispatchEvent(new CustomEvent('scb-demo-notice',{detail:message}));
const adapter=async config=>{
 try{return {data:structuredClone(demoResponse(config.url,config)),status:200,statusText:'OK',headers:{},config};}
 catch(error){if(import.meta.env.DEV)console.info('DEMO_FIXTURE',config.method,config.url);if(!['get','head'].includes(String(config.method).toLowerCase()))notify(error.message);throw new AxiosError(error.message,'SCB_DEMO_ONLY',config,null,{status:error.status||409,data:{error:{message:error.message}},headers:{},config});}
};
api.defaults.adapter=adapter;
api.interceptors.request.use(config=>{config.adapter=adapter;config.withCredentials=false;config.skipAuthRedirect=true;config.skipGlobalLoading=true;return config;});
window.open=()=>{notify('This preview stays in the fictional workspace. Nothing was opened, sent or saved.');return null;};
const pinia=createPinia();
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/admin/school-portals',name:'SchoolPortals',component:{template:'<span />'}},{path:'/admin/schools/overview',name:'DemoOverview',component:{template:'<span />'}},{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});
router.beforeEach((to,from)=>{
 if (to.path==='/' || ['/admin/school-portals','/admin/schools/overview',`/${school.slug}/dashboard`].includes(to.path)) return true;
 if (!from.matched.length) return '/';
 notify('That screen is outside this fictional demo. Explore providers, the schedule, roster or school overview.');
 return false;
});
const app=createApp(App);app.use(pinia);app.use(router);
const auth=useAuthStore();auth.user={...user};auth.logout=async()=>window.location.reload();
useOrganizationStore().setCurrentOrganization({...school});
const agencies=useAgencyStore();agencies.currentAgency={...agency};agencies.userAgencies=[{...agency},{...school}];agencies.agencies=[{...agency}];
const brand=useBrandingStore();brand.platformBranding={organization_name:'SchoolCareBridge'};
async function mountDemo() {
await router.isReady();
if(!location.hash || location.hash==='#/'){const requested=new URLSearchParams(location.search);await router.replace({path:'/',query:Object.fromEntries(requested)});}
app.mount('#scb-demo');

}
export const ready=mountDemo();
