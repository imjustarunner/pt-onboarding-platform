import{beforeEach,it,expect,vi}from'vitest';
import{mount,flushPromises}from'@vue/test-utils';
import View from'../GuardianClinicalBooking.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));vi.mock('../../../services/api',()=>({default:m}));
beforeEach(()=>{vi.clearAllMocks();});
it('shows a retryable tutoring booking error without submitting a booking',async()=>{
 m.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({data:{choices:[{providerId:1496,serviceId:320,providerName:'QA Tutor',serviceName:'Tutoring',terms:{sessionFeeCents:5000}}]}});
 const w=mount(View,{props:{learning:true,clientId:2545,agencyId:453,serviceId:1038}});await flushPromises();
 expect(w.get('[role=alert]').text()).toContain('could not be loaded');await w.get('[role=alert] button').trigger('click');await flushPromises();
 expect(w.text()).toContain('Book a session');expect(m.post).not.toHaveBeenCalled();expect(m.get).toHaveBeenLastCalledWith('/guardian-portal/clients/2545/session-booking',expect.objectContaining({params:{agencyId:453,serviceId:1038}}));w.unmount();
});
it('makes an unassigned tutoring relationship actionable without a disabled clinical transition control',async()=>{
 m.get.mockResolvedValue({data:{choices:[]}});const w=mount(View,{props:{learning:true,clientId:2545}});await flushPromises();expect(w.text()).toContain('Your learning team can help arrange');expect(w.text()).not.toContain('TherapyNotes');expect(m.post).not.toHaveBeenCalled();w.unmount();
});
