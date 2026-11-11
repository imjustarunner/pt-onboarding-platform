import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import Combined from '../PublicIntakeInsurancePaymentStep.vue';
import Insurance from '../PublicIntakeInsuranceStep.vue';
import Shell from '../../digital-form/DigitalFormShell.vue';
import Payment from '../PublicIntakePaymentStep.vue';
import PolicyFields from '../../billing/InsurancePolicyFields.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const props = () => ({ insuranceInfo: { primary: { insurerName: 'Commercial' }, secondary: { insurerName: 'Health First Colorado', isMedicaid: true }, clientCoverages: [{clientIndex:0,confirmed:true}] }, clientNames: ['Sample Client'], guardianName: 'Sample Parent' });
const mountForm = overrides => mount(Combined, { props: { ...props(), ...overrides }, global: { stubs: { PublicIntakePaymentStep: { template: '<div data-card-form>Secure card form</div>' } } } });
describe('insurance enrollment', () => {
  it('never prompts for a card while coverage is being entered before secondary Medicaid is identified', async () => {
    const w = mountForm({ insuranceInfo: {}, paymentCollectionAvailable: true });
    const noPrompt = () => {
      expect(w.text()).not.toContain('Save your card securely');
      expect(w.text()).not.toContain('Your payment arrangement');
      expect(w.text()).not.toContain("I'll Add Card Later");
    };
    noPrompt();
    await w.setProps({ insuranceInfo: { payerChoice: 'insurance', primary: { insurerName: 'Commercial' } } });
    noPrompt();
    await w.setProps({ insuranceInfo: { payerChoice: 'insurance', primary: { insurerName: 'Commercial' }, hasSecondary: true, secondary: {} } });
    noPrompt();
    await w.setProps({ insuranceInfo: { payerChoice: 'insurance', primary: { insurerName: 'Commercial' }, hasSecondary: true, secondary: { insurerName: 'Health First Colorado' } } });
    noPrompt();
    w.unmount();
  });
  it('shows commercial payment only after coverage review, then hides it immediately when coverage changes', async () => {
    const commercial = { payerChoice: 'insurance', primary: { insurerName: 'Commercial' }, hasSecondary: false };
    const w = mountForm({ insuranceInfo: commercial, paymentCollectionAvailable: true });
    expect(w.text()).not.toContain('Save your card securely');
    await w.findAll('button').find(b => b.text().includes('Confirm primary')).trigger('click');
    expect(w.text()).toContain('Save your card securely');
    await w.setProps({ insuranceInfo: { ...commercial, hasSecondary: true, secondary: {} } });
    expect(w.text()).not.toContain('Save your card securely');
    await w.setProps({ insuranceInfo: commercial });
    expect(w.text()).not.toContain('Save your card securely');
    await w.findAll('button').find(b => b.text().includes('Confirm primary')).trigger('click');
    expect(w.text()).toContain('Save your card securely');
    w.unmount();
  });
  it('does not let insurance-on-file override known Medicaid', () => {
    const w = mountForm({ insuranceOnFile: true });
    expect(w.text()).not.toContain('Save your card securely');
    expect(w.text()).not.toContain('Your payment arrangement');
    w.unmount();
  });
  it('suppresses payment when secondary plan type explicitly declares Medicaid despite a false legacy flag', () => {
    const w = mountForm({ insuranceInfo: { payerChoice: 'insurance', primary: { insurerName: 'Commercial' }, secondary: { insurerName: 'Regional plan', planType: 'Medicaid', isMedicaid: false } } });
    expect(w.find('[data-card-form]').exists()).toBe(false);
    expect(w.text()).not.toContain('Not Paying Now');
    expect(w.text()).not.toContain('Your payment arrangement');
    expect(w.text()).not.toContain('Add Card');
    expect(w.text()).toContain('No payment card is required');
    expect(w.text()).not.toContain('How would you like to pay?');
    expect(w.text()).not.toContain('Payment Summary');
    expect(w.emitted('update:insuranceInfo').at(-1)[0].secondary.isMedicaid).toBe(true);
    w.unmount();
  });
  it('requires a fresh payer choice and restores an explicitly saved choice without selecting a card', async () => {
    const w = mountForm({ insuranceInfo: {} });
    expect(w.findAll('.pi-ip-choice[aria-pressed="true"]')).toHaveLength(0);
    expect(w.vm.validateAuthorization()).toBe(false);
    await flushPromises();
    expect(w.text()).toContain('Please choose insurance or self-pay');
    await w.findAll('button').find(button => button.text().includes('Self-Pay')).trigger('click');
    const saved = w.emitted('update:insuranceInfo').at(-1)[0];
    expect(saved.isSelfPay).toBe(true);
    w.unmount();
    const restored = mountForm({ insuranceInfo: saved, hideHeading: true });
    expect(restored.text()).toContain('Your payment arrangement');
    expect(restored.find('[data-card-form]').exists()).toBe(false);
    expect(restored.find('h2').exists()).toBe(false);
    restored.unmount();
  });
  it('cannot advance with payment follow-up until the self-pay authorization is agreed and signed', async () => {
    const w=mount(Combined,{props:{insuranceInfo:{isSelfPay:true},guardianName:'QA Parent',stepConfig:{paymentRequired:false}},global:{stubs:{SecureCardSetup:true}}});
    expect(w.findAll('button').some(b => b.text().trim() === 'Add Card Save card for payments.')).toBe(false);
    const button=()=>w.findAll('button').find(b=>b.text()==='Continue with payment follow-up');
    await button().trigger('click');
    expect(w.emitted('skip-acknowledged')).toBeUndefined();
    expect(w.text()).toContain('Please agree');
    await w.find('.pi-ip-auth-check input').setValue(true);
    await button().trigger('click');expect(w.emitted('skip-acknowledged')).toBeUndefined();
    await w.find('.pi-ip-sign input').setValue('QA Parent');
    await button().trigger('click');expect(w.emitted('skip-acknowledged')).toHaveLength(1);
    expect(w.findComponent(Payment).exists()).toBe(false);w.unmount();
  });
  it('renders subscriber fields in the intake language without changing stored policy values',async()=>{
    const w=mount(PolicyFields,{props:{modelValue:{relationshipToSubscriber:'child',memberId:'TEST-123'}},global:{provide:{intakeLocale:ref('es')}}});
    expect(w.text()).toContain('Compañía de seguros');expect(w.text()).toContain('ID de miembro');
    expect(w.find('select').element.value).toBe('child');
    expect(w.findAll('input').some(i=>i.element.value==='TEST-123')).toBe(true);w.unmount();
  });
  it('settles controlled parent updates without a render loop or lost secondary coverage', async () => {
    let value; let updates = 0;
    const Host = defineComponent({ setup() {
      value = ref(props().insuranceInfo);
      return () => h(Combined, { insuranceInfo: value.value, clientNames: ['Sample Client'], 'onUpdate:insuranceInfo': next => { updates++; value.value = next; } });
    } });
    const w = mount(Host, { global: { stubs: { PublicIntakePaymentStep: true } } });
    await flushPromises(); expect(updates).toBeLessThan(10); expect(value.value.secondary.isMedicaid).toBe(true);
    value.value = { ...value.value, secondary: { insurerName: 'Medicaid', isMedicaid: true, memberId: 'RESTORED' } };
    await flushPromises(); expect(updates).toBeLessThan(15); expect(value.value.secondary.memberId).toBe('RESTORED'); w.unmount();
  });
  it('uses tenant branding and actual step progress in the compact shell', async () => {
    const w = mount(Shell, { props: { billingLayout: true, branding: { agencyName: 'Sample Institute', colorPalette: { primary: '#245c43' } }, progressSteps: [{ label: 'Client' }, { label: 'Insurance' }, { label: 'Review' }], progressIndex: 1 } });
    expect(w.text()).toContain('Sample Institute');
    expect(w.find('progress').attributes('value')).toBe('1');
    expect(w.find('progress').attributes('max')).toBe('3');
    expect(w.attributes('style')).toContain('#245c43');
    await w.setProps({ billingLayout: false }); expect(w.find('.df-billing-header').exists()).toBe(false); w.unmount();
  });
  it('secondary Medicaid hides card form, package prices, and financial liability language', () => {
    const w = mountForm({ selectedPackage: { name: 'Care package', priceCents: 120000 } });
    expect(w.find('[data-card-form]').exists()).toBe(false);
    expect(w.text()).not.toContain('$1,200');
    expect(w.text()).not.toContain('financially responsible');
    expect(w.text()).toContain('No payment card is required');
    expect(w.text()).not.toContain('How would you like to pay?');
    expect(w.text()).not.toContain('Payment Summary');
    expect(w.text()).toContain('Secondary subscriber');
    w.unmount();
  });
  it('hides another-parent payment on a Myself enrollment and names the child on the insurance button', async () => {
    const selfPay = mountForm({ intakeForSelf: true, insuranceInfo: { isSelfPay: true, payerChoice: 'self_pay' } });
    expect(selfPay.text()).not.toContain('another parent');
    selfPay.unmount();
    const child = mount(Insurance, {
      props: { modelValue: { primary: {} }, intakeForSelf: false, clientNames: ['Demo Kid One QA'], guardianName: 'Demo Parent' },
      global: { provide: { intakeLocale: ref('en'), intakeStringTranslations: ref({}), intakeSessionToken: ref('') } }
    });
    await child.findAll('button').find((b) => b.text().includes('I have insurance')).trigger('click');
    await flushPromises();
    expect(child.text()).toContain('Use Demo Kid One QA');
    expect(child.text()).not.toContain('Use Client 1 Name');
    child.unmount();
  });
  it('lets self-pay continue without a card after an explicit no-card choice', async () => {
    const w = mountForm({ insuranceInfo: { isSelfPay: true, payerChoice: 'self_pay' } });
    expect(w.text()).toContain('N/A — Not Paying Now');
    expect(w.find('[data-card-form]').exists()).toBe(false);
    expect(w.vm.validateAuthorization()).toBe(false);
    await w.findAll('button').find(b => b.text().includes('Not Paying Now')).trigger('click');
    await w.find('.pi-ip-auth-check input').setValue(true);
    await w.find('.pi-ip-sign input').setValue('Sample Parent');
    expect(w.vm.validateAuthorization()).toBe(true);
    expect(w.find('[data-card-form]').exists()).toBe(false);
    w.unmount();
  });
  it('hides Primary Insurance fields on Self-Pay and keeps the office authorization signature', async () => {
    const w = mountForm({ insuranceInfo: { isSelfPay: true, payerChoice: 'self_pay' } });
    expect(w.text()).not.toContain('Primary Insurance');
    expect(w.findComponent(Insurance).exists()).toBe(false);
    expect(w.text()).toContain('Authorization');
    await w.findAll('button').find((b) => b.text().includes('Not Paying Now')).trigger('click');
    await w.find('.pi-ip-auth-check input').setValue(true);
    await w.find('.pi-ip-sign input').setValue('QA Adult Rep');
    await flushPromises();
    const saved = w.emitted('update:insuranceInfo').at(-1)[0];
    expect(saved.isSelfPay).toBe(true);
    expect(saved.authorizationAgreed).toBe(true);
    expect(String(saved.authorizationSignature || '')).toContain('QA Adult Rep');
    const entry = w.vm.getInsuranceEntryState();
    expect(entry.authorizationAgreed).toBe(true);
    expect(String(entry.authorizationSignature || '')).toContain('QA Adult Rep');
    w.unmount();
    const restored = mountForm({
      insuranceInfo: saved,
      paymentInfo: { paymentChoice: 'na' }
    });
    expect(restored.text()).not.toContain('Primary Insurance');
    expect(restored.findComponent(Insurance).exists()).toBe(false);
    expect(restored.vm.validateAuthorization()).toBe(true);
    restored.unmount();
  });
  it('commercial, self-pay and nonclinical enrollment collect a card only after an explicit choice', async () => {
    api.get.mockResolvedValue({data:{stripeEnabled:true,publishableKey:'pk_test_synthetic',connectedAccountId:'acct_synthetic'}});
    for (const override of [{ insuranceInfo: { primary: { insurerName: 'Commercial' } } }, { insuranceInfo: { isSelfPay: true } }, { paymentOnly: true }]) {
      const w = mountForm({publicKey:'synthetic-key',...override});await flushPromises();
      const confirm = w.findAll('button').find(button => button.text().includes('Confirm primary'));
      if (confirm) { await confirm.trigger('click'); await flushPromises(); }
      expect(w.find('[data-card-form]').exists()).toBe(false);
      await w.findAll('button').find(button=>button.text().startsWith('Add Card')).trigger('click');
      expect(w.find('[data-card-form]').exists()).toBe(true); w.unmount();
    }
    api.get.mockReset();
  });
  it('summary works without a package and does not fabricate a zero-dollar estimate', () => {
    const w = mountForm({ insuranceInfo: { isSelfPay: true } });
    expect(w.text()).toContain('What happens next?'); expect(w.text()).toContain('Pending service selection'); expect(w.text()).not.toContain('$0.00'); w.unmount();
  });
  it('changing to self-pay preserves declared Medicaid coverage', async () => {
    const w = mountForm();
    expect(w.findAll('button').some(b => b.text().includes('Self-Pay'))).toBe(false);
    w.vm.setSelfPay(true); const update = w.emitted('update:insuranceInfo').at(-1)[0];
    expect(update.secondary.isMedicaid).toBe(true); expect(update.isSelfPay).toBe(true);
    await w.setProps({ insuranceInfo: update }); await flushPromises();
    expect(w.find('[data-card-form]').exists()).toBe(false);
    expect(w.emitted('update:insuranceInfo').at(-1)[0].secondary.isMedicaid).toBe(true); w.unmount();
  });
  it('requires explicit agreement and signature', async () => {
    const w = mountForm(); expect(w.vm.validateAuthorization()).toBe(false);
    await w.find('.pi-ip-auth-check input').setValue(true);
    expect(w.vm.validateAuthorization()).toBe(false);
    await w.find('.pi-ip-sign input').setValue('Sample Parent');
    expect(w.vm.validateAuthorization()).toBe(true); w.unmount();
  });
  it('keeps an empty secondary policy open and applies externally restored coverage', async () => {
    let w;
    w = mount(Insurance, { props: { modelValue: { primary: { insurerName: 'Commercial' } }, clientNames: ['Sample Client'], 'onUpdate:modelValue': value => w?.setProps({ modelValue: value }) } });
    await w.find('.pi-ins-secondary-toggle input').setValue(true); await flushPromises();
    expect(w.text()).toContain('Secondary subscriber');
    await w.setProps({ modelValue: { ...w.props('modelValue'), secondary: { insurerName: 'Health First Colorado', isMedicaid: true, memberId: 'SECONDARY-TEST' } } });
    await flushPromises();
    expect(w.findAll('input').some(input => input.element.value === 'SECONDARY-TEST')).toBe(true);
    expect(w.props('modelValue').secondary.isMedicaid).toBe(true); w.unmount();
  });
  it('supports keyboard uploads, rejects invalid files, and previews PDF names without broken images', async () => {
    const w = mount(Insurance, { props: { modelValue: {primary:{insurerName:'Commercial'}}, clientNames: ['Sample Client'] } });
    const area = w.find('[aria-label="Upload primary front of insurance card"]');
    const input = w.find('input[type="file"]'); const click = vi.spyOn(input.element, 'click');
    await area.trigger('keydown', { key: 'Enter' }); expect(click).toHaveBeenCalled();
    await area.trigger('drop', { dataTransfer: { files: [new File(['bad'], 'bad.html', { type: 'text/html' })] } });
    expect(w.text()).toContain('no larger than 5 MB'); expect(w.vm.getPhotoFiles().primary_front).toBeNull();
    const file = new File(['synthetic PDF'], 'insurance.pdf', { type: 'application/pdf' });
    await area.trigger('drop', { dataTransfer: { files: [file] } }); await flushPromises();
    expect(w.vm.getPhotoFiles().primary_front).toBe(file); expect(area.text()).toContain('insurance.pdf'); expect(area.find('img').exists()).toBe(false); w.unmount();
  });
});

it.each([{primary:{insurerName:'Health First Colorado'}},{primary:{insurerName:'Medicaid'},secondary:{insurerName:'Health First Colorado'}}])('does not ask for images of Medicaid policies',modelValue=>{
 const w=mount(Insurance,{props:{modelValue,clientNames:['Sample Client']}});
 expect(w.find('[aria-label="Upload primary front of insurance card"]').exists()).toBe(false);
 expect(w.find('[aria-label="Upload secondary front of insurance card"]').exists()).toBe(false);
 expect(w.text()).not.toContain('I do not have my primary insurance card');
 expect(w.text()).not.toContain('encouraged for all plans');w.unmount();
});
it('requests only commercial card images when Medicaid is secondary',()=>{
 const w=mount(Insurance,{props:{modelValue:props().insuranceInfo,clientNames:['Sample Client']}});
 expect(w.find('[aria-label="Upload primary front of insurance card"]').exists()).toBe(true);
 expect(w.find('[aria-label="Upload primary back of insurance card"]').exists()).toBe(true);
 expect(w.find('[aria-label="Upload secondary front of insurance card"]').exists()).toBe(false);
 expect(w.find('[aria-label="Upload secondary back of insurance card"]').exists()).toBe(false);
 expect(w.text()).toContain('I do not have my primary insurance card');w.unmount();
});
it('keeps card selection specific to each policy across siblings and payer order',()=>{
 const modelValue={primary:{insurerName:'Medicaid'},secondary:{insurerName:'Commercial'},clientCoverages:[{clientIndex:0,confirmed:true,primary:{insurerName:'Medicaid'}},{clientIndex:1,confirmed:true,primary:{insurerName:'Commercial'}}]};
 const w=mount(Insurance,{props:{modelValue,clientNames:['Sample Child One','Sample Child Two']}});
 expect(w.find('[aria-label="Upload primary front of insurance card"]').exists()).toBe(false);
 expect(w.find('[aria-label="Upload secondary front of insurance card"]').exists()).toBe(true);
 const policies=w.findAll('.pi-ins-claim-details .pi-ins-claim-details');
 expect(policies[0].findAll('input[type="file"]')).toHaveLength(0);
 expect(policies[1].findAll('input[type="file"]')).toHaveLength(2);w.unmount();
});

it('offers a clinical card form only when secure collection is available',async()=>{
 api.get.mockResolvedValue({data:{stripeEnabled:true,publishableKey:'pk_test_synthetic',connectedAccountId:'acct_synthetic'}});
 const w=mountForm({publicKey:'synthetic-key',insuranceInfo:{isSelfPay:true}});await flushPromises();
 const card=w.findAll('button').find(button=>button.text().startsWith('Add Card'));expect(card).toBeDefined();await card.trigger('click');expect(w.find('[data-card-form]').exists()).toBe(true);w.unmount();
 api.get.mockResolvedValue({data:{stripeEnabled:false}});
 const unavailable=mountForm({publicKey:'synthetic-key',insuranceInfo:{isSelfPay:true}});await flushPromises();
 expect(unavailable.findAll('button').some(button=>button.text().startsWith('Add Card'))).toBe(false);expect(unavailable.text()).toContain('Card collection is unavailable');unavailable.unmount();
 api.get.mockReset();
});
it('saves distinct sibling Medicaid IDs as they are typed and restores them after leaving the step',async()=>{
 const model=ref({primary:{insurerName:'Medicaid',isMedicaid:true,memberId:'FIRST'},medicaidByClient:[{clientIndex:0,clientName:'One QA',memberId:'FIRST'},{clientIndex:1,clientName:'Two QA',memberId:'SECOND'}]});
 const Host=defineComponent({setup:()=>()=>h(Insurance,{modelValue:model.value,clientNames:['One QA','Two QA'],'onUpdate:modelValue':v=>model.value=v})});
 let w=mount(Host);await flushPromises();const fields=w.findAll('.pi-ins-multi-client input');expect(fields).toHaveLength(2);
 await fields[0].setValue('QA1108N01');await fields[1].setValue('QA1108N02');await flushPromises();
 expect(model.value.medicaidByClient.map(r=>r.memberId)).toEqual(['QA1108N01','QA1108N02']);w.unmount();
 w=mount(Host);await flushPromises();expect(w.findAll('.pi-ins-multi-client input').map(f=>f.element.value)).toEqual(['QA1108N01','QA1108N02']);w.unmount();
});

describe('coverage changes invalidate review and signing together', () => {
 const drawn='data:image/png;base64,'+'A'.repeat(100);
 const initial=()=>({payerChoice:'insurance',primary:{insurerName:'Health First Colorado',isMedicaid:true,memberId:'ONE',subscriberName:'One QA'},medicaidByClient:[{clientIndex:0,clientName:'One QA',memberId:'ONE'},{clientIndex:1,clientName:'Two QA',memberId:'TWO'}],clientCoverages:[{clientIndex:0,confirmed:true},{clientIndex:1,confirmed:true}],authorizationAgreed:true,authorizationSignature:'QA Parent',authorizationSignatureData:drawn,authorizationSignedAt:'2026-11-01T17:00:00Z'});
 const confirmations=w=>w.findAll('section.pi-ins-claim-details > label.checkbox-row input');
 function school(initialInfo=initial(),language='en') {
  const model=ref(initialInfo);
  const Host=defineComponent({setup:()=>()=>h(Insurance,{modelValue:model.value,guardianName:'QA Parent',clientNames:['One QA','Two QA'],savedSignatureData:drawn,'onUpdate:modelValue':v=>model.value=v})});
  const wrapper=mount(Host,{global:{provide:{intakeLocale:ref(language)}}});
  return {model,wrapper,step:()=>wrapper.findComponent(Insurance)};
 }
 it.each(['en','es'])('requires fresh per-child confirmations after an ID edit and revert in %s, including save/reload',async language=>{
  const {model,wrapper:w,step}=school(initial(),language);await flushPromises();
  expect(confirmations(w).map(c=>c.element.checked)).toEqual([true,true]);
  const fields=w.findAll('.pi-ins-multi-client input');
  await fields[1].setValue('TEMP');await fields[1].setValue('TWO');await flushPromises();
  expect(confirmations(w).map(c=>c.element.checked)).toEqual([false,false]);
  expect(model.value.authorizationAgreed).toBe(false);expect(model.value.authorizationSignatureData).toBe('');
  expect(step().vm.validateCoverageConfirmations()).toBe(false);
  for(const c of confirmations(w)) await c.setValue(true);
  expect(step().vm.validateCoverageConfirmations()).toBe(true);
  await w.find('.pi-ins-auth-apply').trigger('click');await flushPromises();
  expect(model.value.authorizationAgreed).toBe(true);expect(step().vm.getAuthorizationSignatureBundle().authorizationAgreed).toBe(true);
  expect(model.value.medicaidByClient.map(row=>row.memberId)).toEqual(['ONE','TWO']);
  const stored=JSON.parse(JSON.stringify(model.value));w.unmount();
  const restored=school(stored,language);await flushPromises();
  expect(confirmations(restored.wrapper).map(c=>c.element.checked)).toEqual([true,true]);
  expect(restored.step().vm.getAuthorizationSignatureBundle()).toMatchObject({authorizationAgreed:true,authorizationSignatureData:drawn});
  restored.wrapper.unmount();
 });
 it('restores school AOB consent only after explicit signing following signer-email invalidation',async()=>{
  const info=initial();info.authorizationAgreed=false;info.authorizationSignature='';info.authorizationSignatureData='';info.authorizationSignedAt=null;
  const {model,wrapper:w,step}=school(info);await flushPromises();
  expect(step().vm.getAuthorizationSignatureBundle().authorizationAgreed).toBe(false);
  await w.find('.pi-ins-auth-apply').trigger('click');await flushPromises();
  expect(model.value).toMatchObject({authorizationAgreed:true,authorizationSignature:'QA Parent',authorizationSignatureData:drawn});
  await w.find('.pi-ins-auth-resign').trigger('click');await flushPromises();
  expect(model.value).toMatchObject({authorizationAgreed:false,authorizationSignature:'',authorizationSignatureData:''});
  w.unmount();
 });
 it('retains a previously signed standalone draft with no legacy agreement flag, while an explicit false needs signing again',async()=>{
  const legacy=initial();delete legacy.authorizationAgreed;
  const old=school(legacy);await flushPromises();
  expect(old.step().vm.getAuthorizationSignatureBundle().authorizationAgreed).toBe(true);old.wrapper.unmount();
  const reset=initial();reset.authorizationAgreed=false;
  const current=school(reset);await flushPromises();
  expect(current.wrapper.find('.pi-ins-auth-apply').exists()).toBe(true);
  expect(current.step().vm.getAuthorizationSignatureBundle().authorizationAgreed).toBe(false);current.wrapper.unmount();
 });
 it('keeps separate policy entry visible and saved while a policy edit clears its confirmation',async()=>{
  const info=initial();info.clientCoverages[1].primary={insurerName:'Commercial',memberId:'OTHER'};
  const {model,wrapper:w}=school(info);await flushPromises();
  const policy=w.findComponent(PolicyFields);expect(policy.exists()).toBe(true);
  policy.vm.$emit('update:modelValue',{insurerName:'Commercial',memberId:'EDITED'});await flushPromises();
  expect(confirmations(w).map(c=>c.element.checked)).toEqual([false,false]);
  expect(w.findComponent(PolicyFields).exists()).toBe(true);
  expect(model.value.clientCoverages.find(c=>c.clientIndex===1)).toMatchObject({confirmed:false,primary:{memberId:'EDITED'}});
  w.unmount();
 });
 it('requires a new office agreement and removes prior commercial details on Self-Pay, then persists only the new agreement',async()=>{
  const model=ref({payerChoice:'insurance',primary:{insurerName:'Aetna',memberId:'STALE',subscriberName:'QA Parent'},hasSecondary:false,clientCoverages:[{clientIndex:0,confirmed:true}],authorizationAgreed:true,authorizationSignature:'QA Parent',authorizationSignedAt:'2026-11-01T17:00:00Z'});
  const Host=defineComponent({setup:()=>()=>h(Combined,{insuranceInfo:model.value,clientNames:['One QA'],guardianName:'QA Parent',paymentInfo:{paymentChoice:'later'},'onUpdate:insuranceInfo':v=>model.value=v})});
  const w=mount(Host);await flushPromises();
  await w.findAll('button').find(b=>b.text().startsWith('Self-Pay')).trigger('click');await flushPromises();
  expect(model.value.primary).toEqual({insurerName:'Self-Pay',isMedicaid:false});
  expect(model.value).toMatchObject({isSelfPay:true,authorizationAgreed:false,authorizationSignature:''});
  expect(w.find('.pi-ip-auth-check input').element.checked).toBe(false);
  expect(w.find('.pi-ip-sign input').element.value).toBe('');
  expect(w.findComponent(Combined).vm.validateAuthorization()).toBe(false);
  await w.find('.pi-ip-auth-check input').setValue(true);await w.find('.pi-ip-sign input').setValue('QA New');await flushPromises();
  expect(w.findComponent(Combined).vm.validateAuthorization()).toBe(true);
  expect(model.value.authorizationSignature).toBe('QA New');expect(JSON.stringify(model.value)).not.toContain('STALE');
  w.unmount();
 });
 it('ignores insurance upload results arriving after the parent switched to Self-Pay',async()=>{
  let resolveUpload;api.post.mockImplementationOnce(()=>new Promise(resolve=>{resolveUpload=resolve;}));
  const model=ref({payerChoice:'insurance',primary:{insurerName:'Aetna',memberId:'STALE',subscriberName:'QA Parent'},clientCoverages:[{clientIndex:0,confirmed:true}]});
  const Host=defineComponent({setup:()=>()=>h(Combined,{insuranceInfo:model.value,publicKey:'qa-key',submissionId:1110,clientNames:['One QA'],guardianName:'QA Parent','onUpdate:insuranceInfo':v=>model.value=v})});
  const w=mount(Host);await flushPromises();
  const input=w.find('.pi-ins input[type="file"]');
  Object.defineProperty(input.element,'files',{value:[new File(['fictional'],'QA-card.pdf',{type:'application/pdf'})],configurable:true});
  await input.trigger('change');await flushPromises();expect(resolveUpload).toBeTypeOf('function');
  await w.findAll('button').find(b=>b.text().startsWith('Self-Pay')).trigger('click');await flushPromises();
  resolveUpload({data:{urls:{primary_front_url:'/private/qa-card'},extracted:{primary:{insurerName:'Aetna',memberId:'LATE'}}}});await flushPromises();
  expect(model.value.primary).toEqual({insurerName:'Self-Pay',isMedicaid:false});
  expect(JSON.stringify(model.value)).not.toContain('LATE');w.unmount();api.post.mockReset();
 });
 it('keeps separately declared Medicaid protective while its edited policy awaits confirmation',async()=>{
  const model=ref({payerChoice:'insurance',primary:{insurerName:'Commercial',memberId:'PRIMARY'},clientCoverages:[{clientIndex:0,confirmed:true,primary:{insurerName:'Medicaid',isMedicaid:true,memberId:'OLD'}}]});
  const Host=defineComponent({setup:()=>()=>h(Combined,{insuranceInfo:model.value,clientNames:['One QA'],'onUpdate:insuranceInfo':v=>model.value=v})});
  const w=mount(Host);await flushPromises();
  w.findComponent(PolicyFields).vm.$emit('update:modelValue',{insurerName:'Medicaid',isMedicaid:true,memberId:'EDITED'});await flushPromises();
  expect(model.value.clientCoverages[0].confirmed).toBe(false);
  expect(w.findAll('button').some(b=>b.text().startsWith('Self-Pay'))).toBe(false);
  expect(w.text()).not.toContain('How would you like to pay?');expect(w.find('[data-card-form]').exists()).toBe(false);w.unmount();
 });
 it('clears standalone files, previews and pending upload results when a controlled payer change selects Self-Pay',async()=>{
  let finish;api.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const model=ref({primary:{insurerName:'Commercial',memberId:'OLD'},primary_front_url:'/old-card',photos:{primary_front_preview:'data:image/png;base64,OLD'}});const selfPay=ref(false);
  const Host=defineComponent({setup:()=>()=>h(Insurance,{modelValue:model.value,externalSelfPay:selfPay.value,publicKey:'qa-key',submissionId:1110,clientNames:['One QA'],'onUpdate:modelValue':v=>model.value=v})});
  const w=mount(Host);await flushPromises();
  const field=w.find('input[type="file"]');Object.defineProperty(field.element,'files',{configurable:true,value:[new File(['fictional'],'QA-card.pdf',{type:'application/pdf'})]});
  await field.trigger('change');await flushPromises();selfPay.value=true;await flushPromises();
  await w.findComponent(Insurance).vm.awaitPhotoUploads();
  expect(w.findComponent(Insurance).vm.getPhotoFiles().primary_front).toBeNull();
  expect(model.value.primary_front_url).toBeNull();expect(model.value.photos.primary_front_preview).toBe('');
  finish({data:{urls:{primary_front_url:'/LATE'},extracted:{primary:{insurerName:'Commercial',memberId:'LATE'}}}});await flushPromises();
  expect(model.value.primary.insurerName).toBe('Self-Pay');expect(JSON.stringify(model.value)).not.toContain('LATE');w.unmount();api.post.mockReset();
 });
 it('clears a combined office signature when parent state is invalidated instead of merging the old local artifact back in',async()=>{
  const w=mountForm({insuranceInfo:{isSelfPay:true,authorizationAgreed:true,authorizationSignature:'QA Old',authorizationSignatureData:drawn}});
  await w.setProps({insuranceInfo:{isSelfPay:true,authorizationAgreed:false,authorizationSignature:'',authorizationSignatureData:'',authorizationSignedAt:null}});await flushPromises();
  expect(w.find('.pi-ip-auth-check input').element.checked).toBe(false);expect(w.find('.pi-ip-sign input').element.value).toBe('');
  expect(w.vm.validateAuthorization()).toBe(false);expect(w.vm.getInsuranceEntryState().authorizationSignatureData).toBe('');w.unmount();
 });
});

it.each(['en','es'])('blocks duplicate sibling Medicaid IDs before leaving insurance and permits correction (%s)', async language => {
 const model=ref({primary:{insurerName:'Medicaid',isMedicaid:true},medicaidByClient:[{clientIndex:0,memberId:'SAME'},{clientIndex:1,memberId:' same '}],clientCoverages:[{clientIndex:0,confirmed:true},{clientIndex:1,confirmed:true}]});
 const Host=defineComponent({setup:()=>()=>h(Insurance,{modelValue:model.value,clientNames:['One QA','Two QA'],'onUpdate:modelValue':v=>model.value=v})});
 const w=mount(Host,{global:{provide:{intakeLocale:ref(language)}}});await flushPromises();
 const step=w.findComponent(Insurance);
 expect(step.vm.validateCoverageConfirmations()).toBe(false);await flushPromises();
 expect(w.text()).toContain(language==='es'?'Cada cliente debe tener su propio':'Each client must have their own');
 await w.findAll('.pi-ins-multi-client input')[1].setValue('TWO');
 for(const field of w.findAll('section.pi-ins-claim-details > label.checkbox-row input')) await field.setValue(true);
 expect(step.vm.validateCoverageConfirmations()).toBe(true);w.unmount();
});
it('retains IDs when Back mounts before child labels and when saved progress arrives after mounting',async()=>{
 const model=ref({primary:{insurerName:'Medicaid',isMedicaid:true},medicaidByClient:[{clientIndex:0,memberId:'FIRST'},{clientIndex:1,memberId:'SECOND'}]});
 const names=ref([]);
 const Host=defineComponent({setup:()=>()=>h(Insurance,{modelValue:model.value,clientNames:names.value,'onUpdate:modelValue':v=>model.value=v})});
 const w=mount(Host);await flushPromises();
 expect(model.value.medicaidByClient.map(row=>row.memberId)).toEqual(['FIRST','SECOND']);
 names.value=['One QA','Two QA'];await flushPromises();
 expect(w.findAll('.pi-ins-multi-client input').map(field=>field.element.value)).toEqual(['FIRST','SECOND']);
 model.value={...model.value,medicaidByClient:[{clientIndex:0,memberId:'RESTORED-ONE'},{clientIndex:1,memberId:'RESTORED-TWO'}]};await flushPromises();
 expect(w.findAll('.pi-ins-multi-client input').map(field=>field.element.value)).toEqual(['RESTORED-ONE','RESTORED-TWO']);
 w.unmount();
});
