import {mount,flushPromises} from '@vue/test-utils';
import {describe,it,expect,vi} from 'vitest';
import KioskWelcomeView from '../../../views/KioskWelcomeView.vue';
vi.mock('vue-router',()=>({useRoute:()=>({params:{locationId:1}})}));
vi.mock('../../../utils/officeSite.js',()=>({applyOfficeInstallIdentity:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:{providers:[],locationName:'Windchime'}})}}));
describe('client landing page',()=>{
 it('shows room browsing only after explicitly choosing Office directory',async()=>{
  const wrapper=mount(KioskWelcomeView,{global:{stubs:{KioskOfficeBoard:{template:'<div data-test="board">Room directory</div>'}}}});await flushPromises();
  expect(wrapper.text()).toContain('Client check-in');expect(wrapper.find('[data-test="board"]').exists()).toBe(false);
  await wrapper.findAll('.tabs button')[1].trigger('click');expect(wrapper.find('[data-test="board"]').exists()).toBe(true);
  // Avoid relying on browser scrolling in jsdom.
  document.querySelector('.workspace')?.scrollIntoView?.();
  await wrapper.findAll('.tabs button')[0].trigger('click');await flushPromises();expect(wrapper.find('[data-test="board"]').exists()).toBe(false);wrapper.unmount();
 });
});
