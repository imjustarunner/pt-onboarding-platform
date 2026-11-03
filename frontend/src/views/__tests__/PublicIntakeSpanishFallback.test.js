import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import { buildCounselingSelfEnSteps } from '../../../../backend/src/data/counselingIntakeSelfEn.js';
import { buildCounselingDependentEnSteps } from '../../../../backend/src/data/counselingIntakeDependentEn.js';
import { buildCounselingCoupleEnSteps } from '../../../../backend/src/data/counselingIntakeCoupleEn.js';
import { buildCounselingFamilyEnSteps } from '../../../../backend/src/data/counselingIntakeFamilyEn.js';

const { get, post, route } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(),
  route: { params: { publicKey: 'office-label-test' }, query: {}, path: '/intake/office-label-test' }
}));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div/>' } }));

let wrapper;
beforeEach(() => {
  route.query = {};
  sessionStorage.clear(); localStorage.clear();
  window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('CSS', { escape: value => String(value) });
  post.mockReset().mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

async function render({ questionStep, subject = 'self', locale = 'en', scope = 'agency' }) {
  const agency = { id: 2, name: 'Example Agency', slug: 'test' };
  const data = {
    link: {
      id: 1, form_type: 'intake', scope_type: scope, agency_id: 2, organization_id: 2,
      inherits_office_master: scope === 'agency' ? 1 : 0, master_channel: 'counseling',
      language_code: 'en', intake_fields: [],
      intake_steps: [questionStep, { id: 'next-page', type: 'questions', label: 'Next page', fields: [
        { key: 'next_notes', label: 'Any other notes?', type: 'textarea' }
      ] }]
    },
    agency, organization: { ...agency, organization_type: scope === 'school' ? 'school' : 'agency' }, templates: []
  };
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/office-label-test' ? data : {} }));
  wrapper = mount(PublicIntakeSigningView, { global: {
    plugins: [createPinia()],
    stubs: { DigitalFormShell: { template: '<main><slot/><slot name="footer"/></main>' }, SignaturePad: true }
  } });
  await flushPromises();
  wrapper.vm.serviceSubject = subject;
  wrapper.vm.intakeForSelf = subject === 'self';
  wrapper.vm.inPageLocale = locale;
  wrapper.vm.step = 2;
  await flushPromises();
  wrapper.vm.currentFlowIndex = wrapper.vm.flowSteps.findIndex(s => s.sourceId === questionStep.id || s.id === questionStep.id);
  await flushPromises();
  expect(wrapper.vm.currentFlowStep?.sourceId || wrapper.vm.currentFlowStep?.id).toBe(questionStep.id);
}


it('renders Spanish schema copy without a translation API response and keeps answer values', async () => {
  const questionStep = buildCounselingSelfEnSteps().find(s => s.fields?.some(f => f.key === 'main_reason_for_therapy'));
  await render({ questionStep, locale: 'es' });
  expect(wrapper.get('[data-question-key="main_reason_for_therapy"]').text()).toContain('¿Cuál es el motivo principal por el que busca terapia?');
  expect(wrapper.text()).toContain('Guardar y continuar');
  expect(wrapper.text()).not.toContain('What is the main reason you are looking for therapy?');
});
it('uses published Spanish instrument items while preserving original unsupported instruments and required responses', async () => {
  const questionStep = { id: 'screen-language', type: 'questions', label: 'About you', fields: [
    { key: 'phq9_1', instrument: 'phq9', type: 'radio', label: 'Little interest or pleasure in doing things', options: [{value:'0',label:'Not at all'},{value:'1',label:'Several days'}] },
    { key: 'asq_1', instrument: 'asq', type: 'radio', label: 'Original standardized question', helperText: 'Original instrument instructions', options: [{value:'yes',label:'Yes'},{value:'no',label:'No'}] },
    { key: 'safety_immediate_danger', type: 'radio', label: 'Are you in immediate danger?', options: [{value:'yes',label:'Yes'},{value:'no',label:'No'}] }
  ] };
  await render({ questionStep, locale: 'es' });
  const phq=wrapper.get('[data-question-key="phq9_1"]');
  expect(phq.text()).toContain('Poco interés o placer en hacer cosas');
  expect(phq.text()).toContain('Ningún día');
  await phq.findAll('button')[1].trigger('click');
  expect(wrapper.vm.questionValues.phq9_1).toBe('1');
  const asq=wrapper.get('[data-question-key="asq_1"]');
  expect(asq.text()).toContain('Original standardized question');
  expect(asq.text()).toContain('Original instrument instructions');
  expect(asq.findAll('.df-choice-btn').map(b=>b.text())).toEqual(['Yes','No']);
  expect(wrapper.get('[data-question-key="safety_immediate_danger"]').find('.df-field-required').exists()).toBe(true);
  expect(wrapper.text()).toContain('Las preguntas obligatorias aún requieren una respuesta.');
  await wrapper.vm.completeQuestionStep(); await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('screen-language');
  wrapper.vm.inPageLocale='en'; await flushPromises();
  expect(phq.text()).toContain('Little interest or pleasure in doing things');
  expect(wrapper.text()).not.toContain('Las preguntas obligatorias aún requieren una respuesta.');
});
it('localizes provider preferences and preserves stored location choices', async () => {
  await render({ questionStep: { id:'provider-test',type:'provider_match',label:'Choose a provider'}, locale:'es' });
  expect(wrapper.text()).toContain('Modalidad de las citas');
  expect(wrapper.text()).toContain('Zona horaria');
  const location=wrapper.get('#enrollment-service-location');
  expect(location.text()).toContain('Cualquiera de las ubicaciones');
  await location.setValue('Either location');
  expect(wrapper.vm.intakeResponses.submission.preferred_service_location).toBe('Either location');
});
it('localizes reminder card labels and footer without changing contact values', async () => {
  await render({ questionStep: { id:'reminder-test',type:'reminder_contacts',label:'Who should get appointment reminders?'}, locale:'es' });
  wrapper.vm.reminderContacts=[{id:'me',role:'me',label:'Me',source:'You',name:'DEMO Example',relationship:'',email:'demo@example.com',phone:'',included:true}];
  await flushPromises();
  expect(wrapper.text()).toContain('Yo');
  expect(wrapper.text()).toContain('Usted · DEMO Example');
  expect(wrapper.text()).toContain('Guardar contactos y continuar');
  expect(wrapper.vm.reminderContacts[0].email).toBe('demo@example.com');
});
