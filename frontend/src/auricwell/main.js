import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { i18n } from '../i18n';
import api from '../services/api';
import App from './App.vue';
import {usesSharedScheduleApi,fullSuiteDestination} from './sharedWorkspace';
import { auricwellAppBase } from './paths';
import '../style.css';
import './style.css';

// A separate entry and router; EHR views are imported from the shared frontend code.
const router = createRouter({ history: createWebHistory(auricwellAppBase()), routes: [
  { path: '/login', name: 'login', component: { template: '<div />' } },
  { path: '/', component: { template: '<div />' } },
  { path: '/:organizationSlug/note-aid', redirect:to=>({path:`/${to.params.organizationSlug}/documentation`,query:to.query}) },
  { path: '/note-aid', redirect:to=>({path:router.currentRoute.value.params.organizationSlug?`/${router.currentRoute.value.params.organizationSlug}/documentation`:'/',query:to.query}) },
  { path: '/:organizationSlug/dashboard', redirect:to=>({path:`/${to.params.organizationSlug}/overview`,query:to.query}) },
  { path: '/:organizationSlug/admin/clients/:clientId', redirect:to=>({path:`/${to.params.organizationSlug}/clients`,query:{...to.query,clientId:to.params.clientId}}) },
  { path: '/:organizationSlug/:section?', component: { template: '<div />' }, meta: { auricwellPreview: true } },
  { path: '/:pathMatch(.*)*', name:'full-suite', component:{template:'<div />'} }
] });
router.beforeEach((to,from)=>{const destination=fullSuiteDestination(to,from);if(destination){window.location.assign(destination);return false;}});
api.defaults.baseURL = '/api';
api.interceptors.request.use(config => {
  const id = window.__auricwellPracticeId;
  const sessionRequest = /^\/auth\/(?:session-lock-config|session-activity)$/.test(config.url);
  if (!id && !sessionRequest) throw new Error('Select a practice before opening its records.');
  if (!sessionRequest && !usesSharedScheduleApi(router.currentRoute.value,config.url)) config.headers['X-AuricWell-Practice'] = String(id);
  else delete config.headers['X-AuricWell-Practice'];
  config.cookieAuthOnly = true;
  config.skipAuthRedirect = true;
  config.skipGlobalLoading = true;
  // Note Workspace uses multipart for optional audio. Plain-text generation uses the
  // existing JSON handler; file upload remains held until preview acceptance.
  if (config.data instanceof FormData && config.url === '/clinical-notes/generate') {
    const entries = [...config.data.entries()];
    if (entries.some(([,v]) => v instanceof File)) throw new Error('Audio uploads are not enabled in this preview.');
    config.data = Object.fromEntries(entries);
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});
api.interceptors.response.use(r => r, error => {
  if ([401, 423].includes(error.response?.status)) window.dispatchEvent(new CustomEvent('auricwell-session-ended',{detail:{status:error.response.status}}));
  return Promise.reject(error);
});
const app = createApp(App).use(createPinia()).use(router).use(i18n);
router.isReady().then(() => app.mount('#app'));
