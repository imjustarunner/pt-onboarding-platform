import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import InsuranceVerificationQueue from '../InsuranceVerificationQueue.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../ClientInsuranceEditor.vue',()=>({default:{props:['clientId','agencyId'],template:'<div data-testid="insurance-editor">Editor {{ clientId }} / {{ agencyId }}</div>'}}));
const row=(id=22)=>({agencyId:450,clientId:id,clientName:`DEMO QA Client ${id}`,organizationName:'DEMO QA Practice',primary:'DEMO QA Plan',ready:false,reason:'Primary policy needs verification',taskId:9});
const payload=(rows=[row()])=>({data:{items:rows,total:rows.length}});
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue(payload());});
afterEach(()=>{document.body.innerHTML='';});
it('opens only the exact authorized task-linked client and does not reopen it after close',async()=>{
 const w=mount(InsuranceVerificationQueue,{props:{agencyId:450,clientId:22},attachTo:document.body});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/medical-billing/workspace/insurance-verification',expect.objectContaining({params:expect.objectContaining({agencyId:450,clientId:22})}));
 expect(document.querySelector('[role=dialog]').textContent).toContain('Editor 22 / 450');expect(document.activeElement).toBe(document.querySelector('[role=dialog]'));
 document.querySelector('[role=dialog] button').click();await flushPromises();expect(document.querySelector('[role=dialog]')).toBeNull();expect(api.get).toHaveBeenCalledTimes(2);w.unmount();
});
it('never opens an unreturned or different-scope client from a URL',async()=>{
 api.get.mockResolvedValue(payload([row(23),{...row(22),agencyId:451}]));const w=mount(InsuranceVerificationQueue,{props:{agencyId:450,clientId:22},attachTo:document.body});await flushPromises();expect(document.querySelector('[role=dialog]')).toBeNull();w.unmount();
});
it('changes task scope immediately, discards the old response, and opens the new client',async()=>{
 let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));const w=mount(InsuranceVerificationQueue,{props:{agencyId:450,clientId:22},attachTo:document.body});
 api.get.mockResolvedValue(payload([row(23)]));await w.setProps({clientId:23});await flushPromises();expect(document.querySelector('[role=dialog]').textContent).toContain('Editor 23 / 450');finish(payload());await flushPromises();expect(document.body.textContent).not.toContain('DEMO QA Client 22');w.unmount();
});
it('clears prior names after access is denied and closes with Escape',async()=>{
 const w=mount(InsuranceVerificationQueue,{props:{agencyId:450},attachTo:document.body});await flushPromises();const open=w.findAll('button').find(b=>b.text()==='Verify insurance');open.element.focus();await open.trigger('click');await flushPromises();document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await flushPromises();expect(document.querySelector('[role=dialog]')).toBeNull();
 api.get.mockRejectedValue({response:{data:{error:{message:'Access denied'}}}});await w.setProps({agencyId:451});await flushPromises();expect(w.text()).toContain('Access denied');expect(w.text()).not.toContain('DEMO QA Client 22');w.unmount();
});
