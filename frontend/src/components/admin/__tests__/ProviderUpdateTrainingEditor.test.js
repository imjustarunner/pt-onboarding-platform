// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Editor from '../ProviderUpdateTrainingEditor.vue';
const m=vi.hoisted(()=>({post:vi.fn()}));vi.mock('../../../services/api',()=>({default:m}));
beforeEach(()=>{vi.clearAllMocks();m.post.mockResolvedValue({data:{push:{id:2,section_config_json:{pin:true}},delivery:{sent:3,pending:1,failed:0}}});});
function render(){return mount(Editor,{props:{agencyId:2,pushId:2,config:{pin:true}},global:{stubs:{TrainingMediaAttachment:true}}});}
it('saves only the chosen section and requests notices for new guides, including completed staff',async()=>{const w=render();await w.findAll('input')[0].setValue('Create your Quick View code');w.findComponent({name:'TrainingMediaAttachment'}).vm.$emit('attach','<img data-training-key="uploads/training_media/agency_2/image/a.png">');await flushPromises();await w.findAll('button').find(b=>b.text().startsWith('Save guides')).trigger('click');await flushPromises();const [url,body]=m.post.mock.calls[0];expect(url).toBe('/provider-update/pushes/2/training/pin');expect(body.notify).toBe(true);expect(body.guides[0].title).toBe('Create your Quick View code');expect(body.sectionConfig).toBeUndefined();expect(w.text()).toContain('3 sent, 1 queued / pending delivery, 0 failed');expect(w.emitted('saved')).toHaveLength(1);w.unmount();});
it('can save an unannounced draft without sending notifications',async()=>{const w=render();await w.get('input[type=checkbox]').setValue(false);await w.findAll('button').find(b=>b.text().startsWith('Save guides')).trigger('click');await flushPromises();expect(m.post.mock.calls[0][1].notify).toBe(false);w.unmount();});
