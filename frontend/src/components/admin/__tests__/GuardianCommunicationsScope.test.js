import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Tab from '../UserCommunicationsTab.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('vue-router',()=>({useRouter:()=>({currentRoute:{value:{params:{}}},push:vi.fn()})}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:[]});api.post.mockResolvedValue({data:{ok:true}});});
it('removes the agency-wide audience and targets only the selected guardian endpoint',async()=>{
 const w=mount(Tab,{props:{userId:20,userAgencies:[{id:2,name:'Practice'}],recipientOnly:true}});await flushPromises();
 expect(w.text()).not.toContain('Everyone in agency');expect(w.text()).toContain('private announcement');
 await w.get('textarea').setValue('Your requested private update');await w.findAll('button').find(b=>b.text()==='Post now').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/users/20/guardian-announcements',expect.objectContaining({recipient_user_ids:[20],agencyId:2}),{skipGlobalLoading:true});w.unmount();
});
