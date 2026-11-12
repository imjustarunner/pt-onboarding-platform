import {describe,it,expect} from 'vitest';
import {contractAgreementBuilder} from '../contractAgreementBuilder.service.js';
const configs=[{id:32,slug:'plotline_starter_v1_hourly',pay_mode:'hourly',is_active:0},{id:33,slug:'plotline_starter_v1_ffs',pay_mode:'ffs',is_active:0}];
describe('agency employment agreements',()=>{
 it('offers one NLU service-based agreement without an hourly/FFS decision',()=>{
  const builder=contractAgreementBuilder({agency:{slug:'nlu'},configs,tokens:{ROLE_LABEL:'Facilitator'}});
  expect(builder.compensationBasis).toBe('category_service');
  expect(builder.options).toEqual([{value:'employment',label:'Employment agreement',configId:32,roleLabel:'Facilitator',requiresApproval:true}]);
 });
 it('prefers approved agency terms when available and leaves stored configurations untouched',()=>{
  const saved=[configs[0],{...configs[1],is_active:1}];const before=structuredClone(saved);
  expect(contractAgreementBuilder({agency:{slug:'nlu'},configs:saved}).options[0]).toMatchObject({configId:33,requiresApproval:false});expect(saved).toEqual(before);
 });
 it('keeps Inner Strength on individual terms and ITSCO on its existing role presets',()=>{
  expect(contractAgreementBuilder({agency:{slug:'tisi'},configs}).compensationBasis).toBe('individual_agreement');
  const itsco=contractAgreementBuilder({agency:{slug:'itsco'},configs:[{id:6,slug:'itsco_licensed_ffs',is_active:1}]});
  expect(itsco.options.map(o=>o.value)).toEqual(['provider','facilitator','student']);expect(itsco.options[0].configId).toBe(6);
 });
 it('does not invent a configuration when the agency has no standard terms',()=>{
  expect(contractAgreementBuilder({agency:{slug:'nlu'}}).options[0].configId).toBeNull();
  expect(contractAgreementBuilder({agency:{slug:'other'},configs})).toBeNull();
 });
});
