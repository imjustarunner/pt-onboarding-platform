import { afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ShareLink from '../SupervisionShareLink.vue';
const api=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
afterEach(()=>vi.unstubAllGlobals());
it('prepares a host-authorized guest link separately from the account link',async()=>{
 const writeText=vi.fn().mockResolvedValue();vi.stubGlobal('navigator',{clipboard:{writeText}});
 api.post.mockResolvedValue({data:{joinUrl:'https://app.itsco.health/join/supervision/opaque?guest=1'}});
 const wrapper=mount(ShareLink,{props:{sessionId:19,canInviteGuest:true}});
 await wrapper.findAll('button').find(button=>button.text()==='Invite a guest').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/supervision/sessions/19/guest-link',{},expect.any(Object));
 expect(writeText).toHaveBeenCalledWith('https://app.itsco.health/join/supervision/opaque?guest=1');
 expect(wrapper.text()).toContain('Guests do not receive attendance credit');wrapper.unmount();
});
it('copies a session link that uses the recipient’s account',async()=>{
 const writeText=vi.fn().mockResolvedValue();vi.stubGlobal('navigator',{clipboard:{writeText}});
 const wrapper=mount(ShareLink,{props:{sessionId:19}});
 await wrapper.get('button').trigger('click');await flushPromises();
 expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/supervision/19?account=1`);
 expect(wrapper.text()).toContain('Link copied');expect(wrapper.text()).toContain('Each person signs in with their own account');wrapper.unmount();
});
it('shows a selectable link when copying is unavailable',async()=>{
 vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn().mockRejectedValue(new Error('Denied'))}});
 const wrapper=mount(ShareLink,{props:{sessionId:19}});
 await wrapper.get('button').trigger('click');await flushPromises();
 expect(wrapper.get('input').element.value).toBe(`${window.location.origin}/join/supervision/19?account=1`);
 expect(wrapper.get('[role="status"]').text()).toContain('Select and copy');wrapper.unmount();
});
