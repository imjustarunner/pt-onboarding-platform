import {it,expect,vi,beforeEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('vue-router',()=>({useRoute:()=>({params:{requestId:'request-1'}}),useRouter:()=>({push:vi.fn()})}));
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));import api from '../../services/api';import StaffTextAssistantView from '../StaffTextAssistantView.vue';
const stub={props:['seedPrompt','contextAgencyId'],template:'<div class="assistant-stub">{{ seedPrompt }}</div>'};
beforeEach(()=>vi.clearAllMocks());
it('loads only the signed-in request and seeds review without executing it',async()=>{
 api.get.mockResolvedValue({data:{id:'request-1',agencyId:2,prompt:'Send message to Rachel',createdAt:'2026-10-08T12:00:00Z'}});const w=mount(StaffTextAssistantView,{global:{stubs:{AskAssistantPanel:stub}}});await flushPromises();expect(api.get).toHaveBeenCalledWith('/me/sms-assistant-requests/request-1');expect(w.findComponent(stub).props()).toMatchObject({seedPrompt:'Send message to Rachel',contextAgencyId:2});expect(w.text()).toContain('No action was taken from the text alone');
});
it('does not show an assistant or private prompt if the request is unavailable',async()=>{api.get.mockRejectedValue(new Error('403'));const w=mount(StaffTextAssistantView,{global:{stubs:{AskAssistantPanel:stub}}});await flushPromises();expect(w.find('.assistant-stub').exists()).toBe(false);expect(w.get('[role=alert]').text()).toContain('unavailable');});
