import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SmartSchoolRoiFlow from '../SmartSchoolRoiFlow.vue';

vi.mock('../../../services/api', () => ({
  default: {
    post: vi.fn()
  }
}));

const roiContext = {
  client: {
    id: 11,
    fullName: 'Test Client',
    dateOfBirth: '2016-04-05',
    initials: 'TC'
  },
  school: {
    id: 9,
    name: 'Test School'
  },
  purposes: ['Support care planning'],
  requiredAcknowledgements: [
    {
      id: 'esign_consent',
      title: 'Electronic consent',
      body: 'Accept electronic signature.'
    }
  ],
  waiverItems: [
    {
      id: 'communication_and_care_planning',
      title: 'Care planning',
      body: 'Authorize communication.'
    }
  ],
  staffRoster: [
    {
      schoolStaffUserId: 99,
      fullName: 'Staff Person',
      email: 'staff@example.com'
    }
  ]
};

function mountFlow(extraProps = {}, options = {}) {
  return mount(SmartSchoolRoiFlow, {
    ...options,
    props: {
      publicKey: 'abc123',
      sessionToken: 'session-token',
      roiContext,
      link: { id: 1, form_type: 'smart_school_roi' },
      boundClient: { id: 11, full_name: 'Test Client', initials: 'TC' },
      ...extraProps
    },
    global: {
      stubs: {
        SignaturePad: {
          template: '<button type="button" class="signature-stub" @click="$emit(\'signed\', \'data:image/png;base64,test\')">Sign</button>'
        }
      }
    }
  });
}

describe('SmartSchoolRoiFlow', () => {
  it('preserves the DOB calendar date when an older API serializes it as midnight UTC', () => {
    const wrapper = mountFlow({ roiContext: { ...roiContext, client: { ...roiContext.client, dateOfBirth: '2016-03-14T00:00:00.000Z' } } });
    expect(wrapper.vm.form.clientDateOfBirth).toBe('2016-03-14');
    wrapper.unmount();
  });
  beforeEach(() => { localStorage.clear(); Element.prototype.scrollIntoView = vi.fn(); });
  it('blocks progress when intro fields are missing', async () => {
    const wrapper = mountFlow();

    await wrapper.get('button.btn-primary').trigger('click');

    expect(wrapper.text()).toContain('Choose whether this release is for you or your dependent.');
  });

  it('only allows accepting required acknowledgements', async () => {
    const wrapper = mountFlow();

    const intakeChoiceRadios = wrapper.findAll('input[type="radio"]');
    await intakeChoiceRadios[1].setValue();

    await wrapper.get('#roi-client-dob').setValue('04/05/2016');
    await wrapper.get('#roi-client-full-name').setValue('Test Client');
    await wrapper.get('#roi-signer-first-name').setValue('Jamie');
    await wrapper.get('#roi-signer-last-name').setValue('Parent');
    await wrapper.get('#roi-signer-relationship').setValue('Mother');
    await wrapper.get('input[type="email"]').setValue('jamie@example.com');
    await wrapper.get('input[type="tel"]').setValue('555-123-4567');
    await wrapper.get('button.btn-primary').trigger('click');
    await wrapper.get('button.btn-primary').trigger('click');

    expect(wrapper.text()).toContain('This acknowledgement is required to continue.');
    expect(wrapper.text()).not.toContain('I do not accept');
    expect(wrapper.findAll('input[type="radio"]').length).toBe(1);
  });
});

async function filledIntro(wrapper) {
  await wrapper.get('#roi-intake-self-no').setValue();
  await wrapper.get('#roi-signer-first-name').setValue('Jamie');
  await wrapper.get('#roi-signer-last-name').setValue('Parent');
  await wrapper.get('#roi-signer-email').setValue('jamie@example.com');
  await wrapper.get('#roi-signer-relationship').setValue('Parent');
  await wrapper.get('button.btn-primary').trigger('click');
}
it('prefills the addressed email without choosing signer authority', () => {
  const wrapper = mountFlow({ prefill: { signerEmail: 'invited@example.com' } });
  expect(wrapper.get('#roi-signer-email').element.value).toBe('invited@example.com');
  expect(wrapper.get('#roi-intake-self-no').element.checked).toBe(false);
  expect(wrapper.get('#roi-intake-self-yes').element.checked).toBe(false);
  wrapper.unmount();
});
it('groups staff with visible permission defaults and retains the selected restrictions', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const wrapper = mountFlow({ roiContext: { ...roiContext, staffRoster: [...roiContext.staffRoster, { schoolStaffUserId: 100, fullName: 'Second Staff' }] } });
  expect(wrapper.text()).toContain('Section 1 of 9');
  await filledIntro(wrapper);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  await wrapper.get('button.btn-primary').trigger('click');
  await wrapper.get('input[type="radio"]').setValue();
  await wrapper.get('button.btn-primary').trigger('click');
  await wrapper.get('input[type="radio"]').setValue();
  await wrapper.get('button.btn-primary').trigger('click');
  expect(wrapper.text()).toContain('Staff Person'); expect(wrapper.text()).toContain('Second Staff');
  expect(wrapper.findAll('input[type="radio"]:checked')).toHaveLength(2);
  await wrapper.get('input[name="staffDecision_99"][value="roi"]').setValue();
  await wrapper.get('input[name="staffDecision_100"][value="none"]').setValue();
  await wrapper.get('button.btn-primary').trigger('click');
  expect(wrapper.text()).not.toContain('School staff approval');
  await wrapper.findAll('button').find(b => b.text() === 'Back').trigger('click');
  expect(wrapper.get('input[name="staffDecision_99"][value="roi"]').element.checked).toBe(true);
  expect(wrapper.get('input[name="staffDecision_100"][value="none"]').element.checked).toBe(true);
  wrapper.unmount();
});

it('keeps an acknowledgement visibly checked when its label is clicked', async () => {
  localStorage.clear();
  const wrapper = mountFlow({}, { attachTo: document.body });
  await filledIntro(wrapper);
  await wrapper.get('button.btn-primary').trigger('click');
  const radio = wrapper.get('input[name="ack_esign_consent"]');
  expect(radio.element.checked).toBe(false);
  radio.element.closest('label').click();
  await wrapper.vm.$nextTick();
  expect(radio.element.checked).toBe(true);
  await wrapper.get('button.btn-primary').trigger('click');
  expect(wrapper.text()).toContain('Care planning');
  await wrapper.findAll('button').find(button => button.text() === 'Back').trigger('click');
  expect(wrapper.get('input[name="ack_esign_consent"]').element.checked).toBe(true);
  wrapper.unmount();
});

it('defaults a new release to permitted listed staff and retains an explicit denial', async () => {
  const wrapper = mountFlow();
  const state = wrapper.vm.$.setupState;
  expect(state.form.staffDecisions[99]).toBe('roi_docs');
  state.stageIndex = state.stageOrder.indexOf('staff');
  await wrapper.vm.$nextTick();
  expect(wrapper.text()).toContain('unless you choose Deny');
  await wrapper.get('input[value="none"]').setValue();
  expect(state.form.staffDecisions[99]).toBe('none');
  wrapper.unmount();
});

it('preserves saved decisions and never grants newly listed staff on reopening a signed capture', () => {
  const wrapper = mountFlow({ roiContext: { ...roiContext, staffRoster: [...roiContext.staffRoster, { schoolStaffUserId: 100, fullName: 'New Staff' }] }, savedCapture: { signatureData: 'saved-signature', staffDecisions: [{ schoolStaffUserId: 99, decision: 'none' }] } });
  const state = wrapper.vm.$.setupState;
  expect(state.form.staffDecisions[99]).toBe('none');
  expect(state.form.staffDecisions[100]).toBeNull();
  wrapper.unmount();
});

it('defaults asynchronously loaded staff on a fresh form without converting them to denials', async () => {
 const w=mountFlow({roiContext:{...roiContext,staffRoster:[]},embedded:true});
 await w.setProps({roiContext});
 expect(w.vm.buildRoiPayload().staffDecisions).toEqual([expect.objectContaining({schoolStaffUserId:99,decision:'roi_docs',allowed:true,packetAllowed:true})]);
 w.vm.form.staffDecisions[99]='none';
 await w.setProps({roiContext:{...roiContext,staffRoster:[...roiContext.staffRoster,{schoolStaffUserId:100,fullName:'Added Staff'}]}});
 expect(w.vm.buildRoiPayload().staffDecisions.map(s=>s.decision)).toEqual(['none','roi_docs']);w.unmount();
});
it('keeps legacy explicit permissions on resume and blocks an unknown choice at final review',async()=>{
 const w=mountFlow({savedCapture:{signatureData:'synthetic',staffDecisions:[{schoolStaffUserId:99,allowed:true,packetAllowed:true}]}});
 expect(w.vm.form.staffDecisions[99]).toBe('roi_docs');
 w.vm.form.staffDecisions[99]=undefined;
 expect(w.vm.buildRoiPayload().staffDecisions[0].allowed).toBeNull();
 await w.vm.submitRoi();expect(w.emitted('captured')).toBeUndefined();expect(w.text()).toContain('Choose ROI All Active');w.unmount();
});

it.each(['en','es'])('keeps fresh All Active through review, capture and signed restore (%s)',async locale=>{
 const roster=[...roiContext.staffRoster,{schoolStaffUserId:100,fullName:'Second Staff'}];
 const w=mountFlow({mode:'embedded',locale,roiContext:{...roiContext,staffRoster:roster},sessionSavedSignature:'QA-SIGNATURE'});
 w.vm.stageIndex=w.vm.stageOrder.indexOf('staff');await w.vm.$nextTick();
 expect(w.findAll('input[type=radio]:checked').map(field=>field.element.value)).toEqual(['roi_docs','roi_docs']);
 w.vm.stageIndex=w.vm.stageOrder.indexOf('review');await w.vm.$nextTick();
 expect(w.vm.signatureData).toBe('');
 await w.get('.saved-sig-thumb').trigger('click');
 await w.vm.submitRoi();
 const saved=w.emitted('captured')[0][0].smartSchoolRoi;
 expect(saved.staffDecisions.map(row=>[row.decision,row.allowed,row.packetAllowed])).toEqual([['roi_docs',true,true],['roi_docs',true,true]]);
 w.unmount();
 const restored=mountFlow({mode:'embedded',locale,roiContext:{...roiContext,staffRoster:roster},savedCapture:saved});
 expect(restored.vm.buildRoiPayload().staffDecisions.map(row=>row.decision)).toEqual(['roi_docs','roi_docs']);
 restored.unmount();
});
it('keeps explicit Deny choices unsigned after a signer edit instead of applying fresh defaults',async()=>{
 const w=mountFlow({mode:'embedded',savedCapture:{signatureData:null,needsResign:true,signer:{email:'testing+corrected@itsco.health'},staffDecisions:[{schoolStaffUserId:99,decision:'none',allowed:false,packetAllowed:false}]},sessionSavedSignature:'OTHER-SECTION'});
 expect(w.vm.form.staffDecisions[99]).toBe('none');
 expect(w.vm.signatureData).toBe('');
 w.vm.stageIndex=w.vm.stageOrder.indexOf('review');await w.vm.$nextTick();
 expect(w.vm.signatureData).toBe('');
 await w.get('.saved-sig-thumb').trigger('click');await w.vm.submitRoi();
 expect(w.emitted('captured')[0][0].smartSchoolRoi.staffDecisions[0]).toMatchObject({decision:'none',allowed:false,packetAllowed:false});
 w.unmount();
});

it('invalidates a saved ROI when local signer identity changes and preserves unsigned denials through clear/retype',async()=>{
 const saved={signatureData:'QA-PREVIOUS-SIGNATURE',signer:{firstName:'Pat',lastName:'Parent',email:'testing+before@itsco.health',relationship:'Parent'},staffDecisions:[{schoolStaffUserId:99,decision:'none',allowed:false,packetAllowed:false}],requiredAcknowledgements:{esign_consent:true},waiverItems:{communication_and_care_planning:'accept'}};
 const w=mountFlow({mode:'embedded',savedCapture:saved,sessionSavedSignature:'OLD-REUSABLE'});
 expect(w.vm.signatureData).toBe(saved.signatureData);
 w.vm.form.signer.email='';await w.vm.$nextTick();
 expect(w.vm.signatureData).toBe('');expect(w.emitted('invalidated').at(-1)[0].smartSchoolRoi).toMatchObject({signatureData:null,needsResign:true,staffDecisions:[expect.objectContaining({decision:'none'})]});
 w.vm.form.signer.email='testing+corrected@itsco.health';await w.vm.$nextTick();
 expect(w.emitted('invalidated').at(-1)[0].smartSchoolRoi.signer.email).toBe('testing+corrected@itsco.health');
 w.vm.stageIndex=w.vm.stageOrder.indexOf('review');await w.vm.$nextTick();
 await w.vm.submitRoi();expect(w.emitted('captured')).toBeUndefined();
 await w.get('.saved-sig-thumb').trigger('click');await w.vm.submitRoi();
 expect(w.emitted('captured')[0][0].smartSchoolRoi).toMatchObject({signer:{email:'testing+corrected@itsco.health'},staffDecisions:[expect.objectContaining({decision:'none'})]});w.unmount();
});
it('invalidates an already applied signature if a reviewed staff permission changes',async()=>{
 const w=mountFlow({mode:'embedded',savedCapture:{signatureData:'QA-SIGNED',staffDecisions:[{schoolStaffUserId:99,decision:'roi_docs'}]}});
 w.vm.form.staffDecisions[99]='none';await w.vm.$nextTick();
 expect(w.vm.signatureData).toBe('');expect(w.emitted('invalidated').at(-1)[0].smartSchoolRoi.staffDecisions[0].decision).toBe('none');
 await w.setProps({savedCapture:{signatureData:'QA-LEGITIMATE-RESTORE',staffDecisions:[{schoolStaffUserId:99,decision:'roi_docs'}]}});
 expect(w.vm.signatureData).toBe('QA-LEGITIMATE-RESTORE');expect(w.vm.form.staffDecisions[99]).toBe('roi_docs');w.unmount();
});
