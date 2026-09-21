import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),replace:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'personal'}}),useRouter:()=>({replace:m.replace})}));
import PersonalMeetingInvitationView from '../PersonalMeetingInvitationView.vue';
beforeEach(()=>vi.clearAllMocks());
const render=()=>mount(PersonalMeetingInvitationView,{global:{stubs:{RouterLink:true}}});
describe('personal meeting entry',()=>{
  it('opens the resolved meeting without changing the signed-in identity',async()=>{
    m.get.mockResolvedValue({data:{joinUrl:`${window.location.origin}/join/team-meeting/allowed`}});
    const wrapper=render();await flushPromises();expect(m.get).toHaveBeenCalledWith('/meeting-invitations/personal');expect(m.replace).toHaveBeenCalledWith('/join/team-meeting/allowed');wrapper.unmount();
  });
  it('explains wrong-account errors without joining',async()=>{
    m.get.mockRejectedValue({response:{data:{error:{message:'This invitation belongs to another account.'}}}});
    const wrapper=render();await flushPromises();expect(wrapper.get('[role="alert"]').text()).toContain('another account');expect(m.replace).not.toHaveBeenCalled();wrapper.unmount();
  });
  it('shows in-person details instead of a broken video room',async()=>{
    m.get.mockResolvedValue({data:{joinUrl:null,meeting:{title:'Leadership',when:'Monday 4 PM',location:'Room 204'}}});
    const wrapper=render();await flushPromises();expect(wrapper.text()).toContain('Room 204');expect(wrapper.text()).toContain('no online video link');expect(m.replace).not.toHaveBeenCalled();wrapper.unmount();
  });
});
