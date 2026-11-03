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
async function render(slug='itsco', overrides={}) {
 const config={agency:{id:2,slug,name:slug==='itsco'?'ITSCO':'Example Care'},branding:{enrollmentProduct:'auricwell',agencyName:slug==='itsco'?'ITSCO':'Example Care'},activeService:{serviceType:'counseling',displayName:'Counseling'},intakeServices:[{serviceType:'counseling'}],pathways:{quick:{enabled:true},full:{enabled:true,publicKey:'office-test'}},selfConcernOptions:[{value:'custom',label:'Published agency concern'}],copy:{},...overrides};
 api.get.mockResolvedValue({data:config});api.post.mockResolvedValue({data:{translations:{'Published agency concern':'Motivo publicado'}}});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/join/:agencySlug/:serviceType',component:Join},{path:'/intake/:publicKey',component:{template:'<div/>'}},{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});
 await router.push(`/join/${slug}/counseling`);await router.isReady();
 wrapper=mount(Join,{global:{plugins:[router],stubs:{AdaptiveJoinLanding:{template:'<button @click="$emit(\'continue\',\'quick\')">Brief</button>'},LearningEnrollmentQuestions:true}}});
 await flushPromises();await wrapper.find('button').trigger('click');await flushPromises();return router;
}
describe('Shared enrollment experience',()=>{
 it.each(['en', 'es'])('starts couple and family questions unanswered in %s and preserves explicit choices', async locale => {
  setPublicLocale(locale); await render();
  const form = wrapper.vm.form;
  wrapper.vm.chooseWhoFor('couple'); await flushPromises();
  expect(form.notifyPartner).toBe(''); expect(form.partnersSameAddress).toBe('');
  expect(wrapper.findAll('select').map(select => select.element.value)).toEqual(['', '']);
  expect(wrapper.vm.basicsIssues.map(issue => issue.key)).toEqual(expect.arrayContaining(['notifyPartner', 'partnersSameAddress']));
  form.notifyPartner = 'not_yet'; form.partnersSameAddress = 'yes';
  wrapper.vm.chooseWhoFor('family'); await flushPromises();
  expect(form.familyRole).toBe(''); expect(form.sameHousehold).toBe('');
  expect(form.familyMembers[0].participationStatus).toBe('');
  wrapper.vm.addFamilyMember();
  expect(form.familyMembers[1].participationStatus).toBe('');
  expect(wrapper.vm.basicsIssues.map(issue => issue.key)).toContain('sameHousehold');
  wrapper.vm.chooseWhoFor('couple'); await flushPromises();
  expect(form.notifyPartner).toBe('not_yet'); expect(form.partnersSameAddress).toBe('yes');
 });

 it('shows the dependent birth date beside dependent names and only advances locally on the first Continue', async () => {
  await render();
  wrapper.vm.chooseWhoFor('child'); await flushPromises();
  const dateField = wrapper.findAllComponents(DigitalFormField).find(field => field.props('type') === 'date');
  expect(dateField.element.closest('section').textContent).toContain('Dependent information');
  const form = wrapper.vm.form;
  Object.assign(form.respondent, { firstName: 'Demo', lastName: 'Parent', email: 'demo@example.com', phone: '2025550123' });
  Object.assign(form.client, { firstName: 'Demo', lastName: 'Child' });
  form.birthdate = '2015-01-01'; form.otherGuardian.hasLegalRights = 'no';
  Object.assign(form.address, { street: '123 Demo St', city: 'Denver', state: 'CO', zip: '80202' });
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(1);
  expect(api.post.mock.calls.some(([url]) => /\/quick|draft|session|submission/.test(url))).toBe(false);
 });
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
    form.notifyPartner = 'not_yet';
    Object.assign(form.partner.address, { street: '456 Demo St', city: 'Denver', state: 'CO', zip: '80202' });
   }
   if (subject === 'family') {
    form.familyRole = 'parent';
    form.sameHousehold = 'yes';
    Object.assign(form.familyMembers[0], { firstName: 'Demo', lastName: 'Member', dateOfBirth: '2015-01-01', relationshipToPrimary: 'Child' });
   }
   await flushPromises();
   if (subject === 'child') {
    expect(wrapper.get('.ogi-rights .df-field-required').text()).toBe('*');
    expect(wrapper.get('.ogi-rights select').attributes('required')).toBeDefined();
   }
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
   expect(continueButton.element.disabled).toBe(false);
   await continueButton.trigger('click'); await flushPromises();
   expect(wrapper.vm.quickStep).toBe(0);
   expect(wrapper.get('.ai-join-validation').text()).toContain(locale === 'es' ? 'La dirección de la calle es obligatoria.' : 'Street address is required.');
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

 it.each(['en', 'es'])('shows actionable %s errors and advances page 3 with valid matching essentials', async locale => {
  setPublicLocale(locale); await render('itsco', { exchangeEssentialsRequired: true });
  const form = wrapper.vm.form;
  Object.assign(form.respondent, { firstName: 'Demo', lastName: '', email: 'interest-form@example.com', phone: '2025550123' });
  form.birthdate = '1990-01-01';
  Object.assign(form.address, { street: '123 Demo St', city: 'Denver', state: 'CO', zip: '80202' });
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(0);
  expect(wrapper.get('[role="alert"]').text()).toContain(locale === 'es' ? 'El apellido es obligatorio.' : 'Last name is required.');
  form.respondent.lastName = 'Example';
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(1);
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(1);
  expect(wrapper.get('.ai-join-validation').text()).toContain(locale === 'es' ? 'Seleccione al menos un motivo' : 'Select at least one concern');
  await wrapper.get('.ai-concern-chip').trigger('click');
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(2);
  const modality = wrapper.findAllComponents(DigitalFormField).find(field => field.props('label') === 'Preferred format');
  expect(modality.props('required')).toBe(true);
  expect(modality.get('select').element.value).toBe('');
  expect(modality.get('option[value=""]').text()).toBe(locale === 'es' ? 'Seleccionar…' : 'Select…');
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(2);
  expect(wrapper.get('.ai-join-validation').text()).toContain(locale === 'es' ? 'Elija una modalidad preferida.' : 'Choose a preferred format.');
  expect(wrapper.get('[data-exchange-field="days"]').attributes('aria-invalid')).toBe('true');
  expect(wrapper.get('[data-exchange-field="times"]').attributes('aria-invalid')).toBe('true');
  await modality.get('select').setValue('either');
  const payer = wrapper.findAllComponents(DigitalFormField).find(field => field.props('label') === 'Insurance plan or self-pay');
  expect(payer.props('required')).toBe(true);
  await payer.get('input').setValue('Self-pay');
  await wrapper.get('[data-exchange-field="days"] label:nth-child(3) input').setValue(true);
  await wrapper.get('[data-exchange-field="times"] label:nth-child(2) input').setValue(true);
  expect(form.preferences.exchangeSchedule).toMatchObject({ days: ['Wednesday'], periods: ['afternoon'] });
  if (locale === 'es') {
   expect(wrapper.get('.client-schedule').text()).toContain('Miércoles');
   expect(wrapper.get('.client-schedule').text()).toContain('Zona horaria');
   expect(wrapper.get('.client-schedule').text()).not.toContain('When does the client');
   expect(wrapper.get('.client-schedule').text()).not.toContain('Required. Choose');
   expect(payer.text()).toContain('Plan de seguro o pago por cuenta propia');
  }
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(4);
  expect(wrapper.find('.ai-join-validation').exists()).toBe(false);
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(4);
  expect(wrapper.get('.ai-join-validation').text()).toContain(locale === 'es' ? 'autorización de contacto' : 'contact authorization');
  await wrapper.get('.ai-consent-check input').setValue(true);
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(5);
  api.post.mockResolvedValue({ data: { confirmation: { reference: 'DEMO-TEST' } } });
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.submitted).toBe(true);
  const submission = api.post.mock.calls.find(([url]) => url.endsWith('/quick'));
  expect(submission).toBeTruthy();
  expect(submission[1].respondent.email).toBe('interest-form@example.com');
  expect(submission[1].preferences.exchangeSchedule).toMatchObject({ days: ['Wednesday'], periods: ['afternoon'] });
  expect(api.get.mock.calls.some(([url]) => url.includes('/choose-providers'))).toBe(false);
 });

 it('retranslates visible validation while retaining preferences and rejects an incomplete specific-time row', async () => {
  await render('itsco', { exchangeEssentialsRequired: true });
  wrapper.vm.quickStep = 2;
  Object.assign(wrapper.vm.form.preferences, { preferredModality: 'virtual', insuranceOrPayment: 'Self-pay', exchangeSchedule: { days: [], periods: [], windows: [{ day: 'Wednesday', start: '', end: '' }], timezone: 'America/Denver' } });
  wrapper.vm.form.accomplishGoal = 'Demo support goal';
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(2);
  expect(wrapper.get('.ai-join-validation').text()).toContain('Enter a start time');
  setPublicLocale('es'); await flushPromises();
  expect(wrapper.get('.ai-join-validation').text()).toContain('Ingrese una hora de inicio');
  expect(wrapper.get('.ai-join-validation').text()).not.toContain('Enter a start time');
  expect(wrapper.vm.form.preferences.insuranceOrPayment).toBe('Self-pay');
  expect(wrapper.vm.form.accomplishGoal).toBe('Demo support goal');
  await wrapper.get('.time-row input[type="time"]').setValue('15:30');
  await wrapper.get('.ai-join-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.quickStep).toBe(4);
 });

 it('carries the selected language to full enrollment', async () => {
  const router = await render();
  setPublicLocale('es');
  await wrapper.vm.onPathwayContinue('full'); await flushPromises();
  expect(router.currentRoute.value.path).toBe('/intake/office-test');
  expect(router.currentRoute.value.query.lang).toBe('es');
 });
});
