import {mount,flushPromises} from '@vue/test-utils';import {it,expect,vi} from 'vitest';
const get=vi.hoisted(()=>vi.fn());vi.mock('../../../services/api',()=>({default:{get}}));vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'nlu-qa-demo'}})}));
import Details from '../AppointmentOutcomeDetails.vue';
it('opens only canonical history, never a synthetic provider event, and closes with Escape',async()=>{get.mockResolvedValue({data:{id:371,status:'no_show',businessType:'tutoring',startAt:'2026-11-17 21:00:00',endAt:'2026-11-17 22:00:00'}});const w=mount(Details,{props:{appointmentId:371},global:{stubs:{Teleport:true,RouterLink:true,AppointmentNoShowStatus:true}}});try{await flushPromises();expect(get).toHaveBeenCalledWith('/appointments/371',expect.objectContaining({skipGlobalLoading:true}));expect(w.text()).toContain('read-only');expect(w.find('input').exists()).toBe(false);expect(w.find('select').exists()).toBe(false);await w.get('.outcome-backdrop').trigger('keydown',{key:'Escape'});expect(w.emitted('close')).toHaveLength(1);}finally{w.unmount();}});

it('offers an authorized new booking without changing the missed appointment',async()=>{
 const appointment={id:418,businessType:'tutoring',status:'no_show',modality:'IN_PERSON'};
 get.mockResolvedValue({data:{appointment}});
 const wrapper=mount(Details,{props:{appointmentId:418},global:{stubs:{Teleport:true,RouterLink:true,AppointmentNoShowStatus:true}}});
 try {
  await flushPromises();
  expect(wrapper.find('button.makeup').exists()).toBe(false);
  await wrapper.setProps({canBook:true});await wrapper.get('button.makeup').trigger('click');
  expect(wrapper.emitted('makeup')).toEqual([[appointment]]);
 } finally {wrapper.unmount();}
});
