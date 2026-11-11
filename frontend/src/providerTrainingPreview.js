import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import ProviderTransitionLearning from './components/training/ProviderTransitionLearning.vue';
import FamilyWelcomeSettings from './components/school/FamilyWelcomeSettings.vue';
import NoteAidStructuredChartPanel from './components/clinical/NoteAidStructuredChartPanel.vue';
import api from './services/api';
const template = 'Hello {{parent_name}},\n\nI am {{provider_name}}, your provider at {{school_name}} on {{service_day}}. I look forward to connecting with your family. You can learn about me at {{profile_link}}.\n\nPlease reply with a good time to connect.';
api.defaults.adapter = async config => {
  if (config.method === 'get' && config.url === '/school-contact-plan') return { status: 200, statusText: 'OK', config, headers: {}, data: { eligible: true, agencyId: 450, status: 'enabled', rolloutPhase: 'phase_1', schools: [{ id: 451, name: 'Cedar Grove — SYNTHETIC QA' }, { id: 9001, name: 'Pine Ridge — SYNTHETIC QA' }], template, secondTemplate: template, finalTemplate: template, smsTemplate: 'Hello {{parent_name}}, this is {{provider_name}} checking in about our next steps. Please reply with a good time to connect.', previewValues: { parent_name: 'Alex Example', provider_name: 'Avery QA', service_day: 'Thursday', profile_link: 'https://example.invalid/qa-profile' } } };
  throw new Error('Synthetic training preview: network action disabled.');
};
const screen = new URLSearchParams(location.search).get('screen') || 'learning';
createApp({ render() { return h('main', { style: 'max-width:1280px;margin:24px auto;padding:24px;font:16px/1.6 system-ui;color:#183652;background:#fff;' }, [h('div', { style: 'background:#fff1cf;border:1px solid #d6a12b;border-radius:8px;padding:10px 16px;margin-bottom:22px;font-weight:650' }, 'SYNTHETIC TRAINING PREVIEW · Actual application components · No live API, sends, signatures or saves'), screen === 'account' ? h(FamilyWelcomeSettings, { agencyId: 450, userId: 1433, providerName: 'Avery QA' }) : screen === 'clinical' ? h(NoteAidStructuredChartPanel, { diagnoses: [], medications: { noneCurrently: false, items: [], commentsHtml: '' }, mse: {} }) : h(ProviderTransitionLearning, { initiallyOpen: true })]); } }).use(createPinia()).mount('#app');
