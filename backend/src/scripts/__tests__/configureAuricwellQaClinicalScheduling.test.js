import { describe, expect, it, vi } from 'vitest';
import { configureQaClinicalScheduling, plan } from '../configureAuricwellQaClinicalScheduling.mjs';

function fixture(overrides={}) {
  const providers=[
    {id:1433,email:'qa.provider.auricwell@example.com',role:'provider',is_demo:1},
    {id:1438,email:'qa.provider.supervisor.auricwell@example.com',role:'provider',is_demo:1},
    {id:1439,email:'qa.provider.supervisee.auricwell@example.com',role:'provider',is_demo:1}];
  const values={agency:{id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders:providers.map(({id,email})=>({id,email}))}}},
    selfPay:{self_pay_only:1},providers,school:{id:451,name:'Cedar Grove'},
    services:plan.codes.map((service_code,index)=>({id:index+1,service_code,billing_method:'self_pay',price_cents:null,cancellation_policy_id:null})),
    feeSource:{id:287,agency_id:450,billing_method:'self_pay',price_cents:12000,cancellation_policy_id:3},
    sourceRates:[{rate_cents:12000,rate_unit:'session'}],targetRates:[],
    feePolicy:{id:3,agency_id:450,notice_hours:24,late_fee_cents:8000,no_show_fee_cents:10000,is_active:1},
    locations:[{id:91,place_of_service:'03',billing_office_location_id:9}],office:{id:9},
    draft:{id:285,user_id:1433,agency_id:450,client_id:2277,clinical_session_id:159,date_of_service:'2026-10-19',service_code:'90837',archived_at:null,input_text:'Retained authored content',output_json:'{"retained":true}'},
    appointments:[{id:84,clinical_session_id:140,service_code:'PRO_BONO_SERVICE'}],sessions:[{id:140,appointment_id:84}],notes:[],...overrides};
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),execute:vi.fn(async(sql,args)=>{
    if(sql.includes('FROM agencies WHERE id=450')) return [[values.agency].filter(Boolean)];
    if(sql.includes('FROM agency_self_pay_settings')) return [[values.selfPay].filter(Boolean)];
    if(sql.includes('FROM users u')) return [values.providers];
    if(sql.includes('FROM agencies a JOIN agency_schools')) return [[values.school].filter(Boolean)];
    if(sql.includes('FROM tenant_services WHERE id=287')) return [[values.feeSource].filter(Boolean)];
    if(sql.includes('FROM tenant_services')) return [values.services];
    if(sql.includes('FROM self_pay_service_rates')&&sql.includes('tenant_service_id=287')) return [values.sourceRates];
    if(sql.includes('FROM self_pay_service_rates')) return [values.targetRates];
    if(sql.includes('FROM booking_cancellation_policies')) return [[values.feePolicy].filter(Boolean)];
    if(sql.startsWith('UPDATE tenant_services')) {
      const service=values.services.find(row=>Number(row.id)===Number(args[2]));
      if(service.price_cents==null) service.price_cents=args[0];
      if(service.cancellation_policy_id==null) service.cancellation_policy_id=args[1];
      return [{affectedRows:1}];
    }
    if(sql.startsWith('INSERT INTO self_pay_service_rates')) {values.targetRates.push({tenant_service_id:args[0],rate_cents:args[1],rate_unit:args[2]});return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO staff_service_assignments')) return [{affectedRows:1}];
    if(sql.includes('FROM agency_service_locations')) return [values.locations];
    if(sql.includes('FROM office_locations')) return [[values.office].filter(Boolean)];
    if(sql.startsWith('INSERT INTO agency_service_locations')) return [{insertId:92}];
    if(sql.includes('FROM clinical_note_drafts')) return [[values.draft].filter(Boolean)];
    if(sql.includes('FROM appointments a')) return [values.appointments];
    if(sql.startsWith('UPDATE clinical_note_drafts')) return [{affectedRows:1}];
    throw Error(`Unexpected main database operation: ${sql}`);
  })};
  const clinical={beginTransaction:vi.fn(),rollback:vi.fn(),execute:vi.fn(async sql=>{
    if(sql.includes('FROM clinical_sessions')) return [values.sessions];
    if(sql.includes('FROM clinical_notes')) return [values.notes];
    throw Error(`Unexpected clinical database operation: ${sql}`);
  })};
  return {db,clinical,values};
}
const mutations=db=>db.execute.mock.calls.filter(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql));
describe('explicit synthetic QA clinical scheduling repair',()=>{
 it('assigns only the fixed synthetic provider roster and leaves the service-mismatched note intact',async()=>{
  const {db,clinical,values}=fixture();const original=structuredClone(values.draft);
  const result=await configureQaClinicalScheduling(db,clinical);
  expect(result).toMatchObject({agencyId:450,assignments:27,repairedDraft:false,pendingDraftReason:expect.stringContaining('different services')});
  expect(values.draft).toEqual(original);
  expect(clinical.execute).not.toHaveBeenCalled();
  const assignmentWrites=mutations(db).filter(([sql])=>sql.startsWith('INSERT INTO staff_service_assignments'));
  expect(assignmentWrites).toHaveLength(27);
  expect(assignmentWrites.every(([sql,args])=>sql.includes('VALUES(450,?,?,1)') && plan.providerIds.includes(args[1]))).toBe(true);
  expect(result).toMatchObject({inheritedRateCount:9,inheritedPolicyCount:9,inheritedRateCents:12000,inheritedRateUnit:'session'});
  expect(db.commit).toHaveBeenCalledOnce();
 });
 it.each([
  {agency:{id:449,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}}},
  {agency:{id:450,slug:'itsco',feature_flags:{qaSandbox:{syntheticOnly:true}}}},
  {agency:{id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:false}}}},
  {selfPay:{self_pay_only:0}}
 ])('fails closed outside the isolated self-pay demo: %j',async override=>{
  const {db,clinical}=fixture(override);await expect(configureQaClinicalScheduling(db,clinical)).rejects.toThrow();
  expect(mutations(db)).toHaveLength(0);expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
 });
 it('rejects a duplicate provider membership masquerading as the fixed three-person roster',async()=>{
  const {db,clinical,values}=fixture();values.providers=[values.providers[0],values.providers[0],values.providers[2]];
  await expect(configureQaClinicalScheduling(db,clinical)).rejects.toThrow('provider roster');expect(mutations(db)).toHaveLength(0);
 });
 it.each(['duplicate','insurance'])('rejects an incomplete or non-self-pay service set (%s)',async variant=>{
  const {db,clinical,values}=fixture();
  if(variant==='duplicate') values.services[1]={...values.services[0]};else values.services[0].billing_method='insurance';
  await expect(configureQaClinicalScheduling(db,clinical)).rejects.toThrow('self-pay services');expect(mutations(db)).toHaveLength(0);
 });
 it.each([{school:null},{locations:[{id:91,place_of_service:'11',billing_office_location_id:9}]},{locations:[{id:91,place_of_service:'03',billing_office_location_id:99}]}])('rolls back for a changed school or location',async override=>{
  const {db,clinical}=fixture(override);await expect(configureQaClinicalScheduling(db,clinical)).rejects.toThrow();
  expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
 });
 it('creates only the known school location after checking demo billing-office membership',async()=>{
  const {db,clinical}=fixture({locations:[]});const result=await configureQaClinicalScheduling(db,clinical);
  expect(result.schoolServiceLocationId).toBe(92);
  const [sql,args]=mutations(db).find(([statement])=>statement.startsWith('INSERT INTO agency_service_locations'));
  expect(sql).toContain("VALUES(450,?,'03',451,9");expect(args).toEqual(['Cedar Grove']);
  const denied=fixture({locations:[],office:null});await expect(configureQaClinicalScheduling(denied.db,denied.clinical)).rejects.toThrow('demo billing office');
 });
 it('relinks only the known unsigned matching-service draft, keeping text and signatures untouched',async()=>{
  const {db,clinical,values}=fixture({appointments:[{id:84,clinical_session_id:140,service_code:'90837'}]});
  const original=structuredClone(values.draft);const result=await configureQaClinicalScheduling(db,clinical);
  expect(result.repairedDraft).toBe(true);expect(values.draft).toEqual(original);
  const [sql,args]=mutations(db).find(([statement])=>statement.startsWith('UPDATE clinical_note_drafts'));
  expect(sql).toBe('UPDATE clinical_note_drafts SET clinical_session_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=285 AND agency_id=450 AND user_id=1433');expect(args).toEqual([140]);
  expect(clinical.execute.mock.calls.every(([statement])=>statement.startsWith('SELECT')&&statement.endsWith('FOR UPDATE'))).toBe(true);
  expect(clinical.beginTransaction).toHaveBeenCalledOnce();expect(clinical.rollback).toHaveBeenCalledOnce();
 });
 it('refuses a signed session and releases the clinical read locks without changing the draft',async()=>{
  const {db,clinical}=fixture({appointments:[{id:84,clinical_session_id:140,service_code:'90837'}],notes:[{id:1,provider_signed_at:'2026-10-30 12:00:00'}]});
  await expect(configureQaClinicalScheduling(db,clinical)).rejects.toThrow('been signed');
  expect(mutations(db).some(([sql])=>sql.startsWith('UPDATE clinical_note_drafts'))).toBe(false);
  expect(db.rollback).toHaveBeenCalledOnce();expect(clinical.rollback).toHaveBeenCalledOnce();
 });
 it('refuses an unexpected canonical visit or changed draft session',async()=>{
  const changed=fixture({appointments:[{id:84,clinical_session_id:999,service_code:'90837'}]});
  await expect(configureQaClinicalScheduling(changed.db,changed.clinical)).rejects.toThrow('appointment changed');
  const moved=fixture();moved.values.draft.clinical_session_id=999;
  await expect(configureQaClinicalScheduling(moved.db,moved.clinical)).rejects.toThrow('draft changed');
 });
 it('fills only missing standard self-pay rates/policies and preserves configured target terms, including zero-dollar rates',async()=>{
  const {db,clinical,values}=fixture({targetRates:[{tenant_service_id:2,rate_cents:0,rate_unit:'session'}]});
  values.services[0].price_cents=8500;values.services[0].cancellation_policy_id=99;
  values.services[1].cancellation_policy_id=3;
  values.services[2].price_cents=0;
  const result=await configureQaClinicalScheduling(db,clinical);
  expect(result).toMatchObject({inheritedRateCount:6,inheritedPolicyCount:7});
  expect(values.services[0]).toMatchObject({price_cents:8500,cancellation_policy_id:99});
  expect(values.services[1]).toMatchObject({price_cents:null,cancellation_policy_id:3});
  expect(values.services[2]).toMatchObject({price_cents:0,cancellation_policy_id:3});
  const rateWrites=mutations(db).filter(([sql])=>sql.startsWith('INSERT INTO self_pay_service_rates'));
  expect(rateWrites).toHaveLength(6);expect(rateWrites.every(([sql,args])=>sql.includes('VALUES(450,?,0,?,?,1435)')&&![1,2,3].includes(args[0])&&args[1]===12000&&args[2]==='session')).toBe(true);
  const catalogWrites=mutations(db).filter(([sql])=>sql.startsWith('UPDATE tenant_services'));
  expect(catalogWrites.every(([sql,args])=>sql.includes('WHERE agency_id=450')&&plan.codes.includes(args[3]))).toBe(true);
  expect(catalogWrites.some(([,args])=>[1,2].includes(args[2]))).toBe(false);
 });
 it('is idempotent after the missing fee/policy values have been inherited',async()=>{
  const {db,clinical}=fixture();await configureQaClinicalScheduling(db,clinical);db.execute.mockClear();
  const second=await configureQaClinicalScheduling(db,clinical);
  expect(second).toMatchObject({inheritedRateCount:0,inheritedPolicyCount:0});
  expect(mutations(db).filter(([sql])=>sql.startsWith('UPDATE tenant_services')||sql.startsWith('INSERT INTO self_pay_service_rates'))).toHaveLength(0);
 });
 it.each([
  {feeSource:null},
  {feeSource:{id:287,agency_id:99,billing_method:'self_pay',price_cents:12000,cancellation_policy_id:3}},
  {sourceRates:[{rate_cents:15000,rate_unit:'session'}]},
  {sourceRates:[{rate_cents:12000,rate_unit:'hour'}]},
  {feePolicy:{id:3,agency_id:99,notice_hours:24,late_fee_cents:8000,no_show_fee_cents:10000,is_active:1}},
  {feePolicy:{id:3,agency_id:450,notice_hours:24,late_fee_cents:8000,no_show_fee_cents:10000,is_active:0}},
  {feePolicy:{id:3,agency_id:450,notice_hours:24,late_fee_cents:0,no_show_fee_cents:10000,is_active:1}}
 ])('refuses changed or foreign source pricing/cancellation terms: %j',async overrides=>{
  const {db,clinical}=fixture(overrides);
  await expect(configureQaClinicalScheduling(db,clinical)).rejects.toThrow();
  expect(mutations(db)).toHaveLength(0);expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledOnce();
 });
 it('can inherit the existing catalog session rate when the generic service has no agency override',async()=>{
  const {db,clinical}=fixture({sourceRates:[]});
  const result=await configureQaClinicalScheduling(db,clinical);
  expect(result).toMatchObject({inheritedRateCents:12000,inheritedRateUnit:'session'});
 });
});
