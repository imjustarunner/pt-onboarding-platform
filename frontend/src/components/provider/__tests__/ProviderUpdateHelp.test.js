import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const capture=vi.hoisted(()=>vi.fn());vi.mock('html2canvas',()=>({default:capture}));
const api=vi.hoisted(()=>({post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
import Help from '../ProviderUpdateHelp.vue';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:test-image'),revokeObjectURL:vi.fn()});capture.mockResolvedValue({toBlob:cb=>cb(new Blob(['image'],{type:'image/png'}))});});
afterEach(()=>vi.unstubAllGlobals());
it('submits the selected client context and description through the support ticket endpoint',async()=>{
 api.post.mockResolvedValue({data:{ticketId:71}});const w=mount(Help,{props:{base:'/public/provider-update/test',agencyId:2,client:{id:12,firstName:'Sample',schoolName:'Example School'}}});
 await w.get('button').trigger('click');await w.get('textarea').setValue('Possible duplicate record');await w.get('form').trigger('submit');await flushPromises();
 const [url,body]=api.post.mock.calls[0];expect(url).toBe('/public/provider-update/test/help-ticket');expect(body.get('clientId')).toBe('12');expect(body.get('question')).toBe('Possible duplicate record');expect(w.text()).toContain('Ticket #71');w.unmount();
});
it('does not send a ticket from a read-only preview',async()=>{const w=mount(Help,{props:{readonly:true,client:{id:12}}});await w.get('button').trigger('click');await w.get('form').trigger('submit');expect(api.post).not.toHaveBeenCalled();w.unmount();});

it('sends a People Operations question with a pasted screenshot',async()=>{
 api.post.mockResolvedValue({data:{ticketId:72,topic:'people_operations'}});const w=mount(Help,{props:{base:'/public/provider-update/test',agencyId:2}});
 await w.get('button').trigger('click');await w.get('select').setValue('people_operations');await w.get('textarea').setValue('Please explain this benefit.');
 const file=new File(['png'],'Pasted screenshot.png',{type:'image/png'});
 await w.get('form').trigger('paste',{clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>file}]}});
 expect(w.findAll('.attachments img')).toHaveLength(1);await w.get('form').trigger('submit');await flushPromises();
 const body=api.post.mock.calls[0][1];expect(body.get('topic')).toBe('people_operations');expect(body.getAll('screenshots')).toHaveLength(1);expect(w.text()).toContain('submitted to People Operations');expect(w.findAll('.attachments img')).toHaveLength(0);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-image');w.unmount();
});
it('captures the visible page and allows removal before sending',async()=>{
 const w=mount(Help);await w.get('button').trigger('click');await w.findAll('button').find(b=>b.text().includes('Take screenshot')).trigger('click');await flushPromises();
 expect(capture).toHaveBeenCalledWith(document.body,expect.objectContaining({width:window.innerWidth,height:window.innerHeight,allowTaint:false}));expect(w.findAll('.attachments img')).toHaveLength(1);
 await w.get('.attachments button').trigger('click');expect(w.findAll('.attachments img')).toHaveLength(0);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('uploads images cumulatively and rejects over-limit attachments',async()=>{
 const w=mount(Help);await w.get('button').trigger('click');const input=w.get('input[type="file"]');const file=new File(['png'],'Uploaded.png',{type:'image/png'});
 Object.defineProperty(input.element,'files',{configurable:true,value:[file,file]});await input.trigger('change');expect(w.findAll('.attachments img')).toHaveLength(2);
 Object.defineProperty(input.element,'files',{configurable:true,value:[file,file]});await input.trigger('change');expect(w.text()).toContain('Choose up to three images');expect(w.findAll('.attachments img')).toHaveLength(2);w.unmount();
});
it('offers paste/upload when browser page capture fails without submitting anything',async()=>{
 capture.mockRejectedValueOnce(new Error('Unsupported capture'));const w=mount(Help);await w.get('button').trigger('click');await w.findAll('button').find(b=>b.text().includes('Take screenshot')).trigger('click');await flushPromises();expect(w.text()).toContain('paste or upload it here');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
