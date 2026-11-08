vi.mock('../../documents/PDFPreview.vue',()=>({default:{template:'<div/>'}}));
import {expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,user:{role:'support'}})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async()=>({data:{}})),post:vi.fn(),defaults:{baseURL:'/api'}}}));
import api from '../../../services/api';
import Upload from '../ReferralUpload.vue';
it('keeps matching available after file upload and reports completion only after attaching the selected client',async()=>{
 api.post.mockImplementation(async url=>({data:url.endsWith('/submit')?{client:{id:42},attachedExisting:true}:{draftId:9,phiDocumentId:8,matches:[{id:42,full_name:'Synthetic child'}]}}));
 const w=mount(Upload,{props:{organizationSlug:'qa-school'},global:{stubs:{PDFPreview:true}}});await flushPromises();
 w.vm.selectedFile=new File(['%PDF-synthetic'],'test.pdf',{type:'application/pdf'});w.vm.firstName='Synthetic';w.vm.lastName='Child';
 await w.vm.handleUpload();await flushPromises();
 expect(w.emitted('uploaded')).toHaveLength(1);expect(w.emitted('submitted')).toBeUndefined();
 w.vm.clientMatches=[{id:42,full_name:'Synthetic child'}];
 await w.vm.handleSubmitClient();expect(api.post).toHaveBeenCalledTimes(1);expect(w.text()).toContain('Select a matching client');
 w.vm.matchChoice='42';await w.vm.handleSubmitClient();
 expect(api.post).toHaveBeenLastCalledWith('/organizations/qa-school/upload-referral/9/submit',expect.objectContaining({existingClientId:42}));
 expect(w.emitted('submitted')).toEqual([[{client:{id:42},attachedExisting:true}]]);w.unmount();
});
