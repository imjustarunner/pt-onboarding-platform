import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
const mocks=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get}}));
import Section from '../AgencyStripeConnectSection.vue';
beforeEach(()=>vi.clearAllMocks());
it('shows charges and payouts separately while an admin continues incomplete setup',async()=>{
 mocks.get.mockResolvedValue({data:{status:'pending',chargesEnabled:true,payoutsEnabled:false,canManageConnection:true}});
 const wrapper=mount(Section,{props:{agencyId:434}});await flushPromises();
 const details=wrapper.findAll('.stripe-detail-item');expect(details.map(row=>row.text())).toEqual(['ChargesEnabled','PayoutsNot yet enabled']);
 const button=wrapper.findAll('button').find(b=>b.text()==='Continue Stripe Setup');expect(button.attributes('disabled')).toBeUndefined();expect(wrapper.text()).not.toContain('Open Stripe Dashboard');
});
it('keeps merchant management disabled for a non-administrator',async()=>{
 mocks.get.mockResolvedValue({data:{status:'pending',chargesEnabled:false,payoutsEnabled:false,canManageConnection:false}});
 const wrapper=mount(Section,{props:{agencyId:6}});await flushPromises();expect(wrapper.findAll('button').find(b=>b.text()==='Continue Stripe Setup').attributes('disabled')).toBeDefined();
});
