import { afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ShareLink from '../SupervisionShareLink.vue';
afterEach(()=>vi.unstubAllGlobals());
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
