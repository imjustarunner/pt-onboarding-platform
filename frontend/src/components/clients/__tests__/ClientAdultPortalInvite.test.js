import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import OwnPortal from '../ClientAdultPortalInvite.vue';
import Dialog from '../ClientPortalInviteDialog.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const client={id:12,full_name:'Synthetic Adult',email:'adult@synthetic.example'};
const own={guardian_user_id:50,relationship_type:'self',email:client.email,access_enabled:1};
const recipient={key:'2:50',snapshot:'confirmed-own',agencyId:2,guardianUserId:50,clients:[{clientId:12}]};
function fixture(links=[]){api.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('/guardians')?links:client}));}
const button=w=>w.findAll('button').find(b=>b.text()==='Invite client to their own portal');
beforeEach(()=>{vi.resetAllMocks();fixture();});
it('shows saved email without sending, then prepares and invites only the explicitly confirmed adult',async()=>{
 api.post.mockResolvedValueOnce({data:{guardianUser:{id:50}}}).mockResolvedValueOnce({data:{recipients:[{...recipient,guardianUserId:77},recipient]}}).mockResolvedValueOnce({data:{status:'sent'}});
 const w=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();expect(w.text()).toContain(client.email);expect(api.post).not.toHaveBeenCalled();expect(button(w).attributes('disabled')).toBeDefined();
 await w.get('input').setValue(true);await button(w).trigger('click');await flushPromises();
 expect(api.post.mock.calls[0][1]).toMatchObject({relationshipType:'self',email:client.email,sendInvitation:false,clientOwnContactConfirmed:true});
 expect(api.post.mock.calls[2][1]).toEqual({clientIds:[12],recipientKey:'2:50',recipientSnapshot:'confirmed-own'});expect(w.text()).toContain('Invitation sent to the client’s own account.');w.unmount();
});
it('reuses a linked identity and reports queued delivery accurately',async()=>{
 fixture([own]);api.post.mockResolvedValueOnce({data:{recipients:[recipient]}}).mockResolvedValueOnce({data:{status:'queued'}});
 const w=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();await w.get('input').setValue(true);await button(w).trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls.some(([url])=>url.endsWith('/guardians'))).toBe(false);expect(w.text()).toContain('queued for email approval');expect(w.text()).not.toContain('Invitation sent');w.unmount();
});
it.each([{access_enabled:0},{permissions_json:{relationshipRevoked:true}},{permissions_json:{noView:true}}])('keeps restricted existing relationships out of invitation setup: %j',async extra=>{
 fixture([{...own,...extra}]);const w=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();expect(w.text()).toContain('disabled or restricted');expect(button(w)).toBeUndefined();expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('does not send after an ownership conflict or substitute a guardian when own recipient is unavailable',async()=>{
 api.post.mockRejectedValueOnce({response:{status:409,data:{error:{message:'This address has an existing login. Review its ownership.'}}}});
 const w=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();await w.get('input').setValue(true);await button(w).trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(w.text()).toContain('Review its ownership');w.unmount();
 fixture([own]);api.post.mockReset().mockResolvedValue({data:{recipients:[{...recipient,guardianUserId:77}]}});
 const other=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();await other.get('input').setValue(true);await button(other).trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(other.text()).toContain('no invitation was sent');other.unmount();
});
it('does not continue an old preparation into a different chart',async()=>{
 let finish;api.post.mockReturnValueOnce(new Promise(resolve=>finish=resolve));const w=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();await w.get('input').setValue(true);await button(w).trigger('click');await w.setProps({clientId:13});finish({data:{guardianUser:{id:50}}});await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);w.unmount();
});
it('opens a single adult invitation directly to own portal, with a separate guardian choice',async()=>{
 const w=mount(Dialog,{props:{clientIds:[12],agencyId:2}});await flushPromises();expect(w.text()).toContain(client.email);expect(w.text()).not.toContain('No eligible recipients');expect(api.post).not.toHaveBeenCalled();
 api.post.mockResolvedValueOnce({data:{recipients:[],skipped:[]}});await w.findAll('button').find(b=>b.text()==='Guardian or linked account').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/clients/portal-invites/preview',{clientIds:[12]});w.unmount();
});
it('stops repeat sends when the send request fails with an uncertain server outcome',async()=>{
 fixture([own]);api.post.mockResolvedValueOnce({data:{recipients:[recipient]}}).mockRejectedValueOnce({response:{status:500,data:{error:{message:'Delivery request failed.'}}}});
 const w=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();await w.get('input').setValue(true);await button(w).trigger('click');await flushPromises();expect(w.text()).toContain('Check invitation history before retrying.');expect(button(w).attributes('disabled')).toBeDefined();expect(api.post).toHaveBeenCalledTimes(2);w.unmount();
});
it('uses the existing login address explicitly when the chart contact email has changed',async()=>{
 fixture([{...own,email:'existing-login@synthetic.example'}]);const w=mount(OwnPortal,{props:{clientId:12,agencyId:2}});await flushPromises();expect(w.text()).toContain('existing-login@synthetic.example');expect(w.text()).not.toContain('adult@synthetic.example');w.unmount();
});
