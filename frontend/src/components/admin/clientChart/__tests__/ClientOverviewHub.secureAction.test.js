import{shallowMount,flushPromises}from'@vue/test-utils';import{it,expect,vi}from'vitest';vi.mock('../../../../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:{}})}}));import api from '../../../../services/api';import Hub from'../ClientOverviewHub.vue';
it('emits a dedicated secure-composer action rather than the contact documentation/history route',async()=>{const w=shallowMount(Hub,{props:{clientId:2542,canSendSecureMessage:true}});await w.findAll('button').find(b=>b.text()==='Send secure message').trigger('click');expect(w.emitted('secure-message')).toHaveLength(1);expect(w.emitted('navigate')).toBeUndefined();w.unmount();});
it('does not offer secure family composition without an eligible chart action',()=>{const w=shallowMount(Hub,{props:{clientId:2542,canSendSecureMessage:false}});expect(w.findAll('button').some(b=>b.text()==='Send secure message')).toBe(false);w.unmount();});

it('uses the assigned clinician’s disclosure status for the chart viewer',async()=>{
 api.get.mockResolvedValueOnce({data:{timeZone:'America/Denver',policies:[],
  disclosure:{signedAt:'2026-11-12T17:00:00Z',providerIds:[9]},
  today:'2026-11-24'}});
 const view=shallowMount(Hub,{props:{clientId:10,client:{agency_id:2},canViewEssentials:true,
  careTeamLabel:'Pat Provider',careTeamProviderId:9}});
 await flushPromises();
 expect(view.text()).toContain('Pat Provider is listed');
 await view.setProps({careTeamLabel:'Sam Clinician',careTeamProviderId:10});
 expect(view.text()).toContain('Sam Clinician is assigned · disclosure needs review');
 view.unmount();
});
