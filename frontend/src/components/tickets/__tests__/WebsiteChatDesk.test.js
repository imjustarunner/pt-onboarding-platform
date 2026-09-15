import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Desk from '../WebsiteChatDesk.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
const rows=[{id:'visitor-a',name:'ITSCO',color:'#165c4f',lastMessageId:1,visitorMessages:1},{id:'visitor-b',name:'NLU',color:'#234567',lastMessageId:2,visitorMessages:1}];
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();api.post.mockResolvedValue({data:{messages:[]}});api.get.mockImplementation(async url=>({data:url==='/website-chat/sessions'?{sessions:rows}:{messages:[],quickReplies:[{label:'Get started',body:'Welcome. https://www.itsco.health/join/itsco/counseling'}]}}));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.clearAllMocks();});
it('alerts for each website, keeps replies manual and sends to the selected visitor',async()=>{
 wrapper=mount(Desk,{global:{stubs:{teleport:true}}});await flushPromises();expect(wrapper.findAll('.visitor-toast')).toHaveLength(2);
 await wrapper.findAll('.visitor-toast button')[0].trigger('click');await flushPromises();await wrapper.find('.webchat-quick button').trigger('click');expect(wrapper.find('textarea').element.value).toContain('/join/itsco');expect(api.post.mock.calls.filter(([url])=>url.endsWith('/messages'))).toHaveLength(0);
 await wrapper.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/website-chat/sessions/visitor-a/messages',expect.objectContaining({body:expect.stringContaining('/join/itsco')}),expect.anything());
});
it('dismisses one visitor while retaining the other website toast',async()=>{
 wrapper=mount(Desk,{global:{stubs:{teleport:true}}});await flushPromises();await wrapper.find('[aria-label="Dismiss this visitor toast"]').trigger('click');expect(wrapper.findAll('.visitor-toast')).toHaveLength(1);expect(wrapper.find('.visitor-toast').text()).toContain('NLU');
});
