import {mount,flushPromises} from '@vue/test-utils';
import {afterEach,expect,it,vi} from 'vitest';
import Alert from '../PortalMessageAlert.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.clearAllMocks();});
it('announces new arrivals at login and while open without updating read receipts',async()=>{
 vi.useFakeTimers();
 api.get.mockResolvedValueOnce({data:{count:2,latest:10}}).mockResolvedValueOnce({data:{count:1,latest:14}});
 wrapper=mount(Alert);await flushPromises();
 expect(wrapper.text()).toContain('2 new messages');
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/message-alerts/ack',{latest:10},{skipGlobalLoading:true});
 await wrapper.get('button').trigger('click');expect(wrapper.emitted('open')).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(30000);await flushPromises();expect(wrapper.text()).toContain('a new message');
});
