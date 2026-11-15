import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:501,credential:'Provider'}})}));
import Letter from '../AppointmentAttendanceLetter.vue';
let wrapper,plan;
beforeEach(()=>{
 vi.clearAllMocks();plan={id:17,version:1,currentVersion:1,clientId:71,contentHash:'a'.repeat(64),branding:{name:'Example practice'},template:{key:'attendance-verification',title:'Appointment letter',sections:[]},data:{personLabel:'Example Client',appointmentDate:'2026-11-12',startTime:'10:00',endTime:'11:00',timezone:'America/Denver',location:'Example office',issuerName:'Avery Lane',issuerTitle:'Provider',attendanceStatus:'Confirmed attended'},signers:[]};
 m.get.mockImplementation(async url=>({data:url==='/clinical-forms/template'?{template:plan.template,branding:plan.branding,client:{id:71,agencyId:7,name:'Example Client'},prefill:plan.data}:url==='/clinical-forms'?{plans:[]}:url.endsWith('/attendance-delivery')?{recipients:[{key:'user:902',kind:'guardian',name:'Parent Example',email:'parent@example.test',phone:'+13035550101',channels:{email:true,portal:true,sms:true},reasons:{}}],deliveries:[],sender:{from:'+13035550100'}}:plan}));
 m.post.mockImplementation(async url=>{if(url.endsWith('/signers'))plan={...plan,signers:[{id:9,kind:'clinician',userId:501,name:'Avery Lane'}]};return {data:plan};});
});
afterEach(()=>wrapper?.unmount());
const mountLetter=()=>mount(Letter,{props:{eventType:'provider',eventId:88},global:{stubs:{Teleport:true,SafetyPlanDocument:true,SafetyPlanSigning:true}}});
it('keeps generation, signature and selected delivery inside the appointment without opening another window',async()=>{
 const open=vi.spyOn(window,'open').mockImplementation(()=>null);wrapper=mountLetter();await flushPromises();
 expect(m.get).toHaveBeenCalledWith('/clinical-forms/template',expect.objectContaining({params:expect.objectContaining({eventType:'provider',eventId:88})}));
 await wrapper.get('footer .letter-primary').trigger('click');await flushPromises();expect(m.post).toHaveBeenCalledWith('/clinical-forms',expect.objectContaining({agencyId:7,clientId:71,eventId:88}));
 plan={...plan,signers:[{...plan.signers[0],signedAt:'2026-11-12T18:00:00Z',evidence:{name:'Avery Lane'}}]};
 wrapper.findComponent({name:'SafetyPlanSigning'}).vm.$emit('signed');await flushPromises();expect(wrapper.text()).toContain('Your signed letter is ready');
 await wrapper.get('.letter-channels input[value="email"]').setValue(true);await wrapper.get('.letter-channels input[value="sms"]').setValue(true);await wrapper.get('.letter-check input').setValue(true);
 expect(wrapper.vm.$.setupState.channels).toEqual(expect.arrayContaining(['email','portal','sms']));
 m.post.mockResolvedValueOnce({data:{deliveries:[{recipientKey:'user:902',channel:'email',status:'sent'},{recipientKey:'user:902',channel:'portal',status:'sent'},{recipientKey:'user:902',channel:'sms',status:'failed',error:'Text consent changed.'}]}});
 await wrapper.get('.letter-delivery .letter-primary').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenLastCalledWith('/clinical-forms/17/attendance-delivery',expect.objectContaining({channels:expect.arrayContaining(['email','portal','sms']),authorityConfirmed:true}));
 expect(wrapper.text()).toContain('Portal copy posted');expect(wrapper.text()).toContain('Email · Sent');expect(wrapper.text()).toContain('Text · Not sent');expect(open).not.toHaveBeenCalled();open.mockRestore();
});
it('resumes the existing signed letter for the selected session without generating a second record',async()=>{
 plan.signers=[{id:9,kind:'clinician',userId:501,name:'Avery Lane',signedAt:'2026-11-12T18:00:00Z'}];const original=m.get.getMockImplementation();m.get.mockImplementation((url,...args)=>url==='/clinical-forms'?Promise.resolve({data:{plans:[{id:17,documentKey:'attendance-verification',appointment:{eventType:'provider',eventId:88}}]}}):original(url,...args));
 wrapper=mountLetter();await flushPromises();expect(wrapper.text()).toContain('Your signed letter is ready');expect(m.post).not.toHaveBeenCalled();
});
