import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
import api from '../../../services/api';
import Attachment from '../TrainingMediaAttachment.vue';
import DraftEditor from '../DraftHtmlEditor.vue';
beforeEach(()=>vi.clearAllMocks());
async function select(wrapper,file){const input=wrapper.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[file],configurable:true});await input.trigger('change');await flushPromises();}
it('uploads an image to its agency and escapes its caption in section HTML',async()=>{
 api.post.mockResolvedValue({data:{kind:'image',key:'uploads/training_media/agency_2/image/demo.png',url:'https://storage.example/demo'}});
 const w=mount(Attachment,{props:{agencyId:2}});await w.get('input[type=text]').setValue('Click <Save> & continue');
 await select(w,new File(['image'],'demo.png',{type:'image/png'}));const [path,body]=api.post.mock.calls[0];expect(path).toBe('/provider-update/training-media');expect(body.get('agencyId')).toBe('2');
 const html=w.emitted('attach')[0][0];expect(html).toContain('data-training-key');expect(html).toContain('Click &lt;Save&gt; &amp; continue');expect(html).toContain('<figcaption>');w.unmount();
});
it('creates a controlled video with a fallback link and prevents oversized uploads',async()=>{
 api.post.mockResolvedValue({data:{kind:'video',key:'uploads/training_media/agency_2/video/demo.mp4',url:'https://storage.example/demo'}});
 const w=mount(Attachment,{props:{agencyId:2}});await select(w,new File(['video'],'demo.mp4',{type:'video/mp4'}));expect(w.emitted('attach')[0][0]).toContain('controls preload="metadata"');expect(w.emitted('attach')[0][0]).toContain('Open video');
 await select(w,{name:'huge.mp4',size:26*1024*1024});expect(api.post).toHaveBeenCalledTimes(1);expect(w.get('[role=alert]').text()).toContain('25 MB');w.unmount();
});
it('appends media without discarding edited instructions and keeps the storage key on save',async()=>{
 const w=mount(DraftEditor,{props:{modelValue:'<p>Existing directions</p>',agencyId:2}});await flushPromises();
 w.get('[contenteditable]').element.innerHTML='<p>Edited directions</p>';
 w.findComponent(Attachment).vm.$emit('attach','<figure><img data-training-key="uploads/training_media/agency_2/image/demo.png" src="https://storage.example/demo" onerror="bad()"><figcaption>Step one</figcaption></figure>');
 await flushPromises();const html=w.emitted('update:modelValue')[0][0];expect(html).toContain('Edited directions');expect(html).toContain('data-training-key');expect(html).not.toContain('onerror');w.unmount();
});
