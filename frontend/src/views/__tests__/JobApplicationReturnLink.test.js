// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import View from '../PublicIntakeSigningView.vue';
const m=vi.hoisted(()=>({get:vi.fn(),formType:'job_application'}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:vi.fn().mockResolvedValue({data:{}}),put:vi.fn(),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{publicKey:'qa-job-key'},query:{},path:'/intake/qa-job-key'}),useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('../../components/documents/PDFPreview.vue',()=>({default:{template:'<div/>'}}));
let wrapper;
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();window.scrollTo=vi.fn();Element.prototype.scrollIntoView=vi.fn();m.formType='job_application';
 m.get.mockImplementation(async()=>({data:{link:{id:1,form_type:m.formType,scope_type:'agency',organization_id:463,intake_fields:[],intake_steps:[]},agency:{id:463,name:'Juniper QA'},organization:{id:463,name:'Juniper QA'},templates:[]}}));
});
afterEach(()=>wrapper?.unmount());
async function render(){wrapper=mount(View,{global:{plugins:[createPinia()],stubs:{DigitalFormShell:{template:'<main><slot/></main>'},SignaturePad:true}}});await flushPromises();wrapper.vm.returnLinkOpen=true;await flushPromises();}
it.each([['agreed','10 days'],['declined','12 hours']])('describes the job application and actual %s access period without clinical wording',async(status,duration)=>{
 await render();wrapper.vm.reminderConsentStatus=status;await flushPromises();
 const dialog=wrapper.get('[role="dialog"]');expect(dialog.text()).toContain('continue your job application');expect(dialog.text()).toContain(duration);expect(dialog.text()).not.toMatch(/health information|enrollment|packet/);
});
it('retains the clinical enrollment warning outside job applications',async()=>{
 m.formType='intake';await render();expect(wrapper.get('[role="dialog"]').text()).toContain('health information');
});
