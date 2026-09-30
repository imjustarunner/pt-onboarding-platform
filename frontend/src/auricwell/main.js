import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { i18n } from '../i18n';
import api from '../services/api';
import App from './App.vue';
import { auricwellAppBase } from './paths';
import '../style.css';
import './style.css';

// A separate entry and router; EHR views are imported from the shared frontend code.
const router = createRouter({ history: createWebHistory(auricwellAppBase()), routes: [
  { path: '/login', name: 'login', component: { template: '<div />' } },
  { path: '/', component: { template: '<div />' } },
  { path: '/:organizationSlug/:section?', component: { template: '<div />' }, meta: { auricwellPreview: true } }
] });
api.defaults.baseURL = '/api';
api.interceptors.request.use(config => {
  const id = window.__auricwellPracticeId;
  if (!id) throw new Error('Select a practice before opening its records.');
  config.headers['X-AuricWell-Practice'] = String(id);
  config.cookieAuthOnly = true;
  config.skipAuthRedirect = true;
  config.skipGlobalLoading = true;
  // Note Aid uses multipart for optional audio. Plain-text generation uses the
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
  if ([401, 423].includes(error.response?.status)) window.dispatchEvent(new Event('auricwell-session-ended'));
  return Promise.reject(error);
});
const app = createApp(App).use(createPinia()).use(router).use(i18n);
router.isReady().then(() => app.mount('#app'));
