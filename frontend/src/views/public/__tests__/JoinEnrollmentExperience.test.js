import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Join from '../AdaptiveJoinView.vue';
import DigitalFormField from '../../../components/digital-form/DigitalFormField.vue';
import { i18n, setPublicLocale } from '../../../i18n';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null, isAuthenticated: false }) }));
let wrapper;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); setPublicLocale('en'); window.scrollTo=vi.fn(); });
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); setPublicLocale('en'); });
async function render(slug='itsco') {
 const config={agency:{id:2,slug,name:slug==='itsco'?'ITSCO':'Example Care'},branding:{enrollmentProduct:'auricwell',agencyName:slug==='itsco'?'ITSCO':'Example Care'},activeService:{serviceType:'counseling',displayName:'Counseling'},intakeServices:[{serviceType:'counseling'}],pathways:{quick:{enabled:true},full:{enabled:true,publicKey:'office-test'}},selfConcernOptions:[{value:'custom',label:'Published agency concern'}],copy:{}};
 api.get.mockResolvedValue({data:config});api.post.mockResolvedValue({data:{translations:{'Published agency concern':'Motivo publicado'}}});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/join/:agencySlug/:serviceType',component:Join},{path:'/intake/:publicKey',component:{template:'<div/>'}},{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});
 await router.push(`/join/${slug}/counseling`);await router.isReady();
 wrapper=mount(Join,{global:{plugins:[router],stubs:{AdaptiveJoinLanding:{template:'<button @click="$emit(\'continue\',\'quick\')">Brief</button>'},LearningEnrollmentQuestions:true}}});
 await flushPromises();await wrapper.find('button').trigger('click');await flushPromises();return router;
}
describe('Shared enrollment experience',()=>{
 it.each(['itsco','example'])('brands the brief form for %s and AuricWell without the old sidebar',async slug=>{
  await render(slug);expect(wrapper.find('.df-page--enrollment').exists()).toBe(true);expect(wrapper.find('.df-sidebar').exists()).toBe(false);
  expect(wrapper.find('.enrollment-brand').text()).toContain(slug==='itsco'?'ITSCO':'Example Care');expect(wrapper.find('.enrollment-brand').text()).toContain('AuricWell');
 });
 it('switches every brief step to Spanish without losing answers or translating private values',async()=>{
  await render();wrapper.vm.form.respondent.firstName='Private Person';wrapper.vm.form.notes='Private answer';
  await wrapper.find('button[aria-label="Español"]').trigger('click');await flushPromises();
  expect(wrapper.find('h1').text()).toBe('Vamos a conocerte.');expect(wrapper.text()).toContain('Nombre');expect(wrapper.text()).toContain('Sobre ti');
  expect(wrapper.vm.form.respondent.firstName).toBe('Private Person');expect(wrapper.vm.form.notes).toBe('Private answer');
  expect(localStorage.getItem('publicLocale')).toBe('es');expect(localStorage.getItem('preferredFormLanguage')).toBe('es');
  for(const [index,heading] of [[1,'¿Qué apoyo buscas?'],[2,'Preferencias y disponibilidad'],[4,'Permiso para contactarte'],[5,'Revisar y enviar']]){wrapper.vm.quickStep=index;await flushPromises();expect(wrapper.find('h1').text()).toBe(heading);}
  expect(wrapper.text()).toContain('Private Person');expect(wrapper.text()).toContain('Private answer');
  expect(JSON.stringify(api.post.mock.calls)).not.toMatch(/Private Person|Private answer/);
  await wrapper.find('button[aria-label="English"]').trigger('click');await flushPromises();expect(wrapper.find('h1').text()).toBe('Review & submit');expect(wrapper.vm.form.notes).toBe('Private answer');
 });
 it('honors an already selected Spanish locale on entry',async()=>{setPublicLocale('es');await render();expect(wrapper.find('h1').text()).toBe('Vamos a conocerte.');});

 it.each(['en', 'es'].flatMap(locale => ['myself', 'child', 'couple', 'family'].map(subject => [locale, subject])))(
  'labels optional basics and allows them to stay blank in %s / %s', async (locale, subject) => {
   setPublicLocale(locale); await render();
   const form = wrapper.vm.form;
   form.whoFor = subject;
   Object.assign(form.respondent, { firstName: 'Demo', lastName: 'Enrollment', email: 'office-optional@example.com', phone: '2025550123' });
   form.birthdate = '1990-01-01';
   Object.assign(form.address, { street: '123 Demo St', city: 'Denver', state: 'CO', zip: '80202' });
   if (subject === 'child') {
    Object.assign(form.client, { firstName: 'Demo', lastName: 'Child' });
    form.otherGuardian.hasLegalRights = 'no';
   }
   if (subject === 'couple') {
    Object.assign(form.partner, { firstName: 'Demo', lastName: 'Partner', dateOfBirth: '1990-02-02' });
    form.partnersSameAddress = 'no';
    Object.assign(form.partner.address, { street: '456 Demo St', city: 'Denver', state: 'CO', zip: '80202' });
   }
   if (subject === 'family') {
    Object.assign(form.familyMembers[0], { firstName: 'Demo', lastName: 'Member', dateOfBirth: '2015-01-01', relationshipToPrimary: 'Child' });
   }
   await flushPromises();
   const optionalBasics = wrapper.findAllComponents(DigitalFormField).filter(field => ['Middle name', 'Apartment, suite, or unit'].includes(field.props('label')));
   expect(optionalBasics.length).toBe(subject === 'myself' ? 2 : subject === 'couple' ? 4 : 3);
   for (const field of optionalBasics) {
    expect(field.get('.df-field-optional').text()).toBe(locale === 'es' ? 'opcional' : 'optional');
    expect(field.find('[required]').exists()).toBe(false);
    expect(field.find('input').element.value).toBe('');
   }
   expect(wrapper.text()).toContain(locale === 'es'
    ? 'Los campos marcados con * son obligatorios. Los campos marcados como opcionales pueden dejarse en blanco.'
    : 'Fields marked * are required. Fields marked optional can be left blank.');
   const continueButton = wrapper.get('.ai-join-continue');
   expect(continueButton.element.disabled).toBe(false);
   form.address.street = ''; await flushPromises();
   expect(continueButton.element.disabled).toBe(true);
   form.address.street = '123 Demo St'; await flushPromises();
   await continueButton.trigger('click'); await flushPromises();
   expect(wrapper.vm.quickStep).toBe(1);
   const goal = wrapper.findAllComponents(DigitalFormField).find(field => field.props('label') === wrapper.vm.accomplishGoalLabel);
   expect(goal.get('.df-field-optional').text()).toBe(locale === 'es' ? 'opcional' : 'optional');
  }
 );

 it.each(['en', 'es'])('labels a second dependent’s optional middle name in %s', async locale => {
  setPublicLocale(locale); await render();
  wrapper.vm.form.whoFor = 'child';
  Object.assign(wrapper.vm.form.additionalDependent, { enabled: true, firstName: 'Demo', lastName: 'Sibling', dateOfBirth: '2015-02-02' });
  wrapper.vm.quickStep = 5; await flushPromises();
  const middle = wrapper.findAllComponents(DigitalFormField).find(field => field.props('label') === 'Middle name');
  expect(middle.get('.df-field-optional').text()).toBe(locale === 'es' ? 'opcional' : 'optional');
  expect(middle.get('input').element.value).toBe('');
  expect(wrapper.vm.canContinueQuick).toBe(true);
 });
});
