import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Tab from '../UserCommunicationsTab.vue';
import api from '../../../services/api';
vi.mock('../GuardianCommunicationsWorkspace.vue',()=>({default:{template:'<div>Guardian message workspace</div>'}}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('vue-router',()=>({useRouter:()=>({currentRoute:{value:{params:{}}},push:vi.fn()})}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:[]});api.post.mockResolvedValue({data:{ok:true}});});
it('removes the agency-wide audience and targets only the selected guardian endpoint',async()=>{
 const w=mount(Tab,{props:{userId:20,userAgencies:[{id:2,name:'Practice'}],recipientOnly:true}});await flushPromises();
 expect(w.text()).not.toContain('Everyone in agency');expect(w.text()).toContain('private announcement');
 await w.get('textarea').setValue('Your requested private update');await w.findAll('button').find(b=>b.text()==='Post now').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/users/20/guardian-announcements',expect.objectContaining({recipient_user_ids:[20],agencyId:2}),{skipGlobalLoading:true});w.unmount();
});
it('previews the exact message as escaped text and switches to a splash preview without posting',async()=>{
 const w=mount(Tab,{props:{userId:20,userAgencies:[{id:2,name:'Practice'}],recipientOnly:true}});await flushPromises();
 await w.get('.announcement-title input').setValue('Family update');
 await w.get('.announcement-message textarea').setValue('<script>alert(1)</script>\nYour appointment is confirmed.');
 expect(w.get('.announcement-preview h4').text()).toBe('Family update');
 expect(w.get('.preview-message').text()).toContain('<script>alert(1)</script>');
 expect(w.find('.announcement-preview script').exists()).toBe(false);
 await w.findAll('.announcement-fields select')[1].setValue('splash');
 expect(w.find('.preview-splash').exists()).toBe(true);
 await w.get('.splash-image-fields input[type=url]').setValue('javascript:alert(1)');
 expect(w.find('.announcement-preview img').exists()).toBe(false);
 await w.get('.splash-image-fields input[type=url]').setValue('https://example.test/splash.png');
 expect(w.get('.announcement-preview img').attributes('src')).toBe('https://example.test/splash.png');
 expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('keeps a draft visible and blocks posting when its end date precedes its start',async()=>{
 const w=mount(Tab,{props:{userId:20,userAgencies:[{id:2,name:'Practice'}],recipientOnly:true}});await flushPromises();
 await w.get('textarea').setValue('Keep this draft');const dates=w.findAll('input[type=datetime-local]');
 await dates[0].setValue('2026-11-23T12:00');await dates[1].setValue('2026-11-22T12:00');
 expect(w.text()).toContain('Choose an end time after the start time.');
 expect(w.findAll('button').find(b=>b.text()==='Post now').element.disabled).toBe(true);
 expect(w.get('.preview-message').text()).toBe('Keep this draft');w.unmount();
});
