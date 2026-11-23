import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClientSessionBookingRollout from '../ClientSessionBookingRollout.vue';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
const data={policy:{revision:2,entries:[{providerUserId:2,enabled:true}]},providers:[{id:1,name:'Ryn Test'},{id:2,name:'Other Provider'}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data});api.put.mockResolvedValue({data:{policy:{revision:3,entries:[...data.policy.entries,{providerUserId:1,enabled:true}]}}});});
describe('provider booking rollout',()=>{
 it('loads the chosen agency with everyone else coming soon',async()=>{
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/appointments/booking-rollout',{params:{agencyId:2}});
  expect(w.text()).toContain('1 enabled · 1 coming soon');expect(w.find('form button').attributes('disabled')).toBeDefined();w.unmount();
 });
 it('requires a reviewed selection and note then sends only selected IDs',async()=>{
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
  await w.find('.rollout-provider input').setValue(true);await w.find('textarea').setValue('October cohort ready');
  expect(w.find('form button').attributes('disabled')).toBeDefined();
  await w.find('.rollout-confirm input').setValue(true);await w.find('form').trigger('submit');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/appointments/booking-rollout',expect.objectContaining({agencyId:2,providerUserIds:[1],enabled:true,transitionReviewed:true,revision:2}));expect(w.text()).toContain('Session booking enabled');w.unmount();
 });
 it('searches names and clears the cohort when changing agencies',async()=>{
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
  await w.find('input[type=search]').setValue('Ryn');expect(w.findAll('.rollout-provider')).toHaveLength(1);
  await w.find('.rollout-provider input').setValue(true);await w.setProps({agencyId:3});await flushPromises();
  expect(w.text()).toContain('0/10 selected');expect(api.get).toHaveBeenLastCalledWith('/appointments/booking-rollout',{params:{agencyId:3}});w.unmount();
 });
});

it('shows the sign-in readiness gap and a real account-review link without pretending to provision identities',async()=>{
 const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
 expect(w.text()).toContain('does not create a Google Group or change Google sign-in');
 expect(w.text()).toContain('support and administrators can book for eligible providers before the transition');
 expect(w.text()).toContain('Superadmins with an active care assignment can also book their own sessions');
 expect(w.find('.rollout-provider a').attributes('href')).toBe('/admin/users/1?tab=account&section=workspace-security');
 expect(api.put).not.toHaveBeenCalled();w.unmount();
});

 it('requires exact personal recipient confirmation before capturing a suspended provider identity',async()=>{
  const readiness={targetEmail:'provider@itsco.health',recoveryEmail:'personal@example.net',originalWorkspace:{id:'google-701',email:'provider@itsco.health',suspended:true},conversion:null};
  api.get.mockImplementation(async path=>({data:path.endsWith('/conversion')?readiness:data}));
  api.post.mockResolvedValue({data:{...readiness,conversion:{id:'conversion-701',revision:1,state:'captured'}}});
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
  await w.findAll('.rollout-provider a')[1].trigger('click');await flushPromises();
  const panel=w.find('.account-conversion');expect(panel.text()).toContain('personal@example.net');
  const capture=()=>panel.findAll('button').find(button=>button.text()==='Capture preserved identity');expect(capture().attributes('disabled')).toBeDefined();
  await panel.find('input[type=email]').setValue('personal@example.net');await panel.find('input[type=checkbox]').setValue(true);await capture().trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/appointments/booking-rollout/providers/1/conversion/capture',expect.objectContaining({confirmed:true,confirmRecoveryEmail:'personal@example.net',originalWorkspaceUserId:'google-701'}));
  expect(w.text()).toContain('Verify address release');expect(api.put).not.toHaveBeenCalled();w.unmount();
 });
 it('does not show pending account conversions as enabled even if a prior rollout write succeeded',async()=>{
  api.get.mockResolvedValue({data:{policy:{revision:3,entries:[{providerUserId:1,enabled:true}]},providers:[{id:1,name:'Provider',accountConversionPending:true}]}});
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();expect(w.text()).toContain('0 enabled · 1 coming soon');w.unmount();
 });

it('reports the provider’s self-scheduling blocker when staff can still book for them', async () => {
 api.get.mockResolvedValueOnce({ data }).mockResolvedValueOnce({data:{enabled:true,providerSelfSchedulingEnabled:false,providerSelfSchedulingReason:'Finish individual account verification.'}});
 const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
 await w.find('.rollout-access-check').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/appointments/booking-access',{params:{agencyId:2,providerUserId:1}});
 expect(w.text()).toContain('Ryn Test · Finish individual account verification.');
 expect(api.put).not.toHaveBeenCalled();
 w.unmount();
});
