import {mount} from '@vue/test-utils';import {it,expect} from 'vitest';
import Fields from '../InsurancePolicyFields.vue';
const patient={firstName:'Jordan',lastName:'Example',dateOfBirth:'2023-09-20'};
const payers=[{id:13,name:'CHAMPVA - HAC',names:['CHAMPVA'],payerId:'84146',eligibilityPayerId:'84146',isMedicaid:false},{id:19,name:'Colorado Community Health Alliance',names:['Colorado Medicaid'],payerId:'COCHA',eligibilityPayerId:'SKCO0',isMedicaid:true}];
it('selects the configured carrier with both routes, instead of independently editable payer fields',async()=>{
 const w=mount(Fields,{props:{modelValue:{memberId:'SYNTHETIC',isMedicaid:true},patient,payers,requireComplete:false}});
 const carrier=w.findAll('label').find(l=>l.text().startsWith('Insurance carrier'));
 expect(carrier.find('input').exists()).toBe(false);await carrier.get('select').setValue('13');
 expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({memberId:'SYNTHETIC',payerCatalogId:'13',insurerName:'CHAMPVA - HAC',payerId:'84146',eligibilityPayerId:'84146',isMedicaid:false});w.unmount();
});
it('flags a parent Medicaid subscriber, uses the child for verification and retains the written holder',async()=>{
 const policy={insurerName:'Colorado Medicaid',isMedicaid:true,memberId:'A123456',paperSubscriberName:'Morgan Example',subscriberFirstName:'Morgan',subscriberLastName:'Example',relationshipToSubscriber:'child'};
 const w=mount(Fields,{props:{modelValue:policy,patient,payers,requireComplete:false}});expect(w.get('[role="alert"]').text()).toContain('different Medicaid holder');
 await w.get('[role="alert"] button').trigger('click');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({memberId:'A123456',paperSubscriberName:'Morgan Example',relationshipToSubscriber:'self',subscriberFirstName:'Jordan',subscriberDob:'2023-09-20'});w.unmount();
});
