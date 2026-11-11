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
    stubs: { DigitalFormShell: { template: '<main><slot/></main>' }, SignaturePad: true }
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

it.each([
  ['self', buildCounselingSelfEnSteps, 'main_reason_for_therapy'],
  ['dependent', buildCounselingDependentEnSteps, 'main_reason_and_concerns'],
  ['couple', buildCounselingCoupleEnSteps, 'main_reason_couples'],
  ['family', buildCounselingFamilyEnSteps, 'main_reason_family']
])('labels optional questions from the actual %s office schema without optional metadata', async (subject, buildSteps, key) => {
  const questionStep = buildSteps().find(s => s.fields?.some(f => f.key === key));
  const field = questionStep.fields.find(f => f.key === key);
  expect(field.optional).toBeUndefined();
  expect(field.helperText.toLowerCase()).not.toBe('optional');
  await render({ questionStep, subject });
  const question = wrapper.get(`[data-question-key="${key}"]`);
  expect(question.get('.df-field-optional').text()).toBe('optional');
  expect(question.find('.df-field-required').exists()).toBe(false);
  expect(question.get('textarea').attributes('required')).toBeUndefined();
});

const mixedStep = () => ({
  id: 'mixed-office-questions', type: 'questions', label: 'About you', fields: [
    { key: 'legal_first_name', label: 'Legal first name', type: 'text' },
    { key: 'phone_number', label: 'Phone number', type: 'tel' },
    { key: 'address_street', label: 'Street address', type: 'text' },
    { key: 'sex', label: 'Sex', type: 'radio', options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }] },
    { key: 'safety_immediate_danger', label: 'Immediate danger?', type: 'radio', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    { key: 'main_reason_for_therapy', label: 'What would you like help with?', type: 'textarea' },
    { key: 'want_to_share_more', label: 'Would you like to share more?', type: 'radio', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    { key: 'more_context', label: 'More context', type: 'textarea', showIf: { fieldKey: 'want_to_share_more', equals: 'yes' } }
  ]
});

it.each(['en', 'es'])('matches %s labels to validation and allows blank optional answers after required answers', async locale => {
  await render({ questionStep: mixedStep(), locale });
  const expectedOptional = locale === 'es' ? 'opcional' : 'optional';
  const guide = wrapper.get('.office-field-guide').text();
  expect(guide).toContain(locale === 'es' ? 'Los campos marcados con * son obligatorios.' : 'Fields marked * are required.');
  expect(guide).toContain(locale === 'es' ? 'en blanco' : 'left blank');
  const requiredAnswers = {
    legal_first_name: 'Demo', phone_number: '202-555-0142', address_street: '123 Demo Street',
    sex: 'female', safety_immediate_danger: 'no'
  };
  for (const key of Object.keys(requiredAnswers)) {
    const question = wrapper.get(`[data-question-key="${key}"]`);
    expect(question.find('.df-field-required').exists()).toBe(true);
    expect(question.find('.df-field-optional').exists()).toBe(false);
  }
  expect(wrapper.get('[data-question-key="main_reason_for_therapy"] .df-field-optional').text()).toBe(expectedOptional);
  expect(wrapper.get('[data-question-key="want_to_share_more"] .df-field-optional').text()).toBe(expectedOptional);

  // Every field enforced by the office validator must remain blocking, even
  // when its backend definition omitted required or optional metadata.
  for (const missingKey of Object.keys(requiredAnswers)) {
    Object.assign(wrapper.vm.questionValues, requiredAnswers, { [missingKey]: '' });
    await wrapper.vm.handleCurrentFlowContinue();
    await flushPromises();
    expect(wrapper.vm.currentFlowStep.id).toBe('mixed-office-questions');
    expect(wrapper.vm.missingRequiredQuestionKeys).toContain(missingKey);
    expect(wrapper.get(`[data-question-key="${missingKey}"]`).classes()).toContain('required-missing-glow');
  }

  Object.assign(wrapper.vm.questionValues, requiredAnswers);
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.officeSkipSplashOpen).toBe(true);
  expect(wrapper.vm.stepError).toBe('');
  await wrapper.vm.onOfficeSkipContinueNormal();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('next-page');
  expect(wrapper.vm.intakeResponses.submission.main_reason_for_therapy || '').toBe('');
});

it('labels conditional follow-ups and preserves answers when the language changes', async () => {
  await render({ questionStep: mixedStep() });
  expect(wrapper.find('[data-question-key="more_context"]').exists()).toBe(false);
  const choice = wrapper.get('[data-question-key="want_to_share_more"]');
  await choice.findAll('button').find(button => button.text() === 'Yes').trigger('click');
  await flushPromises();
  const followup = wrapper.get('[data-question-key="more_context"]');
  expect(followup.get('.df-field-optional').text()).toBe('optional');
  await followup.get('textarea').setValue('Demo answer retained across languages');
  wrapper.vm.inPageLocale = 'es';
  await flushPromises();
  expect(followup.get('.df-field-optional').text()).toBe('opcional');
  expect(followup.get('textarea').element.value).toBe('Demo answer retained across languages');
});

it('does not add automatic optional labels or the office guide to school questions', async () => {
  await render({ scope: 'school', questionStep: { id: 'school-question', type: 'questions', label: 'School questions', fields: [
    { key: 'school_notes', label: 'Anything else?', type: 'textarea', required: false },
    { key: 'school_required', label: 'Required school answer', type: 'text', required: true }
  ] } });
  expect(wrapper.find('.office-field-guide').exists()).toBe(false);
  expect(wrapper.get('[data-question-key="school_notes"]').find('.df-field-optional').exists()).toBe(false);
  expect(wrapper.get('[data-question-key="school_required"]').find('.df-field-required').exists()).toBe(true);
});

it.each(['en', 'es'])('labels the separate %s demographics step according to its own DOB-only validation', async locale => {
  await render({ locale, questionStep: {
    id: 'demographic-details', type: 'demographics', label: 'Demographics',
    showDob: true, showGender: true, showEthnicity: true, showPreferredLanguage: true, showAddress: true
  } });
  const page = wrapper.get('.demographics-step');
  expect(page.findAll('.required-indicator')).toHaveLength(1);
  expect(page.findAll('.optional-indicator')).toHaveLength(7);
  for (const badge of page.findAll('.optional-indicator')) expect(badge.text()).toBe(locale === 'es' ? 'Opcional' : 'Optional');
  await wrapper.vm.handleCurrentFlowContinue();
  expect(wrapper.vm.currentFlowStep.id).toBe('demographic-details');
  expect(wrapper.vm.demographicsErrors.dob).toBe(true);
  await page.get('input.birth-date-input').setValue('01/01/1990');
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('next-page');
  expect(wrapper.vm.intakeResponses.submission.demographicsInfo).toMatchObject({ dob: '1990-01-01', gender: null, addressStreet: null });
});

it.each(['en', 'es'])('labels the %s family roster and allows optional member details to remain empty', async locale => {
  await render({ locale, subject: 'family', questionStep: { id: 'roster', type: 'family_roster', label: 'Family members' } });
  const page = wrapper.get('.family-roster-step');
  expect(page.findAll('.required-indicator')).toHaveLength(3);
  expect(page.findAll('.optional-indicator')).toHaveLength(5);
  for (const badge of page.findAll('.optional-indicator')) expect(badge.text()).toBe(locale === 'es' ? 'Opcional' : 'Optional');
  await wrapper.vm.handleCurrentFlowContinue();
  expect(wrapper.vm.currentFlowStep.id).toBe('roster');
  expect(wrapper.vm.stepError).not.toBe('');
  Object.assign(wrapper.vm.familyRosterMembers[0], { firstName: 'Demo', lastName: 'Example', dateOfBirth: '1990-01-01' });
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('next-page');
  expect(wrapper.vm.intakeResponses.clients[0]).toMatchObject({ member_legal_first: 'Demo', member_preferred_name: '', member_sex: '', member_relationship_to_primary: '' });
});
