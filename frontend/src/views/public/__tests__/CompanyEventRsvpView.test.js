import{it,expect,vi,beforeEach}from'vitest';import{mount,flushPromises}from'@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'personal-invite'}})}));
import api from '../../../services/api';import Page from '../CompanyEventRsvpView.vue';
beforeEach(()=>{vi.resetAllMocks();api.post.mockResolvedValue({data:{ok:true}});api.get.mockResolvedValue({data:{event:{id:90,title:'Holiday potluck',potluckEnabled:true,needList:[{id:8,itemName:'Food',itemCategory:'food',isOpenRequest:true,claimed:false},{id:9,itemName:'Cups',claimed:true,mine:false}]},invitation:{response:'yes'},invitee:{firstName:'Taylor'}}});});
it('lets an invited staff member specify a dish for an open request without choosing an already claimed item',async()=>{
 const w=mount(Page);await flushPromises();expect(w.text()).toContain('What are you bringing?');expect(w.get('.potluck-signup select').text()).not.toContain('Cups');
 await w.get('.potluck-signup select').setValue('8');await w.get('.potluck-signup input').setValue('Fruit salad');await w.findAll('button').find(b=>b.text()==='Submit registration').trigger('click');await flushPromises();
 expect(w.get('[role=status]').text()).toContain('contribution saved');
 expect(api.post).toHaveBeenCalledWith('/company-events/rsvp/personal-invite',expect.objectContaining({response:'yes',registration:expect.objectContaining({needListItemId:8,needListCustomItemName:'Fruit salad'})}),expect.anything());w.unmount();
});
