import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'visit-token'}})}));
vi.mock('../../../services/api',()=>({default:mocks}));
import SchoolVisitChangeView from '../SchoolVisitChangeView.vue';
describe('school change-request page',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.get.mockResolvedValue({data:{visit:{id:1,schoolName:'Test School',startsAt:'2026-10-12T19:00:00Z',modality:'in_person',location:'School',status:'booked',revision:2,calendarSyncStatus:'ready'}}});});
 it('submits a request with the revision and explains that the visit is unchanged',async()=>{
  mocks.post.mockResolvedValue({data:{message:'Your appointment stays as currently arranged until Rachel confirms a change.'}});
  const wrapper=mount(SchoolVisitChangeView);await flushPromises();
  const inputs=wrapper.findAll('input');await inputs[0].setValue('School Staff');await inputs[1].setValue('staff@example.com');await wrapper.find('textarea').setValue('Please meet virtually.');await wrapper.find('select').setValue('virtual');await wrapper.find('form').trigger('submit.prevent');await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/public/school-visits/visit-token/change-requests',expect.objectContaining({revision:2,kind:'virtual'}),expect.anything());expect(wrapper.text()).toContain('until Rachel confirms');expect(wrapper.find('form').exists()).toBe(false);wrapper.unmount();
 });
 it('does not offer change submission for a cancelled visit',async()=>{
  mocks.get.mockResolvedValue({data:{visit:{id:1,schoolName:'Test School',status:'cancelled',calendarSyncStatus:'ready'}}});
  const wrapper=mount(SchoolVisitChangeView);await flushPromises();expect(wrapper.text()).toContain('has been cancelled');expect(wrapper.find('form').exists()).toBe(false);wrapper.unmount();
 });
});
