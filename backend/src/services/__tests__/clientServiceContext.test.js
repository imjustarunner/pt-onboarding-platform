import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { readClientServiceContext, requireClientServiceKind, assertAppointmentServiceContext, filterBookingServicesForClient, clinicalCodesForClientContext, attachRosterServiceContexts } from '../clientServiceContext.service.js';
const clinical = { id: 11, businessType: 'mental_health', serviceCode: '90837' };
const tutoring = { id: 12, businessType: 'tutoring', serviceCode: 'TUTORING' };
const consultation = { id: 13, businessType: 'consulting', serviceCode: 'CONSULT' };
function database(enrollments = [], clientType = 'clinical') {
 return { execute: vi.fn(async (sql, args) => {
  if (sql.startsWith('SELECT c.id')) return [[{ id: args[0], agency_id:2, client_type: clientType }]];
  return [enrollments.filter(row => !row.agency_id || row.agency_id === args[1])];
 }) };
}
const row = (kind, provider = 8, extra = {}) => ({ service_kind: kind, provider_user_id: provider, is_active: 1, service_status: 'active', ...extra });
const input = { agencyId: 2, clientId: 7, providerId: 8 };
describe('client agency and service context', () => {
 it('uses explicit tutoring enrollment over a legacy Clinical identifier and exposes no psychotherapy codes', async () => {
  const db = database([row('tutoring')]);
  expect(await filterBookingServicesForClient([clinical, tutoring, consultation], input, db)).toEqual([tutoring]);
  expect(await clinicalCodesForClientContext([{code:'90837'}], {...input,clientIds:[7]}, db)).toEqual([]);
  await expect(requireClientServiceKind({...input,clientIds:[7],serviceKind:'counseling'},db)).rejects.toMatchObject({code:'CLIENT_SERVICE_CONTEXT_MISMATCH'});
 });
 it('separates consultation in one agency from counseling in another for the same provider and client', async () => {
  const db = database([row('consultation',8,{agency_id:2}),row('counseling',8,{agency_id:3})]);
  expect(await filterBookingServicesForClient([clinical,consultation],input,db)).toEqual([consultation]);
  expect(await filterBookingServicesForClient([clinical,consultation],{...input,agencyId:3},db)).toEqual([clinical]);
  await expect(requireClientServiceKind({...input,clientIds:[7],serviceKind:'counseling'},db)).rejects.toMatchObject({status:409});
 });
 it('uses the selected provider and refuses ended services without borrowing another provider’s enrollment', async () => {
  const db = database([row('counseling',9),row('tutoring',8,{is_active:0,service_status:'completed'})]);
  expect((await readClientServiceContext(input,db)).serviceKinds).toEqual([]);
 });
 it('supports both active services for the same agency without collapsing them', async () => {
  const db = database([row('counseling'),row('tutoring')]);
  expect(await filterBookingServicesForClient([clinical,tutoring,consultation],input,db)).toEqual([clinical,tutoring]);
 });
 it('rejects a psychotherapy code or clinical add-on submitted on a tutoring service', async () => {
  const db = database([row('tutoring')]);
  for (const invalid of [{serviceCode:'90837'},{serviceCode:'TUTORING',addonServiceCodes:['90785']}]) {
   await expect(assertAppointmentServiceContext({...input,clientIds:[7],businessType:'tutoring',service:tutoring,...invalid},db)).rejects.toMatchObject({status:409});
  }
  await expect(assertAppointmentServiceContext({...input,clientIds:[7],businessType:'tutoring',service:tutoring,serviceCode:'TUTORING'},db)).resolves.toBeUndefined();
 });
 it('requires every participant to have counseling before showing shared group codes',async()=>{
  const db=database([row('tutoring')]);
  expect(await clinicalCodesForClientContext([{code:'90853'}],{...input,clientIds:[7,9]},db)).toEqual([]);
 });
 it('keeps legacy counseling charts usable while legacy learning charts never inherit counseling codes', async () => {
  expect((await readClientServiceContext(input,database())).serviceKinds).toEqual(['counseling']);
  expect(await clinicalCodesForClientContext([{code:'90837'}],{...input,clientIds:[7]},database([],'learning'))).toEqual([]);
 });
 it('rejects a client outside the selected agency before reading enrollments', async () => {
  const db={execute:vi.fn(async()=>[[]])};
  await expect(readClientServiceContext(input,db)).rejects.toMatchObject({status:404});
  expect(db.execute).toHaveBeenCalledTimes(1);
 });
 it('scopes optional roster service detail to the authorized IDs, agencies and provider', async () => {
  const db={execute:vi.fn(async()=>[[{client_id:7,agency_id:2,service_kind:'tutoring'}]])};
  const result=await attachRosterServiceContexts([{id:7}],{agencyIds:[2],providerId:8},db);
  expect(result[0].service_contexts).toEqual([{client_id:7,agency_id:2,service_kind:'tutoring'}]);
  expect(db.execute.mock.calls[0][1]).toEqual([7,2,8]);
  expect(db.execute.mock.calls[0][0]).toContain('ca.is_active=1');
 });
});


it('labels the configured tutoring product with this student’s assigned Math/Reading enrollment, excluding another tutor',async()=>{
 const db=database([row('tutoring',8,{id:1038,label:'Tutoring — Math'}),row('tutoring',9,{id:1039,label:'Other tutor Reading'})]);
 const services=await filterBookingServicesForClient([tutoring],input,db);expect(services).toEqual([{...tutoring,enrollmentLabel:'Tutoring — Math'}]);expect(services[0].serviceCode).toBe('TUTORING');expect(services[0].id).toBe(tutoring.id);
});

it('never inherits a primary clinical classification into a linked agency without a service assignment',async()=>{
 expect((await readClientServiceContext({...input,agencyId:3},database())).serviceKinds).toEqual([]);
});
