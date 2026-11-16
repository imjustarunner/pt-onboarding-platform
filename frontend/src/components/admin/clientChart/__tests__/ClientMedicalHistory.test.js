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
