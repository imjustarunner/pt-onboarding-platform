vi.mock('../../documents/PDFPreview.vue',()=>({default:{template:'<div/>'}}));
it('clearly requires attachment to the existing chart without creating another client',async()=>{
 api.get.mockResolvedValue({data:{}});api.post.mockResolvedValue({data:{draftId:93,phiDocumentId:94}});
 const w=mount(Upload,{props:{organizationSlug:'qa-school',existingClientId:2456}});await flushPromises();
 w.vm.selectedFile=new File(['%PDF-synthetic'],'control.pdf',{type:'application/pdf'});
 await w.vm.handleUpload();await flushPromises();
 expect(w.text()).toContain('Click Attach packet to this client');
 expect(w.text()).not.toContain('Submit Client');
 api.post.mockResolvedValue({data:{client:{id:2456},attachedExisting:true}});
 await w.findAll('button').find(b=>b.text()==='Attach packet to this client').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith('/organizations/qa-school/upload-referral/93/submit',expect.objectContaining({existingClientId:2456,reviewOnly:false}));
 expect(w.emitted('submitted')).toHaveLength(1);w.unmount();
});
import {expect,it,vi,beforeEach} from 'vitest';
beforeEach(()=>vi.clearAllMocks());
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
it('preserves a new child and file when an older draft resumes late',async()=>{
 let resolveDraft;
 api.get.mockImplementation(url=>url.endsWith('/latest-draft')?new Promise(resolve=>{resolveDraft=resolve;}):Promise.resolve({data:{}}));
 const w=mount(Upload,{props:{organizationSlug:'qa-school'},global:{stubs:{PDFPreview:true}}});await flushPromises();
 w.vm.firstName='New';w.vm.lastName='Child';w.vm.selectedFile=new File(['%PDF-synthetic'],'new.pdf',{type:'application/pdf'});
 resolveDraft({data:{draft:{id:17,phiDocumentId:18,firstName:'Previous',lastName:'Child',uploadNote:'Old draft'}}});await flushPromises();
 expect(w.vm.firstName).toBe('New');expect(w.vm.lastName).toBe('Child');expect(w.vm.draftId).toBeNull();expect(w.vm.phiDocumentId).toBeNull();expect(w.vm.uploadNote).toBe('');
 w.unmount();
});
it('offers an existing draft explicitly and uploads the newly selected file instead',async()=>{
 api.get.mockImplementation(async()=>({data:{draft:{id:17,phiDocumentId:18,firstName:'Previous',lastName:'Child'}}}));
 api.post.mockResolvedValue({data:{draftId:19,phiDocumentId:20}});
 const w=mount(Upload,{props:{organizationSlug:'qa-school'}});await flushPromises();
 expect(w.text()).toContain('Resume this packet');expect(w.vm.draftId).toBeNull();expect(w.get('#file-input').attributes('disabled')).toBeUndefined();
 const file=new File(['%PDF-synthetic-new'],'new.pdf',{type:'application/pdf'});
 Object.defineProperty(w.get('#file-input').element,'files',{value:[file]});await w.get('#file-input').trigger('change');
 w.vm.firstName='New';w.vm.lastName='Child';await w.vm.handleUpload();await flushPromises();
 expect(api.post.mock.calls.at(-1)[0]).toBe('/organizations/qa-school/upload-referral');expect(api.post.mock.calls.at(-1)[1].get('file')).toBe(file);
 expect(w.vm.draftId).toBe(19);expect(w.vm.phiDocumentId).toBe(20);w.unmount();
});
it('requires an explicit new-child choice after a review finds no matches',async()=>{
 api.get.mockResolvedValue({data:{}});api.post.mockResolvedValueOnce({data:{reviewComplete:true,matches:[]}}).mockResolvedValueOnce({data:{client:{id:44}}});
 const w=mount(Upload,{props:{organizationSlug:'qa-school'}});await flushPromises();w.vm.draftId=33;w.vm.firstName='Synthetic';w.vm.lastName='Newchild';
 await w.vm.handleSubmitClient();await flushPromises();expect(w.emitted('submitted')).toBeUndefined();expect(w.text()).toContain('No possible matches');
 expect(api.post.mock.calls.at(-1)[1].reviewOnly).toBe(true);
 await w.vm.handleSubmitClient();expect(w.emitted('submitted')).toBeUndefined();
 w.vm.matchChoice='new';await w.vm.handleSubmitClient();expect(api.post.mock.calls.at(-1)[1].reviewOnly).toBe(false);expect(w.emitted('submitted')).toHaveLength(1);w.unmount();
});
it('submits the selected assigned school and locks it after upload',async()=>{
 api.get.mockResolvedValue({data:{}});api.post.mockResolvedValue({data:{draftId:55,phiDocumentId:56,scanStatus:'pending'}});
 const w=mount(Upload,{props:{organizationSlug:'first',organizationOptions:[{slug:'first',name:'First school'},{slug:'second',name:'Second school'}]}});await flushPromises();
 await w.get('select').setValue('second');w.vm.selectedFile=new File(['%PDF-synthetic'],'test.pdf',{type:'application/pdf'});await w.vm.handleUpload();await flushPromises();
 expect(api.post.mock.calls.at(-1)[0]).toBe('/organizations/second/upload-referral');expect(w.get('select').attributes('disabled')).toBeDefined();expect(w.vm.pdfPreviewUrl).toBe('');w.unmount();
});
