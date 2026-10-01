import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),replace:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'personal'},query:{},fullPath:'/join/invitation/personal'}),useRouter:()=>({replace:m.replace})}));
import PersonalMeetingInvitationView from '../PersonalMeetingInvitationView.vue';
import { supervisionAccessFor } from '../../../utils/supervisionInvitationAccess';
beforeEach(()=>vi.clearAllMocks());
const render=()=>mount(PersonalMeetingInvitationView,{global:{stubs:{RouterLink:true}}});
describe('personal meeting entry',()=>{
  it('opens the resolved meeting without changing the signed-in identity',async()=>{
    m.get.mockResolvedValue({data:{joinUrl:`${window.location.origin}/join/team-meeting/allowed`}});
    const wrapper=render();await flushPromises();expect(m.get).toHaveBeenCalledWith('/meeting-invitations/personal',{skipAuthRedirect:true,params:{}});expect(m.replace).toHaveBeenCalledWith('/join/team-meeting/allowed');wrapper.unmount();
  });
  it('opens personal supervision without sign-in and retains its scoped grant in this tab',async()=>{
    const access={sessionId:19,token:'scoped-test-grant',expiresAt:Date.now()+60000};
    m.get.mockResolvedValue({data:{joinUrl:`${window.location.origin}/join/supervision/19`,supervisionAccess:access}});
    const wrapper=render();await flushPromises();
    expect(m.replace).toHaveBeenCalledWith('/join/supervision/19');expect(supervisionAccessFor(19)).toEqual(access);
    expect(localStorage.getItem('authToken')).toBeNull();wrapper.unmount();
  });
  it('offers sign-in for an invitation that still requires an app account',async()=>{
    m.get.mockRejectedValue({response:{status:401,data:{error:{message:'Sign in required'}}}});
    const wrapper=render();await flushPromises();expect(wrapper.findAllComponents({name:'RouterLink'}).length).toBeGreaterThan(0);
    expect(m.replace).not.toHaveBeenCalled();wrapper.unmount();
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
