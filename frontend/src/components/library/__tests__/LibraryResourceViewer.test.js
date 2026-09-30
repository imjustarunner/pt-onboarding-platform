import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import Viewer from '../LibraryResourceViewer.vue';
vi.mock('../../../services/library.js',()=>({fetchLibraryGooglePreview:vi.fn()}));
import {fetchLibraryGooglePreview} from '../../../services/library.js';
const resource={id:1,agencyId:2,name:'Clinical Note Aid Guide',resourceType:'google_doc',externalUrl:'https://docs.google.com/document/d/doc_123/edit',previewUrl:'https://docs.google.com/document/d/doc_123/preview'};
let wrapper;
beforeEach(()=>{vi.clearAllMocks();URL.createObjectURL=vi.fn(()=> 'blob:portal-preview');URL.revokeObjectURL=vi.fn();fetchLibraryGooglePreview.mockResolvedValue(new Blob(['%PDF-example'],{type:'application/pdf'}));});
afterEach(()=>wrapper?.unmount());
it('uses an authenticated portal PDF, with a new-window option, instead of embedding Google sign-in',async()=>{
 wrapper=mount(Viewer,{props:{resource},global:{stubs:{LibraryDocumentWorkspace:true}}});
 expect(wrapper.text()).toContain('Opening document');expect(wrapper.find('iframe').exists()).toBe(false);await flushPromises();
 expect(fetchLibraryGooglePreview).toHaveBeenCalledWith(1,2,expect.any(AbortSignal));expect(wrapper.get('iframe').attributes('src')).toBe('blob:portal-preview');
 const open=wrapper.findAll('a').find(a=>a.text()==='Open document');expect(open.attributes('target')).toBe('_blank');expect(open.attributes('href')).toBe('blob:portal-preview');
 expect(wrapper.find('a[href^="https://docs.google.com"]').exists()).toBe(false);
 wrapper.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:portal-preview');wrapper=null;
});
it('offers a retryable portal error instead of falling back to a Google-cookie prompt',async()=>{
 fetchLibraryGooglePreview.mockRejectedValueOnce(new Error('Ask the resource owner to upload a PDF.'));
 wrapper=mount(Viewer,{props:{resource},global:{stubs:{LibraryDocumentWorkspace:true}}});await flushPromises();expect(wrapper.get('[role="alert"]').text()).toContain('upload a PDF');expect(wrapper.find('iframe').exists()).toBe(false);
 await wrapper.findAll('button').find(b=>b.text()==='Try again').trigger('click');await flushPromises();expect(wrapper.get('iframe').attributes('src')).toBe('blob:portal-preview');
});
it('does not reuse a prior resource’s document when a slower request resolves after switching resources',async()=>{
 let resolveOld;fetchLibraryGooglePreview.mockImplementationOnce(()=>new Promise(resolve=>resolveOld=resolve));
 wrapper=mount(Viewer,{props:{resource},global:{stubs:{LibraryDocumentWorkspace:true}}});
 await wrapper.setProps({resource:{...resource,id:2}});await flushPromises();resolveOld(new Blob(['old']));await flushPromises();
 expect(URL.createObjectURL).toHaveBeenCalledTimes(1);expect(fetchLibraryGooglePreview.mock.calls[0][2].aborted).toBe(true);
});
it('keeps normal uploaded PDF previews without calling Google',async()=>{
 wrapper=mount(Viewer,{props:{resource:{id:3,name:'Uploaded guide',resourceType:'file',fileType:'pdf',fileUrl:'/uploads/guide.pdf'}},global:{stubs:{LibraryDocumentWorkspace:true}}});await flushPromises();
 expect(fetchLibraryGooglePreview).not.toHaveBeenCalled();expect(wrapper.get('iframe').attributes('src')).toBe('/uploads/guide.pdf');expect(wrapper.findAll('a').find(a=>a.text()==='Download').attributes('download')).toBe('');
});
