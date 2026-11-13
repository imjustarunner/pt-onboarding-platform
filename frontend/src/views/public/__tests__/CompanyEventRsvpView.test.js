import{it,expect,vi,beforeEach}from'vitest';import{mount,flushPromises}from'@vue/test-utils';
const state=vi.hoisted(()=>({query:{}}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'personal-invite'},query:state.query})}));
import api from '../../../services/api';import Page from '../CompanyEventRsvpView.vue';
beforeEach(()=>{state.query={};vi.resetAllMocks();api.post.mockResolvedValue({data:{ok:true}});api.get.mockResolvedValue({data:{event:{id:90,title:'Holiday potluck',potluckEnabled:true,needList:[{id:8,itemName:'Food',itemCategory:'food',isOpenRequest:true,claimed:false},{id:9,itemName:'Cups',claimed:true,mine:false}]},invitation:{response:'yes'},invitee:{firstName:'Taylor'}}});});
it('keeps a personal RSVP on the readable event URL and rejects a token for another event',async()=>{
 const w=mount(Page,{props:{invitationToken:'personal-invite',expectedEventId:91}});await flushPromises();
 expect(w.text()).toContain('belongs to a different event');expect(w.find('.response-row').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('ignores the delayed response for a different personal invitation after navigation',async()=>{
 let first;api.get.mockImplementation(url=>url.endsWith('/old')?new Promise(resolve=>{first=resolve;}):Promise.resolve({data:{event:{id:91,title:'Current event'},invitation:{},invitee:{firstName:'Demo'}}}));
 const w=mount(Page,{props:{invitationToken:'old'}});await w.setProps({invitationToken:'new'});await flushPromises();
 expect(w.text()).toContain('Current event');first({data:{event:{id:90,title:'Old event'},invitation:{},invitee:{}}});await flushPromises();
 expect(w.text()).toContain('Current event');expect(w.text()).not.toContain('Old event');w.unmount();
});
it('lets an invited staff member specify a dish for an open request without choosing an already claimed item',async()=>{
 const w=mount(Page);await flushPromises();expect(w.text()).toContain('What are you bringing?');expect(w.get('.potluck-signup select').text()).not.toContain('Cups');
 await w.get('.potluck-signup select').setValue('8');await w.get('.potluck-signup input').setValue('Fruit salad');await w.findAll('button').find(b=>b.text()==='Submit registration').trigger('click');await flushPromises();
 expect(w.get('[role=status]').text()).toContain('contribution saved');
 expect(api.post).toHaveBeenCalledWith('/company-events/rsvp/personal-invite',expect.objectContaining({response:'yes',registration:expect.objectContaining({needListItemId:8,needListCustomItemName:'Fruit salad'})}),expect.anything());w.unmount();
});

it('previews the chosen email response for an undated event and writes only after confirmation',async()=>{
 state.query={r:'maybe'};const w=mount(Page);await flushPromises();expect(w.text()).toContain('Date and time to be decided');expect(w.text()).toContain('You selected');expect(api.post).not.toHaveBeenCalled();
 await w.findAll('button').find(button=>button.text()==='Confirm MAYBE').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/company-events/rsvp/personal-invite',expect.objectContaining({response:'maybe'}),expect.anything());w.unmount();
});
