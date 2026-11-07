import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import CombinedInsurance from '../../components/public-intake/PublicIntakeInsurancePaymentStep.vue';
import SchoolInsurance from '../../components/public-intake/PublicIntakeInsuranceStep.vue';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { publicKey: 'insurance-continue' }, query: {}, path: '/intake/insurance-continue' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() })
}));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div />' } }));

let wrapper;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  post.mockReset().mockResolvedValue({ data: {} });
});
afterEach(() => wrapper?.unmount());

async function render({ school = false, insuranceInfo = {} } = {}) {
  const scope = school ? 'school' : 'agency';
  const data = {
    link: { id: 1, form_type: 'intake', scope_type: scope, organization_id: 2, agency_id: 1,
      inherits_office_master: school ? 0 : 1, master_channel: 'counseling', intake_fields: [],
      intake_steps: [
        { id: 'insurance', type: 'insurance_info', paymentRequired: false },
        { id: 'communications', type: 'communications' }
      ] },
    organization: { id: 2, name: 'Example Organization', organization_type: scope },
    agency: { id: 1, name: 'Example Agency' }, templates: []
  };
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/insurance-continue' ? data : {} }));
  wrapper = mount(PublicIntakeSigningView, { global: {
    plugins: [createPinia()],
    stubs: { DigitalFormShell: { template: '<main><slot /></main>' }, SignaturePad: true, SecureCardSetup: true }
  } });
  await flushPromises();
  wrapper.vm.intakeForSelf = true;
  wrapper.vm.serviceSubject = 'self';
  wrapper.vm.intakeResponses.submission.insuranceInfo = structuredClone(insuranceInfo);
  wrapper.vm.step = 2;
  wrapper.vm.currentFlowIndex = wrapper.vm.flowSteps.findIndex(step => step.type === 'insurance_info');
  await flushPromises();
}

const insurance = () => wrapper.vm.intakeResponses.submission.insuranceInfo;
async function clickChoice(component, text) {
  await component.findAll('button').find(button => button.text().startsWith(text)).trigger('click');
  await flushPromises();
}
async function authorize() {
  const form = wrapper.findComponent(CombinedInsurance);
  const noCard = form.findAll('button').find(button => button.text().includes('Not Paying Now'));
  if (noCard) await noCard.trigger('click');
  await form.get('.pi-ip-auth-check input').setValue(true);
  await form.get('.pi-ip-sign input').setValue('QA Adult');
}
async function continueInsurance() {
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.stepError).toBe('');
  expect(wrapper.vm.currentFlowStep.type).toBe('communications');
}

describe('office insurance Continue and Back', () => {
  it.each(['commercial', 'primary Medicaid', 'secondary Medicaid'])('preserves %s coverage and authorization when Self-Pay continues and changes back to insurance', async tier => {
    const primary = { insurerName: tier === 'primary Medicaid' ? 'Medicaid' : 'Commercial', memberId: 'QA-PRIMARY', groupNumber: 'QA-GROUP', subscriberName: 'QA Adult', isMedicaid: tier === 'primary Medicaid' };
    const secondary = { insurerName: tier === 'secondary Medicaid' ? 'Medicaid' : 'Other Commercial', memberId: 'QA-SECONDARY', isMedicaid: tier === 'secondary Medicaid' };
    await render({ insuranceInfo: { primary, secondary, hasSecondary: true, payerChoice: 'insurance', isSelfPay: false } });
    await clickChoice(wrapper.findComponent(CombinedInsurance), 'Self-Pay');
    await authorize();
    await continueInsurance();
    expect(insurance()).toMatchObject({ isSelfPay: true, payerChoice: 'self_pay', primary, secondary, hasSecondary: true,
      authorizationAgreed: true, authorizationSignature: 'QA Adult' });
    expect(wrapper.vm.shouldSkipPaymentCollectionStep()).toBe(tier !== 'commercial');

    wrapper.vm.goBackPublicPage();
    await flushPromises();
    const form = wrapper.findComponent(CombinedInsurance);
    expect(form.get('.pi-ip-sign input').element.value).toBe('QA Adult');
    await clickChoice(form, 'Use Insurance');
    expect(form.findComponent(SchoolInsurance).exists()).toBe(true);
    expect(insurance()).toMatchObject({ isSelfPay: false, payerChoice: 'insurance', primary, secondary });
    await continueInsurance();
    expect(insurance()).toMatchObject({ primary, secondary, authorizationSignature: 'QA Adult' });
  });

  it('allows empty-policy Self-Pay and lets Back choose insurance without treating Self-Pay as a carrier', async () => {
    await render();
    await clickChoice(wrapper.findComponent(CombinedInsurance), 'Self-Pay');
    await authorize();
    await continueInsurance();
    expect(insurance()).toMatchObject({ isSelfPay: true, authorizationAgreed: true, authorizationSignature: 'QA Adult' });
    wrapper.vm.goBackPublicPage();
    await flushPromises();
    await clickChoice(wrapper.findComponent(CombinedInsurance), 'Use Insurance');
    expect(insurance().isSelfPay).toBe(false);
    expect(wrapper.findComponent(CombinedInsurance).findComponent(SchoolInsurance).exists()).toBe(true);
    await wrapper.vm.handleCurrentFlowContinue();
    await flushPromises();
    expect(wrapper.vm.currentFlowStep.type).toBe('insurance_info');
    expect(wrapper.vm.stepError).toContain('select your primary insurance');
  });
});

it('keeps the standalone school Self-Pay path free of a hidden authorization requirement', async () => {
  await render({ school: true });
  expect(wrapper.findComponent(CombinedInsurance).exists()).toBe(false);
  await clickChoice(wrapper.findComponent(SchoolInsurance), 'I am self-pay');
  await continueInsurance();
  expect(insurance()).toMatchObject({ isSelfPay: true, primary: { insurerName: 'Self-Pay', memberId: '' },
    authorizationSourceMethod: 'self_pay', authorizationSignature: '', authorizationSignatureData: '' });
  expect(insurance().authorizationAgreed).toBeUndefined();
});
