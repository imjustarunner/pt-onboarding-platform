import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,afterEach} from 'vitest';
import Office from '../PrivateVirtualOffice.vue';
const stub={name:'TherapySessionWorkspace',template:'<div />'};
afterEach(()=>vi.useRealTimers());
async function setup(encounter,admitted=[]){
 const data={waiting:[{id:7,guestDisplayName:'Second client'}],admitted,encounter};
 const request=vi.fn(async(path,options)=>{
  if(path==='/me/plan')return {plan:{privateOffice:true,multipleOfficeGuests:true}};
  if(path==='/me')return {room:{slug:'synthetic',branding:{agencyName:'Practice'}}};
  if(path==='/me/video-token')return {sessionId:'media',token:'synthetic'};
  if(path==='/me/end'){data.encounter.state='ending';return {ok:false,state:'ending'};}
  return structuredClone(data);
 });
 const wrapper=mount(Office,{props:{request},global:{stubs:{TherapySessionWorkspace:stub}}});await flushPromises();
 return {wrapper,request,data};
}
const button=(wrapper,text)=>wrapper.findAll('button').find(b=>b.text().includes(text));
it('keeps replacement admission locked when the prior client has left',async()=>{
 const {wrapper}=await setup({state:'active',hasParticipants:true},[]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();wrapper.findComponent(stub).vm.$emit('connected');await flushPromises();
 expect(button(wrapper,'Start session').attributes('disabled')).toBeDefined();
 expect(button(wrapper,'Add to this')).toBeUndefined();expect(wrapper.text()).toContain('until you end it');wrapper.unmount();
});
it('requires explicit confirmation before adding an intended couples participant',async()=>{
 const {wrapper,request}=await setup({state:'active',hasParticipants:true},[{id:1,guestDisplayName:'First client'}]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();wrapper.findComponent(stub).vm.$emit('connected');await flushPromises();
 await button(wrapper,'Add to this couples').trigger('click');await flushPromises();
 expect(request.mock.calls.some(([path])=>path.includes('/admit'))).toBe(false);
 expect(wrapper.find('[role=dialog]').text()).toContain('They will see its shared content');
 await button(wrapper,'Add to current session').trigger('click');await flushPromises();expect(request).toHaveBeenCalledWith('/lobby/7/admit',{method:'POST',body:{sameEncounter:true}});wrapper.unmount();
});
it('shows pending disconnection and prevents reopening until the server confirms completion',async()=>{
 vi.useFakeTimers();const {wrapper,data}=await setup({state:'active',hasParticipants:true});
 await button(wrapper,'End session for everyone').trigger('click');await flushPromises();
 expect(wrapper.text()).toContain('disconnecting everyone');expect(button(wrapper,'Open office video').attributes('disabled')).toBeDefined();
 data.encounter.state='ended';await vi.advanceTimersByTimeAsync(5000);await flushPromises();expect(button(wrapper,'Open office video').attributes('disabled')).toBeUndefined();wrapper.unmount();
});
