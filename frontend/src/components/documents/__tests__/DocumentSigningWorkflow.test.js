import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),counterSign:vi.fn(),user:{id:501,role:'super_admin'}}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:m.user})}));
vi.mock('../../../store/documents',()=>({useDocumentsStore:()=>({counterSignDocument:m.counterSign})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{taskId:'2148',organizationSlug:'itsco'},query:{}}),useRouter:()=>({push:vi.fn()})}));
vi.mock('../../../utils/router',()=>({getDashboardRoute:()=>'/itsco/dashboard'}));
vi.mock('../../SignaturePad.vue',()=>({default:{template:'<div class="signature-pad-stub" />'}}));
vi.mock('../PDFPreview.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../FocusStepTimeTracker.vue',()=>({default:{template:'<div />'}}));
import Component from '../DocumentSigningWorkflow.vue';
let w;
const base=()=>({task:{id:2148,assigned_to_user_id:567,metadata:{assignedSignerName:'Halle Brimm',requiredCountersignerUserId:501}},template:{template_type:'html',html_content:'<p>Letter</p>'},signedDocument:null,workflow:null});
beforeEach(()=>{vi.clearAllMocks();m.user.id=501;m.user.role='super_admin';sessionStorage.clear();localStorage.clear();});
afterEach(()=>w?.unmount());
async function render(data){m.get.mockResolvedValue({data});w=mount(Component,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();}
it('shows waiting status and no primary signature controls to the supervisor',async()=>{
 await render(base());expect(w.text()).toContain('Halle Brimm has not signed');expect(w.text()).toContain('Waiting for Halle Brimm');expect(w.find('.step-consent').exists()).toBe(false);expect(w.find('.signature-pad-stub').exists()).toBe(false);expect(m.post).not.toHaveBeenCalled();
});
it('shows the assigned signer the consent step',async()=>{
 m.user.id=567;m.user.role='provider';await render(base());expect(w.find('.step-consent').exists()).toBe(true);expect(w.find('.step-waiting').exists()).toBe(false);
});
it('shows countersignature only after Halle signs',async()=>{
 const data=base();data.signedDocument={user_id:567,signed_pdf_path:'signed.pdf',audit_trail:{}};await render(data);
 expect(w.text()).toContain('Halle Brimm has signed');expect(w.text()).toContain('Review & countersign');expect(w.findAll('.signature-pad-stub')).toHaveLength(1);
});
it('does not offer countersigning when the first signature belongs to the supervisor',async()=>{
 const data=base();data.signedDocument={user_id:501,signed_pdf_path:'signed.pdf',audit_trail:{}};await render(data);expect(w.text()).toContain('Signer does not match');expect(w.find('.signature-pad-stub').exists()).toBe(false);
});
it('shows a replacement link and hides signing/download controls for superseded requests',async()=>{
 const data=base();data.task.metadata={...data.task.metadata,signatureRequestSupersededAt:'2026-10-29',replacementTaskId:2149};await render(data);
 expect(w.text()).toContain('Signature request superseded');expect(w.text()).toContain('Open replacement request');expect(w.find('.step-consent').exists()).toBe(false);expect(w.find('.complete-actions').exists()).toBe(false);
});

it('requires review, intent and a drawn countersignature before saving the original document',async()=>{
 const data=base();data.signedDocument={user_id:567,signed_pdf_path:'signed.pdf',audit_trail:{}};await render(data);
 const save=()=>w.findAll('button').find(b=>b.text()==='Save countersignature');
 expect(save().attributes('disabled')).toBeDefined();
 w.vm.$.setupState.handleAdminSignature('data:image/png;base64,dGVzdA==');await flushPromises();
 expect(save().attributes('disabled')).toBeDefined();
 const create=vi.fn(()=> 'blob:signed-review'),revoke=vi.fn();
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}));
 m.get.mockImplementation(async url=>url.endsWith('/view')?{data:new Blob(['signed pdf'])}:{data});
 await w.findAll('button').find(b=>b.text()==='Review signed document').trigger('click');await flushPromises();
 expect(m.get).toHaveBeenCalledWith('/document-signing/2148/view',{responseType:'blob'});
 expect(save().attributes('disabled')).toBeDefined();
 await w.get('.countersign-consent input').setValue(true);await save().trigger('click');await flushPromises();
 expect(m.counterSign).toHaveBeenCalledWith('2148','data:image/png;base64,dGVzdA==');
 w.unmount();expect(revoke).toHaveBeenCalledWith('blob:signed-review');
});
