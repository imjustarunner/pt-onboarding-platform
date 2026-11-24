import { expect, it, vi } from 'vitest';
import { finishClientCreation } from '../clientCreationOutcome.js';
const args = () => ({ api: { post: vi.fn().mockResolvedValue({ data: { listing: { id: 5 } } }), put: vi.fn().mockResolvedValue({}), get: vi.fn().mockResolvedValue({ data: { provider_id: 9 } }) }, clientId: 12, agencyId: 2, organizationId: 3, providerId: 9 });
it('assigns an office client without requiring a school service day and verifies the result', async () => {
  const a = args(); a.api.get.mockResolvedValueOnce({ data: { provider_id: null } });
  await finishClientCreation({ ...a, outcome: 'assign' });
  expect(a.api.put).toHaveBeenCalledWith('/clients/12/provider', { provider_id: 9 }); expect(a.api.get).toHaveBeenCalledTimes(2);
});
it('keeps a completed assignment on retry and rejects an unconfirmed assignment', async () => {
  const a = args(); await finishClientCreation({ ...a, outcome: 'assign' }); expect(a.api.put).not.toHaveBeenCalled();
  a.api.get.mockResolvedValue({ data: { provider_id: null } });
  await expect(finishClientCreation({ ...a, outcome: 'assign' })).rejects.toThrow('not confirmed');
});
it('uses the school assignment API with Unknown day and makes the provider primary', async () => {
  const a = args(); a.api.get.mockResolvedValueOnce({ data: {} });
  await finishClientCreation({ ...a, outcome: 'assign', isSchool: true });
  expect(a.api.post).toHaveBeenCalledWith('/clients/12/provider-assignments', expect.objectContaining({ service_day: 'Unknown', is_primary: true }));
  expect(a.api.post.mock.calls[0][1].client_alert).toBeUndefined();
});
it('sends a client alert with the assignment only when the assigner wrote one', async () => {
  const a = args(); a.api.get.mockResolvedValueOnce({ data: { provider_id: null } });
  await finishClientCreation({ ...a, outcome: 'assign', clientAlert: '  no contact info  ' });
  expect(a.api.put).toHaveBeenCalledWith('/clients/12/provider', { provider_id: 9, client_alert: 'no contact info' });
});
it('saves unassigned without assignment and posts only the saved client for exchange', async () => {
  const a = args(); await finishClientCreation({ ...a, outcome: 'unassigned' }); expect(a.api.put).not.toHaveBeenCalled(); expect(a.api.post).not.toHaveBeenCalled();
  await finishClientCreation({ ...a, outcome: 'exchange' });
  expect(a.api.post).toHaveBeenCalledWith('/client-exchange/listings', { agencyId: 2, clientId: 12, quickPost: true });
});
it('persists scheduling needs for an unassigned client so one-click posting can reuse them later', async () => {
  const a = args(); const schedule = { days: ['Wednesday'], periods: ['after_school'], windows: [], timezone: 'America/Denver' };
  await finishClientCreation({ ...a, outcome: 'unassigned', schedule });
  expect(a.api.put).toHaveBeenCalledWith('/client-exchange/clients/12/schedule', { agencyId: 2, schedule });
  expect(a.api.post).not.toHaveBeenCalled();
});
it('persists client fit choices before one-click posting and stops when saving fails',async()=>{
 const a=args(),matchingPreferences={specialties:['Depression'],modalities:['EMDR']};
 await finishClientCreation({...a,outcome:'exchange',matchingPreferences});
 expect(a.api.put).toHaveBeenCalledWith('/client-exchange/clients/12/matching-preferences',{agencyId:2,matchingPreferences});expect(a.api.put.mock.invocationCallOrder[0]).toBeLessThan(a.api.post.mock.invocationCallOrder[0]);
 a.api.post.mockClear();a.api.put.mockRejectedValueOnce(new Error('Save failed'));await expect(finishClientCreation({...a,outcome:'exchange',matchingPreferences})).rejects.toThrow('Save failed');expect(a.api.post).not.toHaveBeenCalled();
});

it('assigns a learning provider to the existing learning enrollment and retries without creating a duplicate', async()=>{
  const a=args(), active={id:40,service_kind:'tutoring',organization_id:3,provider_user_id:0,is_active:1,label:'Tutoring'};
  const saved={...active,provider_user_id:9};
  a.api.get.mockResolvedValueOnce({data:{services:[active]}}).mockResolvedValueOnce({data:{services:[saved]}});
  a.api.post.mockResolvedValue({data:{services:[saved]}});
  await finishClientCreation({...a,outcome:'assign',serviceKind:'tutoring'});
  await finishClientCreation({...a,outcome:'assign',serviceKind:'tutoring'});
  expect(a.api.post).toHaveBeenCalledTimes(1);
  expect(a.api.post).toHaveBeenCalledWith('/clients/12/service-enrollments',{agencyId:2,serviceKind:'tutoring',providerUserId:9,organizationId:3,serviceId:40,label:'Tutoring'});
  expect(a.api.put).not.toHaveBeenCalled();
});

it('creates the clinical service even when the chart already shows the same provider, then reuses it on retry',async()=>{
 const a=args(),saved={id:40,service_kind:'counseling',organization_id:0,provider_user_id:9,is_active:1,label:'Counseling'};
 a.api.get.mockResolvedValueOnce({data:{services:[]}}).mockResolvedValueOnce({data:{services:[saved]}});
 a.api.post.mockResolvedValue({data:{services:[saved]}});
 await finishClientCreation({...a,organizationId:2,outcome:'assign',serviceKind:'counseling'});
 await finishClientCreation({...a,organizationId:2,outcome:'assign',serviceKind:'counseling'});
 expect(a.api.post).toHaveBeenCalledOnce();expect(a.api.post).toHaveBeenCalledWith('/clients/12/service-enrollments',{agencyId:2,serviceKind:'counseling',providerUserId:9,organizationId:0,label:'Counseling'});
 expect(a.api.put).not.toHaveBeenCalled();
});
it('fills a vacant clinical service without creating another enrollment',async()=>{
 const a=args(),vacant={id:40,service_kind:'counseling',organization_id:0,provider_user_id:0,is_active:1,label:'Counseling'};
 a.api.get.mockResolvedValue({data:{services:[vacant]}});a.api.post.mockResolvedValue({data:{services:[{...vacant,provider_user_id:9}]}});
 await finishClientCreation({...a,organizationId:2,outcome:'assign',serviceKind:'counseling'});
 expect(a.api.post).toHaveBeenCalledWith('/clients/12/service-enrollments',expect.objectContaining({serviceId:40,providerUserId:9}));
});
it('retains another counselor when adding the selected clinical provider and confirms nested providers',async()=>{
 const a=args(),existing={id:40,service_kind:'counseling',organization_id:0,provider_user_id:8,is_active:1,label:'Counseling'};
 a.api.get.mockResolvedValue({data:{services:[existing]}});a.api.post.mockResolvedValue({data:{services:[{...existing,providers:[{provider_user_id:8},{provider_user_id:9}]}]}});
 await finishClientCreation({...a,organizationId:2,outcome:'assign',serviceKind:'counseling'});
 expect(a.api.post).toHaveBeenCalledWith('/clients/12/service-enrollments',expect.objectContaining({serviceId:40,providerUserId:9,addProvider:true}));
});
it('leaves service assignment pending when the server rejects or cannot confirm it',async()=>{
 const a=args();a.api.get.mockResolvedValue({data:{services:[]}});a.api.post.mockRejectedValueOnce(Error('Provider does not offer counseling'));
 await expect(finishClientCreation({...a,organizationId:2,outcome:'assign',serviceKind:'counseling'})).rejects.toThrow('does not offer counseling');
 a.api.post.mockResolvedValue({data:{services:[]}});
 await expect(finishClientCreation({...a,organizationId:2,outcome:'assign',serviceKind:'counseling'})).rejects.toThrow('could not be confirmed');
 expect(a.api.put).not.toHaveBeenCalled();
});
