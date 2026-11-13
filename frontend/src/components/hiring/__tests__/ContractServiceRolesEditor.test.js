import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Roles from '../ContractServiceRolesEditor.vue';
import Editor from '../../careers/ContractExpectationsEditor.vue';

describe('contract role clause selections',()=>{
  it('shows the applied-job selections and each addable role before preview',()=>{
    const wrapper=mount(Roles,{props:{modelValue:{serviceRoles:['tutoring','childcare']},source:'Posting contract defaults',allowInference:false}});
    expect(wrapper.findAll('input[type=checkbox]')).toHaveLength(5);
    expect(wrapper.get('[data-role-id=tutoring]').element.checked).toBe(true);
    expect(wrapper.get('[data-role-id=childcare]').element.checked).toBe(true);
    expect(wrapper.get('[data-role-id=psychotherapy]').element.checked).toBe(false);
    expect(wrapper.text()).toContain('Posting contract defaults');
    expect(wrapper.text()).toContain('required before generation');
    expect(wrapper.text()).toContain('does not grant a license');
    wrapper.unmount();
  });
  it('adds psychotherapy independently without losing selected tutoring or other terms',async()=>{
    const wrapper=mount(Roles,{props:{modelValue:{serviceRoles:['tutoring'],schedule:'Mondays'},allowInference:false}});
    await wrapper.get('[data-role-id=psychotherapy]').setValue(true);
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({serviceRoles:['tutoring','psychotherapy'],schedule:'Mondays'});
    wrapper.unmount();
  });
  it('captures testing compensation and direct-supervision details separately',async()=>{
    const wrapper=mount(Roles,{props:{modelValue:{serviceRoles:['psychological_testing']}}});
    const fields=wrapper.findAll('textarea');
    expect(fields).toHaveLength(2);
    await fields[0].setValue('Administration $32/hour; evaluation $44/hour; indirect $22/hour.');
    expect(wrapper.emitted('update:modelValue').at(-1)[0].serviceRoleDetails.psychological_testing.compensationTerms).toContain('$44/hour');
    await fields[1].setValue('Approved instruments A and B; qualified licensee provides direct supervision.');
    expect(wrapper.emitted('update:modelValue').at(-1)[0].serviceRoleDetails.psychological_testing.authorizationTerms).toContain('direct supervision');
    wrapper.unmount();
  });
  it('shows server-provided Testing code buckets and actual-time credits independently of claim units',()=>{
    const wrapper=mount(Roles,{props:{modelValue:{serviceRoles:['psychological_testing']},options:[{id:'psychological_testing',title:'Testing',codeGuide:[{code:'96136',payBucket:'Direct Care Rate',basis:'Actual minutes ÷ 60; 0.5 hour at 30 minutes',testingOnly:true}]}]}});
    expect(wrapper.get('table').text()).toContain('96136');expect(wrapper.get('table').text()).toContain('Direct Care Rate');
    expect(wrapper.text()).toContain('Medicaid-only');expect(wrapper.text()).toContain('claim unit does not automatically earn a full clinical credit');
    expect(wrapper.findAll('textarea')).toHaveLength(2);wrapper.unmount();
  });
  it('retains an explicit empty posting selection and offers a separate return to inference',async()=>{
    const wrapper=mount(Roles,{props:{modelValue:{serviceRoles:[],schedule:'Fridays'}}});
    expect(wrapper.findAll('input').every(input=>!input.element.checked)).toBe(true);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({schedule:'Fridays'});
    wrapper.unmount();
  });
  it('records a separate approved childcare level without replacing the organizational level',async()=>{
    const wrapper=mount(Roles,{props:{modelValue:{serviceRoles:['childcare'],compensationLevel:5}}});
    await wrapper.get('select[aria-label="Approved childcare pay level"]').setValue('3');
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({compensationLevel:5,serviceRoleDetails:{childcare:{payLevel:'3'}}});
    wrapper.unmount();
  });
  it('saves role selections alongside the posting’s other expectations',async()=>{
    const wrapper=mount(Editor,{props:{modelValue:{schedule:'Mondays',serviceRoles:['tutoring']}}});
    await wrapper.get('[data-role-id=childcare]').setValue(true);
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({schedule:'Mondays',serviceRoles:['tutoring','childcare']});
    wrapper.unmount();
  });
  it('shows a written-offer reference and separate approved compensation for every ISI role',async()=>{
    const wrapper=mount(Editor,{props:{individualAgreementMode:true,modelValue:{individualCompensationBasis:'approved_individual_agreement',priorAgreementReference:'Approved offer A',serviceRoles:['bachelors_counseling','psychotherapy','tutoring'],additionalDuties:[{description:'Mentoring',payBasis:'custom',customRate:35,rateUnit:'per_hour'}]}}});
    expect(wrapper.text()).toContain('Individual compensation source');
    expect(wrapper.get('input[placeholder^="Identify this person"]').element.value).toBe('Approved offer A');
    expect(wrapper.findAll('.role-details textarea')).toHaveLength(3);
    for(const [index,terms] of ['Support $30/hour.','Psychotherapy $45/credit.','Tutoring $31.25/hour.'].entries()){
      await wrapper.findAll('.role-details textarea')[index].setValue(terms);
      await wrapper.setProps({modelValue:wrapper.emitted('update:modelValue').at(-1)[0]});
    }
    const final=wrapper.props('modelValue');
    expect(final.serviceRoleDetails.bachelors_counseling.compensationTerms).toBe('Support $30/hour.');
    expect(final.serviceRoleDetails.psychotherapy.compensationTerms).toBe('Psychotherapy $45/credit.');
    expect(final.serviceRoleDetails.tutoring.compensationTerms).toBe('Tutoring $31.25/hour.');
    const dutyOptions=wrapper.get('.additional-duty select').findAll('option').map(option=>option.element.value);
    expect(dutyOptions).toEqual(['','custom']);
    wrapper.unmount();
  });
  it('does not expose ISI individual compensation controls for other agencies',()=>{
    const wrapper=mount(Editor,{props:{individualAgreementMode:false,modelValue:{serviceRoles:['tutoring']}}});
    expect(wrapper.find('.individual-compensation').exists()).toBe(false);
    expect(wrapper.findAll('.role-details textarea')).toHaveLength(0);
    wrapper.unmount();
  });
});
