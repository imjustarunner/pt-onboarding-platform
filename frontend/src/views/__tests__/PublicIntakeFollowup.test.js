import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import { buildCounselingFamilyEnSteps } from '../../../../backend/src/data/counselingIntakeFamilyEn.js';

const { get, post, route } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(),
  route: { params: { publicKey: 'office-followup-test' }, query: {}, path: '/intake/office-followup-test' }
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
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

function question(id, key, extra = {}) {
  return { id, type: 'questions', label: id, fields: [{ key, label: key, type: 'text' }], ...extra };
}

async function render(steps, { subject = 'self', locale = 'en', clients = [], startId } = {}) {
  const agency = { id: 2, name: 'Demo Agency', slug: 'demo' };
  const data = {
    link: {
      id: 1, form_type: 'intake', scope_type: 'agency', agency_id: 2, organization_id: 2,
      inherits_office_master: 1, master_channel: 'counseling', language_code: 'en',
      intake_fields: [], intake_steps: steps
    },
    agency, organization: { ...agency, organization_type: 'agency' }, templates: []
  };
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/office-followup-test' ? data : {} }));
  wrapper = mount(PublicIntakeSigningView, { attachTo: document.body, global: {
    plugins: [createPinia()],
    stubs: { DigitalFormShell: { template: '<main><slot/></main>' }, SignaturePad: true }
  } });
  await flushPromises();
  wrapper.vm.serviceSubject = subject;
  wrapper.vm.intakeForSelf = subject === 'self';
  wrapper.vm.inPageLocale = locale;
  if (clients.length) {
    wrapper.vm.clients = clients;
    wrapper.vm.intakeResponses.clients = clients.map(() => ({}));
  }
  wrapper.vm.step = 2;
  await flushPromises();
  if (startId) {
    const index = wrapper.vm.flowSteps.findIndex(step => step.id === startId);
    expect(index).toBeGreaterThanOrEqual(0);
    wrapper.vm.currentFlowIndex = index;
    await flushPromises();
  }
}

it.each(['en', 'es'])('Skip Now reaches required safety in %s without completing it', async locale => {
  await render([
    question('identity', 'legal_first_name'),
    question('optional-goals', 'goals'),
    question('optional-history', 'history'),
    question('safety', 'safety_immediate_danger'),
    { id: 'communications', type: 'communications', label: 'Communications' },
    question('last-required', 'email_address')
  ], { locale, startId: 'optional-history' });
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.officeSkipSplashOpen).toBe(true);
  await wrapper.vm.onOfficeSkipNow();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  expect(wrapper.vm.intakeResponses.submission.safety_immediate_danger).toBeUndefined();
  expect(wrapper.vm.flowSteps.map(step => step.id)).toContain('communications');
  const communicationsProgress = wrapper.vm.dfProgressSteps.findIndex(step => step.id === 'communications');
  expect(communicationsProgress).toBeGreaterThan(wrapper.vm.dfProgressIndex);
  wrapper.vm.jumpToProgressStep(communicationsProgress);
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  expect(wrapper.vm.missingRequiredQuestionKeys).toContain('safety_immediate_danger');
  expect(wrapper.get('[data-question-key="safety_immediate_danger"] .df-field-required').exists()).toBe(true);
  expect(post.mock.calls.some(([url]) => /finalize|\/sign/.test(url))).toBe(false);
  wrapper.vm.questionValues.safety_immediate_danger = 'no';
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('communications');
});

it('keeps child safety when Skip Now drops optional questionnaires', async () => {
  await render([
    question('about', 'child_legal_first', { audience: 'dependent' }),
    { id: 'counseling_dep_safety', type: 'questions', label: 'Safety', audience: 'dependent', fields: [
      { key: 'asq_wish_dead', label: 'Have you wished you were dead?', type: 'radio', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }
    ] },
    { id: 'questionnaires', type: 'clinical_questions', label: 'Questionnaires', audience: 'dependent', fields: [
      { key: 'psc_1', label: 'PSC', type: 'radio', instrument: 'psc17' }
    ] }
  ], { subject: 'dependent' });
  const about = wrapper.vm.flowSteps.findIndex(step => String(step.id).startsWith('about'));
  expect(about).toBeGreaterThanOrEqual(0);
  wrapper.vm.currentFlowIndex = about;
  await flushPromises();
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  await wrapper.vm.onOfficeSkipNow();
  await flushPromises();
  const ids = wrapper.vm.flowSteps.map(step => step.id);
  expect(ids.some(id => String(id).includes('safety'))).toBe(true);
  expect(ids.some(id => String(id).includes('questionnaire'))).toBe(false);
  expect(wrapper.vm.flowSteps.find(step => String(step.id).includes('safety')).fields.some(field => field.key === 'asq_wish_dead')).toBe(true);
});

it('copies the family opening contact onto Primary Contact', async () => {
  const contact = buildCounselingFamilyEnSteps().find(step => step.id === 'counseling_family_primary_contact');
  await render([contact], { subject: 'family', startId: 'counseling_family_primary_contact' });
  Object.assign(wrapper.vm, {
    guardianFirstName: 'Demo', guardianLastName: 'Parent', guardianEmail: 'demo@example.com',
    guardianPhone: '2025550100', starterDob: '1984-05-20', serviceSubject: 'family', intakeForSelf: false
  });
  await wrapper.vm.applyStarterDataAndContinue();
  await flushPromises();
  expect(wrapper.vm.intakeResponses.guardian).toMatchObject({
    pc_legal_first: 'Demo', pc_legal_last: 'Parent', pc_email: 'demo@example.com',
    pc_phone: '2025550100', pc_date_of_birth: '1984-05-20'
  });
});

it('names the missing last name, focuses it and translates an existing error on a language switch', async () => {
  await render([question('identity', 'legal_first_name')]);
  wrapper.vm.step = 0.5;
  Object.assign(wrapper.vm, { guardianFirstName: 'Demo', guardianLastName: '', guardianEmail: 'demo@example.com', guardianPhone: '2025550123', starterDob: '1990-01-01' });
  await flushPromises();
  post.mockClear();
  await wrapper.get('.intake-start-continue').trigger('click'); await flushPromises();
  expect(wrapper.get('.intake-start-validation').text()).toContain('Your last name');
  expect(document.activeElement.id).toBe('guardianLastName');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  await wrapper.vm.switchLinkedLanguage('es'); await flushPromises();
  expect(wrapper.get('.intake-start-validation').text()).toContain('Su apellido');
  expect(wrapper.get('.intake-start-validation').text()).toContain('Por favor complete todos los campos requeridos');
  expect(wrapper.get('.intake-start-validation').text()).not.toContain('Required Fields');
  expect(post.mock.calls.some(([url]) => /session|begin|finalize/.test(url))).toBe(false);
});

it.each(['en', 'es'])('focuses a missing dependent birth date before custody and keeps route participants separate in %s', async locale => {
  await render([question('identity', 'legal_first_name')], { locale });
  wrapper.vm.step = 0.5;
  Object.assign(wrapper.vm, { guardianFirstName: 'Demo', guardianLastName: 'Parent', guardianEmail: 'demo@example.com', guardianPhone: '2025550123', starterDob: '1990-01-01' });
  wrapper.vm.chooseServiceSubject('couple'); await flushPromises();
  expect(wrapper.vm.clients[0].firstName).toBe('Demo');
  wrapper.vm.chooseServiceSubject('family'); await flushPromises();
  expect(wrapper.vm.clients[0].firstName).toBe('');
  expect(wrapper.vm.clients[0].dateOfBirth).toBe('');
  Object.assign(wrapper.vm.clients[0], { firstName: 'Family', lastName: 'Member', dateOfBirth: '1995-01-01' });
  wrapper.vm.chooseServiceSubject('dependent'); await flushPromises();
  expect(wrapper.vm.clients[0].firstName).toBe('');
  Object.assign(wrapper.vm.clients[0], { firstName: 'Demo', lastName: 'Child', dateOfBirth: '' });
  wrapper.vm.guardianRelationship = 'Mother';
  await wrapper.get('.intake-start-continue').trigger('click'); await flushPromises();
  expect(document.activeElement.id).toBe('clientDob_0');
  wrapper.vm.chooseServiceSubject('family'); await flushPromises();
  expect(wrapper.vm.clients[0].firstName).toBe('Family');
  expect(wrapper.vm.clients[0].dateOfBirth).toBe('1995-01-01');
});

it('does not seed clinical answers from a retained legacy schema and preserves deliberate answers', async () => {
  const legacy = question('legacy-history', 'life_work_school', { fields: [
    { key: 'life_work_school', label: 'Work or school', type: 'radio', defaultValue: 'going_well', options: [
      { value: 'going_well', label: 'Going well' }, { value: 'difficulty', label: 'Some difficulty' }
    ] },
    { key: 'history', label: 'History', type: 'checkbox_group', defaultValue: ['none'], options: [
      { value: 'none', label: 'Deny all' }, { value: 'prior_help', label: 'Prior support' }
    ] }
  ] });
  await render([legacy, question('next', 'next_notes')], { startId: 'legacy-history' });
  expect(wrapper.vm.questionValues.life_work_school).toBeUndefined();
  expect(wrapper.vm.questionValues.history).toBeUndefined();
  expect(wrapper.findAll('.df-choice-btn--selected')).toHaveLength(0);
  wrapper.vm.questionValues.life_work_school = 'difficulty';
  wrapper.vm.questionValues.history = ['prior_help'];
  wrapper.vm.currentFlowIndex = 1; await flushPromises();
  wrapper.vm.currentFlowIndex = 0; await flushPromises();
  expect(wrapper.vm.questionValues.life_work_school).toBe('difficulty');
  expect(wrapper.vm.questionValues.history).toEqual(['prior_help']);
});

it('restores a saved couple subject without replacing it with the dependent audience', async () => {
  await render([
    question('couple-relationship', 'main_reason_couples', { audience: 'couple' }),
    question('dependent-history', 'child_history', { audience: 'dependent' }),
    question('shared-last', 'email_address')
  ]);
  wrapper.vm.serviceSubject = '';
  wrapper.vm.applyDraftSnapshot({
    step: 2, currentFlowIndex: 0, intakeForSelf: false,
    clients: [
      { firstName: 'Alex', lastName: 'Demo', dateOfBirth: '1990-01-01' },
      { firstName: 'Jordan', lastName: 'Demo', dateOfBirth: '1991-01-01' }
    ],
    intakeResponses: { submission: { serviceSubject: 'couple' }, guardian: {}, clients: [{}, {}] }
  });
  await flushPromises();
  expect(wrapper.vm.serviceSubject).toBe('couple');
  expect(wrapper.vm.currentFlowStep.id).toBe('couple-relationship');
  expect(wrapper.vm.flowSteps.some(step => step.audience === 'dependent')).toBe(false);
  expect(wrapper.vm.intakeResponses.submission.serviceSubject).toBe('couple');
});

it.each(['en', 'es'])('resolves family member names and uses member wording in %s', async locale => {
  const memberStep = buildCounselingFamilyEnSteps().find(step => step.id === 'counseling_family_member_mini');
  await render([memberStep, question('shared-last', 'email_address')], {
    subject: 'family', locale,
    clients: [
      { firstName: 'Alex', lastName: 'Demo', dateOfBirth: '1990-01-01' },
      { firstName: 'Jordan', lastName: 'Demo', dateOfBirth: '1991-01-01' }
    ],
    startId: 'counseling_family_member_mini__c1'
  });
  expect(wrapper.get('.ai-page-title').text()).toContain('Jordan');
  expect(wrapper.text()).not.toContain('{memberName}');
  const banner = wrapper.get('.intake-child-banner').text();
  expect(banner).toContain('Jordan');
  expect(banner).toMatch(locale === 'es' ? /miembro/i : /member/i);
  expect(banner).not.toMatch(/\bchild\b|\bniño\b/i);
});

it.each(['en', 'es'])('shows an adult couple starter in %s without guardian/custody controls', async locale => {
  await render([question('couple-relationship', 'main_reason_couples', { audience: 'couple' })], { locale });
  wrapper.vm.step = 0.5;
  wrapper.vm.chooseServiceSubject('couple');
  await flushPromises();
  expect(wrapper.get('#starterDob').isVisible()).toBe(true);
  expect(wrapper.get('#clientFirstName_1').isVisible()).toBe(true);
  expect(wrapper.get('#clientDob_1').isVisible()).toBe(true);
  expect(wrapper.get('#clientFirstName_0').isVisible()).toBe(false);
  expect(wrapper.find('#guardianRelationship').exists()).toBe(false);
  expect(wrapper.find('.intake-start-custody').exists()).toBe(false);
  const partner = wrapper.get('.intake-start-dependents');
  expect(partner.text()).toContain(locale === 'es' ? 'pareja' : 'partner');
  expect(partner.text()).not.toMatch(/dependent|dependiente|custody|custodia/i);
  expect(partner.find('.intake-add-dependent').exists()).toBe(false);
});

it('rechecks mandatory safety before final submission even when a later page is selected', async () => {
  await render([
    question('safety', 'safety_immediate_danger'),
    question('later-page', 'later_notes')
  ], { startId: 'later-page' });
  await wrapper.vm.finalizePacket();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  expect(wrapper.vm.step).toBe(2);
  expect(wrapper.vm.stepError).not.toBe('');
  expect(post.mock.calls.some(([url]) => /\/finalize/.test(url))).toBe(false);
});

it.each(['en', 'es'])('continues a saved family starter and adds members without a hidden dependent dialog in %s', async locale => {
  await render([question('family-details', 'family_notes', { audience: 'family' })], { locale });
  wrapper.vm.step = 0.5;
  wrapper.vm.chooseServiceSubject('family');
  Object.assign(wrapper.vm, { guardianFirstName: 'Demo', guardianLastName: 'Parent', guardianEmail: 'demo@example.com', guardianPhone: '2025550123', starterDob: '1990-01-01', sessionToken: 'mock-saved-family', multiClientPlanChoice: 'multiple', reminderConsentStatus: 'declined' });
  Object.assign(wrapper.vm.clients[0], { firstName: 'Demo', lastName: 'Child', dateOfBirth: '2015-03-10' });
  await flushPromises();
  await wrapper.get('.intake-add-dependent').trigger('click');
  expect(wrapper.vm.clients).toHaveLength(2);
  expect(wrapper.vm.multiClientConsentDialogOpen).toBe(false);
  Object.assign(wrapper.vm.clients[1], { firstName: 'Demo', lastName: 'Sibling', dateOfBirth: '2017-03-10' });
  await wrapper.get('.intake-start-continue').trigger('click');
  await flushPromises();
  expect(wrapper.vm.step).toBe(2);
  expect(post.mock.calls.some(([url]) => url.endsWith('/consent'))).toBe(true);
  expect(wrapper.vm.multiClientConsentDialogOpen).toBe(false);
});

it.each(['couple', 'family'])('keeps the separate-adult consent stop before a %s can save consent', async subject => {
  await render([question('shared-details', 'shared_notes', { audience: subject })]);
  wrapper.vm.step = 0.5;
  wrapper.vm.chooseServiceSubject(subject);
  Object.assign(wrapper.vm, { guardianFirstName: 'Demo', guardianLastName: 'Partner', starterDob: '1990-01-01', sessionToken: 'mock-couple' });
  Object.assign(wrapper.vm.clients[subject === 'couple' ? 1 : 0], { firstName: 'Demo', lastName: 'Other', dateOfBirth: '1988-02-20' });
  await flushPromises();
  await wrapper.get('.intake-start-continue').trigger('click');
  await flushPromises();
  expect(wrapper.vm.step).toBe(0.5);
  expect(wrapper.text()).toContain('Each adult must provide their own consent');
  expect(post.mock.calls.some(([url]) => url.endsWith('/consent'))).toBe(false);
});

it('starts reminder contacts unchecked and restores only explicitly saved selections', async () => {
  await render([{ id: 'reminders', type: 'reminder_contacts', label: 'Reminder contacts' }], { subject: 'dependent', locale: 'es' });
  wrapper.vm.guardianRelationship = 'Mother';
  wrapper.vm.intakeResponses.guardian.emergency_contact_name = 'Demo Emergency';
  wrapper.vm.intakeResponses.guardian.emergency_contact_phone = '2025550199';
  wrapper.vm.seedReminderContacts();
  await flushPromises();
  expect(wrapper.findAll('.reminder-include input')).toHaveLength(2);
  expect(wrapper.findAll('.reminder-include input').every(input => !input.element.checked)).toBe(true);
  expect(wrapper.get('.reminder-contact-fields label:nth-child(2) input').element.value).toBe('Madre');
  expect(wrapper.vm.reminderContacts[0].relationship).toBe('Mother');
  wrapper.vm.intakeResponses.submission.appointment_reminder_contacts = wrapper.vm.reminderContacts.map(contact => ({ ...contact, included: contact.role === 'me' }));
  wrapper.vm.seedReminderContacts();
  await flushPromises();
  expect(wrapper.findAll('.reminder-include input').map(input => input.element.checked)).toEqual([true, false]);
});

it('names and links missing interview fields in the current language', async () => {
  await render([{ id: 'identity', type: 'questions', label: 'About You', fields: [
    { key: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
    { key: 'address_street', label: 'Street address', type: 'text', required: true }
  ] }]);
  await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
  expect(wrapper.findAll('.validation-field-link').map(button => button.text())).toEqual(['Date of birth', 'Street address']);
  await wrapper.findAll('.validation-field-link')[1].trigger('click');
  expect(document.activeElement.closest('[data-question-key]').dataset.questionKey).toBe('address_street');
  await wrapper.vm.switchLinkedLanguage('es'); await flushPromises();
  expect(wrapper.findAll('.validation-field-link').map(button => button.text())).toEqual(['Fecha de nacimiento', 'Dirección de la calle']);
  expect(post.mock.calls.some(([url]) => /finalize|\/sign/.test(url))).toBe(false);
});

it('starts an adult representative with the client DOB and no hidden self DOB', async () => {
  await render([question('identity', 'legal_first_name')], { subject: 'representative', clients: [{ firstName: 'Alex', lastName: 'Example', dateOfBirth: '1980-02-15' }] });
  Object.assign(wrapper.vm, { step: 0.5, reminderConsentStatus: 'declined', sessionToken: 'representative-session', submissionId: 100, guardianFirstName: 'Pat', guardianLastName: 'Example', guardianEmail: 'pat@example.com', guardianPhone: '2025550123', guardianRelationship: 'Power of attorney', starterDob: '' });
  await flushPromises();
  await wrapper.get('.intake-start-continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.consentErrors.starterDob).toBe('');
  expect(wrapper.vm.startClientErrors[0].dob).toBe('');
  expect(wrapper.vm.whoForError).toBe('');
  expect(wrapper.vm.step).not.toBe(0.5);
});

it('keeps unsent communication choices in server progress without recording a signed consent', async () => {
  await render([{ id: 'communications', type: 'communications' }]);
  wrapper.vm.sessionToken = 'synthetic-progress-session';
  Object.assign(wrapper.vm.communications, { emailPreference: 'no', smsPreference: 'no', signerName: 'Pat Example', alternativeContactInstructions: 'Use alternate contact only', signatureAccepted: true });
  await flushPromises();
  const snapshot = JSON.parse(JSON.stringify(wrapper.vm.buildDraftSnapshot()));
  expect(snapshot.intakeResponses.submission.communicationDraft).toMatchObject({ emailPreference: 'no', signerName: 'Pat Example', alternativeContactInstructions: 'Use alternate contact only' });
  expect(snapshot.intakeResponses.submission.communicationPreferences).toBeUndefined();
  await wrapper.vm.saveServerProgress();
  expect(post).toHaveBeenCalledWith(expect.stringContaining('/progress'), expect.objectContaining({ intakeData: expect.objectContaining({ progressSnapshot: expect.objectContaining({ intakeResponses: snapshot.intakeResponses }) }) }), expect.anything());
  wrapper.unmount(); wrapper = null;
  await render([{ id: 'communications', type: 'communications' }]);
  wrapper.vm.applyDraftSnapshot(snapshot);
  // Simulate re-entering the restored step after the async server response.
  wrapper.vm.currentFlowIndex = -1; await flushPromises(); wrapper.vm.currentFlowIndex = 0; await flushPromises();
  expect(wrapper.vm.communications).toMatchObject({ emailPreference: 'no', smsPreference: 'no', signerName: 'Pat Example', alternativeContactInstructions: 'Use alternate contact only' });
});
