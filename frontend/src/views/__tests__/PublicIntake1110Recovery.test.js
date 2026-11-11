import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import { setPublicLocale } from '../../i18n';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { publicKey: 'qa1110-recovery' }, query: {}, path: '/intake/qa1110-recovery' }),
  useRouter: () => ({ replace: vi.fn().mockResolvedValue(), push: vi.fn().mockResolvedValue() })
}));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div />' } }));
let wrapper;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); setPublicLocale('en');
  window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn();
  post.mockReset().mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); setPublicLocale('en'); });
async function render({ school = false, self = true, locale = 'en', withDocument = false } = {}) {
  const data = {
    link: { id: 1, form_type: 'intake', scope_type: school ? 'school' : 'agency', organization_id: 2,
      agency_id: 1, inherits_office_master: school ? 0 : 1, master_channel: 'counseling', language_code: locale,
      intake_fields: [], intake_steps: [...(withDocument ? [{id:'terms',type:'document',templateId:9}] : []), { id: 'communications', type: 'communications' }, { id: 'review', type: 'questions', fields: [] }] },
    organization: { id: 2, name: 'QA Organization', organization_type: school ? 'school' : 'agency' },
    agency: { id: 1, name: 'QA Agency' }, templates: withDocument ? [{id:9,name:'QA terms',template_type:'html',document_action_type:'signature',html_content:'<p>QA terms</p>'}] : []
  };
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/qa1110-recovery' ? data : {} }));
  wrapper = mount(PublicIntakeSigningView, { global: {
    plugins: [createPinia()], stubs: { DigitalFormShell: { template: '<main><slot /></main>' }, SignaturePad: true, SecureCardSetup: true }
  } });
  await flushPromises();
  wrapper.vm.intakeForSelf = self;
  wrapper.vm.serviceSubject = self ? 'self' : 'dependent';
  wrapper.vm.sessionToken = 'synthetic-session'; wrapper.vm.submissionId = 100;
  wrapper.vm.communicationConsent = {
    version: 'test', text: 'School SMS notice', officeText: 'Office SMS notice', schoolText:'School logistics notice', schoolTextSelf:'School self notice',
    emailText: 'School email notice', officeEmailText: 'Office email notice',
    signatureText: 'Guardian signature notice', signatureTextSelf: 'My signature notice'
  };
  wrapper.vm.step = 2;
  wrapper.vm.currentFlowIndex = wrapper.vm.flowSteps.findIndex(s => s.type === 'communications');
  await flushPromises();
}

it.each([false, true])('uses the displayed office/school notices in the saved communication evidence (school=%s)', async school => {
  await render({ school, self: !school });
  const context = school ? 'School' : 'Office';
  expect(wrapper.text()).toContain(`${context} SMS notice`);
  expect(wrapper.text()).toContain(`${context} email notice`);
  expect(wrapper.text()).toContain(school ? 'Guardian signature notice' : 'My signature notice');
  if (!school) { expect(wrapper.text()).not.toContain('parent texting program'); expect(wrapper.find('.school-communication-notice').exists()).toBe(false); }
  else { expect(wrapper.get('.school-communication-notice').text()).toContain('School logistics notice'); expect(wrapper.get('.school-communication-notice h4').text()).toBe('School communication notice'); }
  Object.assign(wrapper.vm.communications, { emailPreference: 'no', smsPreference: 'no', providerTextingOptIn: 'no', signerName: 'Synthetic Signer', signatureAccepted: true });
  wrapper.vm.completeCommunicationsStep(); await flushPromises();
  expect(wrapper.vm.stepError).toBe('');
  expect(wrapper.vm.intakeResponses.submission.communicationPreferences).toMatchObject({
    disclosure: `${context} SMS notice`, displayedDisclosure: `${context} SMS notice`, emailDisclosure: `${context} email notice`
  });
});

it.each(['', 'Harper', 'Sloan'])('retains the explicitly entered adult middle name without inferring it from the surname (%s)', async middle => {
  await render();
  wrapper.vm.guardianFirstName = 'Morgan'; wrapper.vm.guardianMiddleName = middle; wrapper.vm.guardianLastName = 'Sloan';
  await flushPromises();
  expect(wrapper.vm.buildClientPayloads()[0]).toMatchObject({ firstName: 'Morgan', middleName: middle, lastName: 'Sloan', fullName: ['Morgan', middle, 'Sloan'].filter(Boolean).join(' ') });
  const snapshot = wrapper.vm.buildDraftSnapshot();
  expect(snapshot.guardian.middleName).toBe(middle);
  wrapper.vm.guardianMiddleName = 'Old person';
  wrapper.vm.applyDraftSnapshot(snapshot); await flushPromises();
  expect(wrapper.vm.guardianMiddleName).toBe(middle);
  wrapper.vm.resetIntakeState(); await flushPromises();
  expect(wrapper.vm.guardianMiddleName).toBe('');
});

it('localizes an authorization rejection and permits a corrected retry without losing the form', async () => {
  await render({ locale: 'es' });
  wrapper.vm.signatureData = 'synthetic-enrollment-signature';
  const message = 'Please agree to and sign the insurance and payment authorization before completing enrollment.';
  post.mockImplementation(async url => {
    if (url.endsWith('/finalize')) throw { response: { status: 400, data: { error: { message } } } };
    return { data: {} };
  });
  await wrapper.vm.finalizePacket(); await flushPromises();
  expect(wrapper.vm.error).not.toBe(message);
  expect(wrapper.vm.error).toContain('autorización');
  expect(wrapper.vm.signatureData).toBe('synthetic-enrollment-signature');
  expect(wrapper.vm.step).toBe(2); expect(wrapper.vm.finalizingPacket).toBe(false);
  post.mockResolvedValue({ data: { submissionId: 100, downloadUrl: '/synthetic-receipt.pdf' } });
  await wrapper.vm.finalizePacket(); await flushPromises();
  expect(wrapper.vm.step).toBe(3); expect(wrapper.vm.error).toBe('');
});

it('requires an explicit reusable-signature application instead of signing a document when Continue is clicked',async()=>{
 await render({withDocument:true});
 wrapper.vm.currentFlowIndex=wrapper.vm.flowSteps.findIndex(step=>step.type==='document');
 wrapper.vm.lastSignatureData='data:image/png;base64,'+'D'.repeat(100);await flushPromises();
 expect(wrapper.vm.signatureData).toBe('');
 await wrapper.vm.completeCurrentDocument();await flushPromises();
 expect(wrapper.vm.showSavedSigPrompt).toBe(true);
 expect(post.mock.calls.some(([url])=>url.endsWith('/sign'))).toBe(false);
 wrapper.vm.applyPromptedSavedSignature();
 await wrapper.vm.completeCurrentDocument();await flushPromises();
 expect(post.mock.calls.filter(([url])=>url.endsWith('/sign'))).toHaveLength(1);
 expect(wrapper.vm.currentFlowStep.type).toBe('communications');
});

it('keeps a locally edited ROI unsigned in the parent flow without advancing or discarding its choices',async()=>{
 await render({school:true,self:false});
 const index=wrapper.vm.currentFlowIndex;
 wrapper.vm.lastSignatureData='QA-OLD';
 wrapper.vm.handleEmbeddedSchoolRoiInvalidated({smartSchoolRoi:{signatureData:'QA-OLD',signer:{email:'testing+corrected@itsco.health'},staffDecisions:[{schoolStaffUserId:99,decision:'none'}]}});
 expect(wrapper.vm.currentFlowIndex).toBe(index);expect(wrapper.vm.lastSignatureData).toBe('');
 expect(wrapper.vm.embeddedSmartSchoolRoi).toMatchObject({signatureData:null,needsResign:true,staffDecisions:[{schoolStaffUserId:99,decision:'none'}]});
 expect(wrapper.vm.intakeResponses.submission.smartSchoolRoi).toBe(wrapper.vm.embeddedSmartSchoolRoi);
});
