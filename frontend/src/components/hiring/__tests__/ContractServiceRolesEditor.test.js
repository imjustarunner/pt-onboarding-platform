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
  it('shows a sourced activity beside its code without treating a named instrument as authorization',()=>{
    const wrapper=mount(Roles,{props:{modelValue:{serviceRoles:['psychological_testing']},options:[{id:'psychological_testing',title:'Testing',codeGuide:[{code:'96136',payBucket:'Direct Care Rate',basis:'Actual minutes ÷ 60',example:{activity:'QHP administration of two or more tests',notThis:'Not technician work',sourceTitle:'APA published clinical example',sourcePage:4,sourceUrl:'https://www.molinahealthcare.com/example.pdf#page=4'}}]}]}});
    expect(wrapper.get('table').text()).toContain('QHP administration of two or more tests');
    expect(wrapper.get('table a').attributes('href')).toBe('https://www.molinahealthcare.com/example.pdf#page=4');expect(wrapper.text()).toContain('Not technician work');
    expect(wrapper.text()).toContain('excluded from the generated contract');wrapper.unmount();
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

describe('NLU employee category and level',()=>{
 const policy={tutoring:{category1:[17,18,19,20,20],category2Virtual:[18,20,21,25,30],category2InPerson:[19,21,23,27,33],category3:[24,24,24,26,26],category4:[28,28,28,30,30]},childcare:{category1:[17,18,19,20,20],category2AndAbove:[22,23,24,24,24],additionalChildAmounts:[0,4,6,8]}};
 it('resolves tutoring and childcare from one employee placement and updates when that level changes',async()=>{
  const wrapper=mount(Roles,{props:{categoryPlacement:true,compensationCategory:2,compensationLevel:3,serviceCompensation:policy,modelValue:{serviceRoles:['tutoring','childcare']}}});
  expect(wrapper.text()).toContain('Virtual: $21.00/hour · In person: $23.00/hour');
  expect(wrapper.get('[data-testid="childcare-resolved-4"]').text()).toBe('$32.00');
  expect(wrapper.find('select[aria-label="Approved tutoring pay level"]').exists()).toBe(false);
  await wrapper.setProps({compensationLevel:4});
  expect(wrapper.text()).toContain('Virtual: $25.00/hour · In person: $27.00/hour');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();wrapper.unmount();
 });
 it.each([[3,26],[4,30]])('resolves approved Category %i tutoring without a separate rate selection', (category,rate)=>{
  const wrapper=mount(Roles,{props:{categoryPlacement:true,compensationCategory:category,compensationLevel:4,serviceCompensation:policy,modelValue:{serviceRoles:['tutoring']}}});
  expect(wrapper.text()).toContain(`Virtual: $${rate}.00/hour · In person: $${rate}.00/hour`);
  expect(wrapper.get('details').attributes('open')).toBeUndefined();wrapper.unmount();
 });
 it('retains existing per-service placements and all four individual childcare overrides',()=>{
  const wrapper=mount(Roles,{props:{categoryPlacement:true,compensationCategory:2,compensationLevel:5,serviceCompensation:policy,modelValue:{serviceRoles:['tutoring','childcare'],serviceRoleDetails:{tutoring:{payLevel:2,hourlyRate:34.5},childcare:{payLevel:1,ratesByBand:{1:29,2:33,3:35,4:37}}}}}});
  expect(wrapper.text()).toContain('Virtual: $34.50/hour · In person: $34.50/hour');
  expect(wrapper.get('[data-testid="childcare-resolved-4"]').text()).toBe('$37.00');
  expect(wrapper.findAll('details')[0].attributes()).toHaveProperty('open');wrapper.unmount();
 });
 it('shows resolved testing rates and keeps optional individual narratives collapsed',()=>{
  const wrapper=mount(Roles,{props:{categoryPlacement:true,compensationCategory:3,compensationLevel:2,payProfile:{creditRate:44,hcodeRate:32,indirectRate:22},modelValue:{serviceRoles:['psychological_testing']}}});
  expect(wrapper.get('table').text()).toContain('$44.00');expect(wrapper.get('table').text()).toContain('$32.00');
  expect(wrapper.text()).not.toContain('Approved testing assignment and supervision — required');
  expect(wrapper.text()).toContain('verified separately before testing work');
  expect(wrapper.get('details').attributes('open')).toBeUndefined();wrapper.unmount();
 });
 it('selects a supervisor by ID independently of the countersigner and existing contract text',async()=>{
  const wrapper=mount(Editor,{props:{categoryPlacement:true,supervisorUserId:null,supervisorOptions:[{id:17,first_name:'QA',last_name:'Supervisor'}],modelValue:{schedule:'Tuesdays',supervisorName:'Old free text'}}});
  await wrapper.get('#prehire-supervisor select').setValue('17');
  expect(wrapper.emitted('update:supervisorUserId').at(-1)).toEqual([17]);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();expect(wrapper.text()).toContain('does not make them a supervisor');wrapper.unmount();
 });
});
