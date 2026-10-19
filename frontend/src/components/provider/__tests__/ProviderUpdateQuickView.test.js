import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn(async()=>({data:{sections:[]}}))}}));
import api from '../../../services/api';
import Panel from '../ProviderUpdateSectionPanel.vue';
const section={key:'pin',data:{quickView:{hasPasscode:false}}};
function render(props={}){return mount(Panel,{props:{agencyId:2,mode:'me',recipient:{providerUserId:7,agencyId:2,agencySlug:'itsco',quickViewUrl:'https://qv.app.itsco.health'},section,...props},global:{stubs:{ProviderUpdateSecuritySetup:true,ProviderUpdateTrainingGuides:true}}});}
const create=w=>w.findAll('button').find(b=>b.text().includes('Create my six-digit'));
beforeEach(()=>{vi.resetAllMocks();api.put.mockResolvedValue({data:{sections:[]}});});
it('creates the code without asking for a password and keeps it visible through server refreshes',async()=>{
 api.post.mockResolvedValue({data:{passcode:'004123'}});const w=render();await flushPromises();await create(w).trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/provider-update/me/quick-view-setup',{agencyId:2},expect.objectContaining({timeout:30000,skipGlobalLoading:true}));expect(w.get('[role=status]').text()).toContain('004123');
 await w.setProps({section:{...section,data:{quickView:{hasPasscode:true}}}});expect(w.get('[role=status]').text()).toContain('004123');
 expect(w.get('[role=status]').attributes('data-search-private')).toBeDefined();
 expect(await w.vm.saveDraft()).toBe(false);expect(api.put).not.toHaveBeenCalled();
 await w.findAll('button').find(b=>b.text().includes('I saved my code')).trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/provider-update/me/sections/pin',expect.objectContaining({completed:true,data:expect.objectContaining({quickViewConfirmed:true,codeStoredSafely:true})}));w.unmount();
});
it('shows an adjacent actionable error if the request times out, and can retry without rotating a code',async()=>{
 api.post.mockRejectedValueOnce({code:'ECONNABORTED'});const w=render();await create(w).trigger('click');await flushPromises();
 expect(w.get('[role=alert]').text()).toContain('timed out');expect(w.findAll('a').some(a=>a.attributes('href')==='/itsco/dashboard?tab=my&my=access')).toBe(true);
 api.post.mockRejectedValueOnce({response:{status:409,data:{error:{message:'Your code is already set.'}}}});
 await create(w).trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toContain('already set');expect(create(w)).toBeUndefined();expect(w.text()).toContain('Reset a forgotten or locked code here');w.unmount();
});
it('prevents duplicate requests and never creates a code from a preview',async()=>{
 let resolve;api.post.mockImplementation(()=>new Promise(r=>resolve=r));const w=render();await create(w).trigger('click');
 const busy=w.findAll('button').find(b=>b.text().includes('Creating your code'));expect(busy.element.disabled).toBe(true);await busy.trigger('click');expect(api.post).toHaveBeenCalledTimes(1);
 resolve({data:{passcode:'004123'}});await flushPromises();w.unmount();api.post.mockClear();const p=render({recipient:{previewOnly:true}});expect(create(p).element.disabled).toBe(true);await create(p).trigger('click');expect(api.post).not.toHaveBeenCalled();p.unmount();
});
it('uses only the invitation-scoped endpoint in invitation mode',async()=>{
 api.post.mockResolvedValue({data:{passcode:'004123'}});const w=render({mode:'token',token:'test-invitation'});await create(w).trigger('click');await flushPromises();
 expect(api.post.mock.calls[0][0]).toBe('/public/provider-update/test-invitation/quick-view-setup');w.unmount();
});

it('resets a locked code inline with the correct signed-in SSO account and waits for the saved-code confirmation',async()=>{
 api.get.mockResolvedValue({data:{userId:7,requiresPassword:false,hasPasscode:true,isLocked:true}});
 let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const w=render({mode:'token',token:'invitation',section:{key:'pin',data:{quickView:{hasPasscode:true,isLocked:true}}}});
 const confirmStep=()=>w.findAll('button').find(b=>/I (have|saved) my code/.test(b.text()));
 expect(confirmStep().element.disabled).toBe(true);
 await w.findAll('button').find(b=>b.text()==='Reset a forgotten or locked code here').trigger('click');await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Reset 6-digit passcode').trigger('click');
 expect(w.find('input[type=password]').exists()).toBe(false);await w.get('input').setValue('CONFIRM');
 await w.findAll('button').find(b=>b.text()==='Confirm').trigger('click');
 expect(confirmStep().element.disabled).toBe(true);expect(await w.vm.saveDraft()).toBe(false);
 expect(api.post).toHaveBeenCalledWith('/quick-view/me/reset-passcode',{agencyId:2,expectedUserId:7,confirmPhrase:'CONFIRM'},expect.objectContaining({cookieAuthOnly:true,skipAuthRedirect:true}));
 api.get.mockResolvedValue({data:{userId:7,requiresPassword:false,hasPasscode:true,isLocked:false}});
 finish({data:{passcode:'004123'}});await flushPromises();
 expect(w.get('.pin').text()).toBe('004123');expect(confirmStep().element.disabled).toBe(false);
 expect(await w.vm.saveDraft()).toBe(false);expect(api.put).not.toHaveBeenCalled();
 await confirmStep().trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/public/provider-update/invitation/sections/pin',expect.objectContaining({completed:true,data:expect.objectContaining({quickViewConfirmed:true,codeStoredSafely:true})}));
 expect(await w.vm.saveDraft()).toBe(true);w.unmount();
});

it.each(['me','token'])('checks status after a reset in another tab without creating another code (%s)',async mode=>{
 api.get.mockResolvedValue({data:{hasPasscode:true,isLocked:false}});
 const w=render({mode,token:'invitation',section:{key:'pin',data:{quickView:{hasPasscode:true,isLocked:true}}}});
 await w.findAll('button').find(b=>b.text()==='Check my code status').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith(mode==='me'?'/provider-update/me/quick-view-status':'/public/provider-update/invitation/quick-view-status',expect.objectContaining({params:{agencyId:2}}));
 expect(w.findAll('button').find(b=>b.text().startsWith('I have my code')).element.disabled).toBe(false);
 expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('keeps the displayed code and completion controls available when saving fails',async()=>{
 api.post.mockResolvedValue({data:{passcode:'004123'}});api.put.mockRejectedValueOnce({response:{data:{error:{message:'Please reconnect and try again.'}}}});
 const w=render();await create(w).trigger('click');await flushPromises();
 const save=()=>w.findAll('button').find(b=>b.text().includes('I saved my code'));
 await save().trigger('click');await flushPromises();expect(w.text()).toContain('Please reconnect');expect(w.get('[role=status]').text()).toContain('004123');expect(w.emitted('saved')).toBeUndefined();expect(await w.vm.saveDraft()).toBe(false);
 await save().trigger('click');await flushPromises();expect(w.emitted('saved')).toHaveLength(1);expect(await w.vm.saveDraft()).toBe(true);w.unmount();
});
