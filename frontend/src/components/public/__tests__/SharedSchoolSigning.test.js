import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SmartSchoolRoiFlow from '../SmartSchoolRoiFlow.vue';
import PacketSectionConsentFlow from '../PacketSectionConsentFlow.vue';
import { clinicalAnswersForStep, sharedSigningChildren, SHARED_SIGNING_STEP_TYPES } from '../../../utils/sharedIntakeSigning';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: {} }) } }));
const children = [{ fullName: 'Alex Example', dateOfBirth: '2012-02-03' }, { fullName: 'Blair Example', dateOfBirth: '2017-06-07' }];
const signature = 'data:image/png;base64,parent';
const props = { publicKey: 'test-school', sessionToken: 'session', link: {}, roiContext: { staffRoster: [], requiredAcknowledgements: [], waiverItems: [] }, mode: 'embedded', sharedChildren: children, sessionSavedSignature: signature,
  prefill: { intakeForSelf: false, clientFullName: children[0].fullName, clientDateOfBirth: children[0].dateOfBirth, signerFirstName: 'Pat', signerLastName: 'Example', signerEmail: 'pat@example.com', signerRelationship: 'Parent' } };
const options = { global: { stubs: { SignaturePad: { template: '<div data-signature-pad />' } } } };

describe('shared school signing', () => {
  it('identifies both children and does not ask parents to reenter the first child’s DOB', () => {
    const w = mount(SmartSchoolRoiFlow, { ...options, props });
    expect(w.text()).toContain('Alex Example'); expect(w.text()).toContain('Blair Example');
    expect(w.text()).toContain('2017-06-07'); expect(w.find('#roi-client-dob').exists()).toBe(false);
    w.unmount();
  });
  it('applies a saved signature explicitly once on the release for both children', async () => {
    const w = mount(SmartSchoolRoiFlow, { ...options, props });
    w.vm.stageIndex = w.vm.stageOrder.indexOf('review');
    await w.vm.$nextTick();
    expect(w.find('[data-signature-pad]').exists()).toBe(false);
    expect(w.vm.signatureData).toBe('');
    await w.findAll('button').find(b => b.text() === 'Apply my saved signature').trigger('click');
    expect(w.vm.signatureData).toBe(signature);
    expect(w.text()).toContain('Blair Example');
    await w.findAll('button').find(b => b.text() === 'Draw a new signature').trigger('click');
    expect(w.find('[data-signature-pad]').exists()).toBe(true);
    expect(w.vm.signatureData).toBe(''); w.unmount();
  });
  it('single-child releases still show the individual identity', () => {
    const w = mount(SmartSchoolRoiFlow, { ...options, props: { ...props, sharedChildren: [] } });
    expect(w.find('#roi-client-dob').exists()).toBe(true); w.unmount();
  });
  it('reuses a saved signature for a shared consent section without a second drawing', async () => {
    const w = mount(PacketSectionConsentFlow, { ...options, props: { sectionContext: { sectionKey: 'policy_services', title: 'Policy', html: '<p>Terms</p>' }, sessionSavedSignature: signature } });
    await w.find('input[type=checkbox]').setValue(true);
    await w.findAll('button').find(b => b.text().includes('Continue to signature')).trigger('click');
    await w.findAll('button').find(b => b.text().includes('Apply my signature')).trigger('click');
    expect(w.find('img').attributes('src')).toBe(signature); w.unmount();
  });
  it('keeps shared signatures separate from child-specific questions and demographic answers', () => {
    expect(SHARED_SIGNING_STEP_TYPES.has('questions')).toBe(false);
    expect(SHARED_SIGNING_STEP_TYPES.has('clinical_questions')).toBe(false);
    expect(SHARED_SIGNING_STEP_TYPES.has('school_roi')).toBe(true);
    expect(sharedSigningChildren([{ firstName: 'Alex' }, { firstName: 'Blair' }], [{ child_dob: '2012-02-03' }, { child_dob: '2017-06-07' }])).toEqual([
      { fullName: 'Alex', dateOfBirth: '2012-02-03' }, { fullName: 'Blair', dateOfBirth: '2017-06-07' }
    ]);
  });
});

it('keeps legacy clinical-question pages in each child’s own answer bag', () => {
  const responses = { clients: [{ psc_1: 'Often' }, {}] };
  const shared = { psc_1: 'Sometimes' };
  const second = clinicalAnswersForStep({ clientIndex: 1 }, responses, shared);
  expect(second.psc_1).toBeUndefined();
  second.psc_1 = 'Never';
  expect(responses.clients[0].psc_1).toBe('Often');
  expect(responses.clients[1].psc_1).toBe('Never');
  expect(shared.psc_1).toBe('Sometimes');
});
