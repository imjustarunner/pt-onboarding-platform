import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import InsuranceVerificationGate from '../InsuranceVerificationGate.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../ClientInsuranceEditor.vue',()=>({default:{props:['clientId','agencyId'],template:'<div data-testid="insurance-editor">Editor {{ clientId }} / {{ agencyId }}</div>'}}));
const open=(clientId=22)=>window.dispatchEvent(new CustomEvent('pt:insurance-verification-required',{detail:{clientId,agencyId:450,message:'Verify coverage before assigning this client.'}}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{canVerify:true,ready:false}});});
afterEach(()=>{document.body.innerHTML='';});
it('offers the editor to authorized billing staff but never automatically retries the blocked action',async()=>{
 const w=mount(InsuranceVerificationGate,{attachTo:document.body});open();await flushPromises();expect(document.querySelector('[role=dialog]').textContent).toContain('Editor 22 / 450');expect(document.activeElement).toBe(document.querySelector('[role=dialog]'));
 api.get.mockResolvedValue({data:{canVerify:true,ready:true}});[...document.querySelectorAll('button')].find(b=>b.textContent==='Recheck verification').click();await flushPromises();expect(document.body.textContent).toContain('Close this window and retry');expect(document.querySelector('[data-testid=insurance-editor]')).toBeNull();expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('gives nonbilling users a clear stopped request and no editor',async()=>{
 api.get.mockResolvedValue({data:{canVerify:false,ready:false}});const w=mount(InsuranceVerificationGate,{attachTo:document.body});open();await flushPromises();expect(document.body.textContent).toContain('Your assignment or Exchange request has not been saved');expect(document.querySelector('[data-testid=insurance-editor]')).toBeNull();expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('clears editor access on recheck failure and discards earlier clients’ replies',async()=>{
 let old;api.get.mockImplementationOnce(()=>new Promise(resolve=>old=resolve));const w=mount(InsuranceVerificationGate,{attachTo:document.body});open(22);await flushPromises();open(23);await flushPromises();expect(document.body.textContent).toContain('Editor 23 / 450');old({data:{canVerify:false,ready:false}});await flushPromises();expect(document.body.textContent).toContain('Editor 23 / 450');
 api.get.mockRejectedValue({response:{data:{error:{message:'Access denied'}}}});[...document.querySelectorAll('button')].find(b=>b.textContent==='Recheck verification').click();await flushPromises();expect(document.body.textContent).toContain('Access denied');expect(document.querySelector('[data-testid=insurance-editor]')).toBeNull();w.unmount();
});
it('ignores invalid requests and restores focus when a valid gate closes',async()=>{
 const origin=document.createElement('button');origin.textContent='Assign';document.body.append(origin);origin.focus();const w=mount(InsuranceVerificationGate,{attachTo:document.body});open(-1);await flushPromises();expect(api.get).not.toHaveBeenCalled();open();await flushPromises();document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await flushPromises();expect(document.querySelector('[role=dialog]')).toBeNull();expect(document.activeElement).toBe(origin);w.unmount();
});
