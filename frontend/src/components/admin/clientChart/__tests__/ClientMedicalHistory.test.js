import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),prepare:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
vi.mock('../../../../utils/auricwellMedicalArchive',()=>({prepareMedicalArchive:m.prepare,findArchiveDocument:(docs,title)=>docs.find(doc=>doc.document_title===title)}));
import History from '../ClientMedicalHistory.vue';
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue({data:{documents:[]}});m.prepare.mockResolvedValue({filename:'synthetic.pdf',pageCount:3,parts:[{bytes:new Uint8Array([1]),filename:'volume.pdf',title:'volume'}],manifest:{bytes:new Uint8Array([2]),filename:'manifest.pdf',title:'manifest'}});m.post.mockImplementation(async(_url,form)=>({data:{document:{id:form.get('documentTitle')==='volume'?1:2,document_title:form.get('documentTitle'),scanStatus:'pending',available:false}}}));});
it('requires an identity check before uploading volumes and the manifest to the private chart endpoint',async()=>{
 const w=mount(History,{props:{clientId:12,agencyId:2,clientLabel:'Synthetic Client'}});await flushPromises();const input=w.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[{name:'synthetic.pdf',arrayBuffer:async()=>new ArrayBuffer(2)}]});await input.trigger('change');await flushPromises();
 expect(m.post).not.toHaveBeenCalled();expect(w.findAll('button').find(button=>button.text()==='Upload complete medical history').attributes('disabled')).toBeDefined();await w.get('input[type=checkbox]').setValue(true);await w.findAll('button').find(button=>button.text()==='Upload complete medical history').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledTimes(2);for(const[url,form,config]of m.post.mock.calls){expect(url).toBe('/clients/12/chart-import/medical-history');expect(form.get('identityConfirmed')).toBe('true');expect(config.headers).toEqual({'X-Agency-Id':'2'});}expect(w.text()).toContain('private file check pending');expect(w.findAll('button').some(button=>button.text()==='Open PDF')).toBe(false);w.unmount();
});
it('warns before leaving an unuploaded selected PDF',async()=>{
 const w=mount(History,{props:{clientId:12,agencyId:2}});await flushPromises();const input=w.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[{name:'synthetic.pdf',arrayBuffer:async()=>new ArrayBuffer(2)}]});await input.trigger('change');await flushPromises();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);expect(w.vm.prepareLeave()).toBe(false);expect(confirm).toHaveBeenCalledWith(expect.stringContaining('has not been uploaded'));confirm.mockRestore();w.unmount();
});

it('offers a reviewed smaller page copy after an oversized-page failure and requires readability confirmation before upload',async()=>{
 m.prepare.mockRejectedValueOnce(Object.assign(Error('Page alone exceeds the limit'),{code:'MEDICAL_ARCHIVE_PAGE_TOO_LARGE',pageNumber:3}));
 const w=mount(History,{props:{clientId:12,agencyId:2}});await flushPromises();const input=w.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[{name:'synthetic.pdf',arrayBuffer:async()=>new ArrayBuffer(2)}]});await input.trigger('change');await flushPromises();
 expect(w.text()).toContain('Page 3 still needs a smaller upload copy');expect(m.post).not.toHaveBeenCalled();
 m.prepare.mockResolvedValueOnce({filename:'synthetic.pdf',pageCount:3,convertedPages:[3],parts:[{startPage:3,endPage:3,bytes:new Uint8Array([1]),filename:'volume.pdf',title:'volume'}],manifest:{bytes:new Uint8Array([2]),filename:'manifest.pdf',title:'manifest'}});
 await w.findAll('button').find(button=>button.text()==='Prepare a smaller page copy for review').trigger('click');await flushPromises();expect(m.prepare.mock.calls.at(-1)[1].renderOversizedPage).toBeTypeOf('function');
 await w.findAll('input[type=checkbox]')[0].setValue(true);const upload=w.findAll('button').find(button=>button.text()==='Upload complete medical history');expect(upload.attributes('disabled')).toBeDefined();
 await w.findAll('input[type=checkbox]')[1].setValue(true);expect(upload.attributes('disabled')).toBeUndefined();await upload.trigger('click');await flushPromises();expect(m.post).toHaveBeenCalledTimes(2);w.unmount();
});
it('clears the previous prepared file when a newly selected PDF exceeds the input limit',async()=>{
 const w=mount(History,{props:{clientId:12,agencyId:2}});await flushPromises();const input=w.get('input[type=file]');
 Object.defineProperty(input.element,'files',{configurable:true,value:[{name:'first.pdf',size:2,arrayBuffer:async()=>new ArrayBuffer(2)}]});await input.trigger('change');await flushPromises();expect(w.find('.history-review').exists()).toBe(true);
 const read=vi.fn();Object.defineProperty(input.element,'files',{value:[{name:'too-large.pdf',size:257*1024*1024,arrayBuffer:read}]});await input.trigger('change');await flushPromises();
 expect(w.text()).toContain('Choose a PDF up to 256 MB');expect(w.find('.history-review').exists()).toBe(false);expect(read).not.toHaveBeenCalled();expect(m.post).not.toHaveBeenCalled();w.unmount();
});
