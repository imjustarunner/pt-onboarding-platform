import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('vue-router',()=>({useRoute:()=>({params:{providerUserId:'9'}})}));
vi.mock('../../../store/organization',()=>({useOrganizationStore:()=>({organizationContext:{id:280,name:'Example School'}})}));
vi.mock('../../../components/school/redesign/ProviderSchoolProfile.vue',()=>({default:{name:'ProviderSchoolProfile',emits:['open-client'],template:'<div />'}}));
vi.mock('../../../components/school/redesign/ClientModal.vue',()=>({default:{name:'ClientModal',props:['client'],template:'<div />'}}));
import View from '../ProviderSchoolProfileView.vue';
it('opens an expired-ROI client despite a stale lock flag and keeps missing-ROI clients restricted',async()=>{
 for(const state of ['expired','packet']){
  const w=mount(View);w.findComponent({name:'ProviderSchoolProfile'}).vm.$emit('open-client',{id:12,school_staff_effective_access_state:state,school_portal_can_open:false});await flushPromises();
  expect(w.findComponent({name:'ClientModal'}).exists()).toBe(state==='expired');w.unmount();
 }
});
