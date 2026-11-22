import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import View from '../GuardianFamilyWorkspace.vue';
import Documents from '../GuardianProfileDocuments.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),patch:vi.fn()}}));
vi.mock('../ClientDetailPanel.vue',()=>({default:{name:'ClientDetailPanel',props:['client','initialTab'],template:'<div class="opened-child">{{client.id}} {{initialTab}}</div>'}}));
const data={guardian:{id:20,first_name:'Example',last_name:'Parent',email:'parent@example.test',phone:'(303) 555-0100',password_set:0},clients:[
 {client_id:10,agency_id:2,full_name:'First Child',agency_name:'Care agency',access_enabled:1,billing:{available:true,amountDueCents:4500,assignedBalanceCount:1}},
 {client_id:11,agency_id:2,full_name:'Second Child',agency_name:'Care agency',access_enabled:0,billing:{available:false}}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data});});
it('shows contact, per-child portal status and real versus unavailable balances without employee profile fields',async()=>{
 const w=mount(View,{props:{guardianId:20,canEdit:true},global:{stubs:{ClientPortalInviteDialog:true}}});await flushPromises();
 expect(w.text()).toContain('(303) 555-0100');expect(w.text()).toContain('$45.00');expect(w.text()).toContain('Unavailable under current billing access');
 expect(w.text()).toContain('Portal access disabled');expect(w.text()).toContain('Password setup needed');
 expect(w.text()).not.toMatch(/Employee ID|Payroll|Email Signature|Licenses & Certifications/);
 await w.findAll('.profile-actions button')[1].trigger('click');await flushPromises();await vi.waitFor(()=>expect(w.find('.opened-child').exists()).toBe(true));expect(w.find('.opened-child').text()).toBe('10 phi');w.unmount();
});
it('limits portal invitation preview to the selected guardian while allowing selection of either child',async()=>{
 const w=mount(View,{props:{guardianId:20,canEdit:true},global:{stubs:{ClientPortalInviteDialog:{props:['recipientGuardianId','clientIds'],template:'<div class="invite">{{recipientGuardianId}}:{{clientIds.join()}}</div>'}}}});await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Email portal setup / invitation').trigger('click');expect(w.find('.invite').text()).toBe('20:10,11');w.unmount();
});

it('routes documents to the chosen linked client or directly to the guardian account', async () => {
 const view = mount(Documents, {props:{guardianId:20,guardianName:'Example Parent',accountDocumentsAllowed:true,clients:data.clients},global:{stubs:{
   ClientUpdateModal:{props:['clientId','recipientGuardianId'],template:'<div class="doc-target">{{clientId}}:{{recipientGuardianId}}</div>'},
   UserDocumentsTab:{props:{userId:Number,guardianAccount:Boolean},template:'<div class="account-docs">{{userId}}:{{guardianAccount}}</div>'}
 }}});
 await view.get('select').setValue('11');
 await view.findAll('button').find(button=>button.text()==='Assign or request documents').trigger('click');
 expect(view.get('.doc-target').text()).toBe('11:20');
 expect(view.find('.account-docs').exists()).toBe(false);
 await view.findAll('button').find(button=>button.text()==='Manage account documents').trigger('click');
 expect(view.get('.account-docs').text()).toBe('20:true');
 view.unmount();
});

it('keeps a disabled relationship visible and opens its existing access controls to enable it again', async () => {
 const w=mount(View,{props:{guardianId:20,canEdit:true},global:{stubs:{ClientPortalInviteDialog:true}}});await flushPromises();
 const disabled=w.findAll('.family-profiles article')[1];
 expect(disabled.text()).toContain('Second Child');
 expect(disabled.text()).toContain('its history is preserved');
 expect(disabled.text()).toContain('without reconnecting');
 await disabled.findAll('button').find(button=>button.text()==='Enable portal access').trigger('click');await flushPromises();
 await vi.waitFor(()=>expect(w.find('.opened-child').exists()).toBe(true));
 expect(w.find('.opened-child').text()).toBe('11 portal');
 expect(api.put).not.toHaveBeenCalled();
 w.unmount();
});

it('retains past relationships and edits the existing account without reconnecting or enabling access', async () => {
 api.get.mockResolvedValue({data:{guardian:data.guardian,clients:[],historicalRelationships:[{client_id:11,full_name:'Former client',agency_name:'Care agency',status:'incorrect'}]}});
 api.patch.mockResolvedValue({data:{ok:true}});
 const w=mount(View,{props:{guardianId:20,canEdit:true},global:{stubs:{ClientPortalInviteDialog:true}}});await flushPromises();
 expect(w.find('.family-profiles article').exists()).toBe(false);
 expect(w.get('.relationship-history').text()).toContain('Former client');
 expect(w.get('.relationship-history').text()).toContain('Marked incorrect');
 expect(w.text()).not.toContain('Enable portal access');
 expect(w.text()).not.toContain('Email portal setup / invitation');
 await w.findAll('button').find(button=>button.text()==='Edit guardian contact').trigger('click');
 await w.get('input[type=tel]').setValue('(303) 555-0101');
 await w.get('form').trigger('submit');await flushPromises();
 expect(api.patch).toHaveBeenCalledExactlyOnceWith('/clients/11/guardians/20',expect.objectContaining({contact:expect.objectContaining({phone:'(303) 555-0101'})}));
 expect(api.patch.mock.calls[0][1]).not.toHaveProperty('accessEnabled');
 expect(api.patch.mock.calls[0][1]).not.toHaveProperty('accessMode');
 w.unmount();
});
