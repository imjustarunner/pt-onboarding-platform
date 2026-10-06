import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),replace:vi.fn(),query:{}}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'personal'},path:'/join/invitation/personal',query:m.query,fullPath:'/join/invitation/personal'}),useRouter:()=>({replace:m.replace})}));
import PersonalMeetingInvitationView from '../PersonalMeetingInvitationView.vue';
import { supervisionAccessFor } from '../../../utils/supervisionInvitationAccess';
beforeEach(()=>{vi.clearAllMocks();m.query={};});
const render=()=>mount(PersonalMeetingInvitationView,{global:{stubs:{RouterLink:true}}});
describe('personal meeting entry',()=>{
  it.each(['Mandatory · Compensated','Optional · Not compensated'])('loads %s before asking for an RSVP',async label=>{
    m.query={rsvp:'1',eventId:'19'};
    m.get.mockResolvedValue({data:{meeting:{title:'Group supervision',when:'Tomorrow',attendance:{label,description:'Attendance policy'}}}});
    m.post.mockResolvedValue({data:{ok:true}});
    const wrapper=render();expect(wrapper.findAll('button')).toHaveLength(0);await flushPromises();
    expect(m.get).toHaveBeenCalledWith('/meeting-invitations/personal',{skipAuthRedirect:true,params:{details:1,eventId:'19'}});
    expect(wrapper.text()).toContain(label);expect(wrapper.text()).toContain('does not record attendance time');
    expect(wrapper.text()).not.toContain('no online video link');
    await wrapper.get('button').trigger('click');await flushPromises();
    expect(m.post).toHaveBeenCalledWith('/meeting-invitations/personal/rsvp',{eventId:19,response:'accepted'});
    expect(wrapper.text()).toContain('Your response has been saved: Attending');expect(m.replace).not.toHaveBeenCalled();wrapper.unmount();
  });
  it('requires sign-in before displaying protected RSVP details',async()=>{
    m.query={rsvp:'1',eventId:'19'};m.get.mockRejectedValue({response:{status:401,data:{error:{message:'Sign in required'}}}});
    const wrapper=render();await flushPromises();expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.findAllComponents({name:'RouterLink'}).length).toBeGreaterThan(0);wrapper.unmount();
  });
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
