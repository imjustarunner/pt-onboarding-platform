import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),route:null}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({replace:vi.fn()})}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
import View from '../teamMeeting/PersonalMeetingInvitationView.vue';
beforeEach(()=>{vi.clearAllMocks();m.route={name:'PersonalMeetingInvitation',params:{token:'synthetic-personal-invitation'},query:{rsvp:'1',eventId:'648'},path:'/join/invitation/synthetic-personal-invitation'};m.get.mockResolvedValue({data:{meeting:{title:'Synthetic interview',recipientName:'QA Staff',when:'November 24, 12 PM MST'}}});m.post.mockResolvedValue({data:{ok:true}});});
it('requires an explicit confirmation after an email RSVP link opens',async()=>{
 m.route.query.response='accepted';const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.text()).toContain('QA Staff');expect(m.post).not.toHaveBeenCalled();
 await w.findAll('button').find(button=>button.text()==='I’m attending').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/meeting-invitations/synthetic-personal-invitation/rsvp',expect.objectContaining({eventId:648,response:'accepted'}),expect.any(Object));
 expect(w.text()).toContain('Your response has been saved');w.unmount();
});
it('opens the decline choice without letting a mail-link fetch submit it',async()=>{
 m.route.query.response='declined';const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.text()).toContain('Confirm decline');expect(m.post).not.toHaveBeenCalled();w.unmount();
});
