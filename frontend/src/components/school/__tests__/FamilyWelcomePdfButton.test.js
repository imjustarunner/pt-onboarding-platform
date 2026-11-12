import {Blob as NativeBlob} from 'node:buffer';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import PdfButton from '../FamilyWelcomePdfButton.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
let w;beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('Blob',NativeBlob);URL.createObjectURL=vi.fn(()=> 'blob:own-provider-pdf');URL.revokeObjectURL=vi.fn();});
afterEach(()=>{w?.unmount();document.body.innerHTML='';vi.unstubAllGlobals();});
const mountButton=()=>w=mount(PdfButton,{attachTo:document.body,props:{agencyId:2,schoolId:193}});
it('previews the selected assigned school PDF and offers download/new-tab options',async()=>{
 api.get.mockResolvedValue({data:new NativeBlob(['%PDF-1.7\nQA'],{type:'application/pdf'})});mountButton();await w.get('button').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/school-contact-plan/pdf-preview',expect.objectContaining({params:{agencyId:2,schoolId:193},responseType:'blob'}));
 expect(document.querySelector('iframe').getAttribute('src')).toBe('blob:own-provider-pdf');expect(document.body.textContent).toContain('Open in new tab');
 await w.setProps({schoolId:206});expect(document.querySelector('iframe')).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:own-provider-pdf');
});
it('explains verification failures instead of reporting a failed PDF build',async()=>{
 api.get.mockRejectedValue({response:{data:new NativeBlob([JSON.stringify({error:{code:'MFA_REQUIRED'}})],{type:'application/json'})}});mountButton();await w.get('button').trigger('click');await flushPromises();
 expect(w.get('[role="alert"]').text()).toContain('sign-in verification');expect(document.querySelector('iframe')).toBeNull();
});
it('ignores a delayed response for a school the provider has switched away from',async()=>{
 let complete;api.get.mockImplementation(()=>new Promise(r=>{complete=r;}));mountButton();await w.get('button').trigger('click');await w.setProps({schoolId:206});
 complete({data:new NativeBlob(['%PDF-1.7\nOLD'],{type:'application/pdf'})});await flushPromises();expect(document.querySelector('iframe')).toBeNull();expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('rejects a successful HTML or JSON response instead of opening a broken viewer',async()=>{
 api.get.mockResolvedValue({data:new NativeBlob(['<html>Login</html>'],{type:'text/html'})});mountButton();await w.get('button').trigger('click');await flushPromises();expect(w.get('[role="alert"]').text()).toContain('did not return a PDF');expect(URL.createObjectURL).not.toHaveBeenCalled();
});
