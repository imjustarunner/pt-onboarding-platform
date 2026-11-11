import { createApp } from 'vue';
import {vAddressAutocomplete} from '../directives/addressAutocomplete.js';
import '../styles/addressAutocomplete.css';
import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import {registerMobileRouter} from './routerBridge.js';
import {createPinia} from 'pinia';
import {familyDeviceContext} from './familyContext.js';
import MobileApp from './MobileApp.vue';
import { native } from './transport.js';
const familyRoutes=[
 {path:'/mobile/family/:organizationSlug/guardian',name:'OrganizationGuardianPortal',component:()=>import('../views/guardian/GuardianPortalView.vue')},
 {path:'/mobile/family/:organizationSlug/guardian/waivers',name:'OrganizationGuardianWaivers',component:()=>import('../views/guardian/GuardianWaiversView.vue')},
 {path:'/mobile/family/:organizationSlug/guardian/skill-builders/event/:eventId',name:'OrganizationGuardianSkillBuilderEvent',component:()=>import('../views/guardian/GuardianSkillBuildersEventView.vue')},
 {path:'/mobile/family/:organizationSlug/guardian/program-event/:eventId',name:'OrganizationGuardianProgramEvent',component:()=>import('../views/guardian/GuardianSkillBuildersEventView.vue')},
 {path:'/mobile/family/my-portal',name:'DependentPortal',component:()=>import('../views/guardian/DependentPortalView.vue')},
 {path:'/:pathMatch(.*)*',component:{template:'<p role="status">Choose a family portal section to continue.</p>'}}
];
const router=createRouter({history:native?createMemoryHistory():createWebHistory(),routes:familyRoutes});
registerMobileRouter(router);
router.beforeEach(to=>{
 if(!familyDeviceContext() || to.path.startsWith('/mobile/'))return;
 if(/\/guardian(?:\/|$)/.test(to.path) || to.path==='/my-portal')return {path:'/mobile/family'+to.path,query:to.query,hash:to.hash,replace:true};
 return {path:router.currentRoute.value.path,query:{...router.currentRoute.value.query,panel:to.path==='/my-records'?'documents':'family'},replace:true};
});
createApp(MobileApp).directive('address-autocomplete',vAddressAutocomplete).use(createPinia()).use(router).mount('#app');
