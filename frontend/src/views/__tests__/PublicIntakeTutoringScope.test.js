// @vitest-environment-options {"url":"https://app.nextleveluplcc.com/"}
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import View from '../PublicIntakeSigningView.vue';
const {get,post,route}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),route:{params:{publicKey:'tutor-test'},query:{session:'qa-draft'},path:'/intake/tutor-test'}}));
vi.mock('../../services/api',()=>({default:{get,post,put:vi.fn(),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace:vi.fn().mockResolvedValue(undefined),push:vi.fn()})}));
vi.mock('../../components/documents/PDFPreview.vue',()=>({default:{template:'<div/>'}}));
let w;
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();window.scrollTo=vi.fn();Element.prototype.scrollIntoView=vi.fn();post.mockReset().mockResolvedValue({data:{}});
 get.mockReset().mockImplementation(async url=>({data:url==='/public-intake/tutor-test'?{link:{id:1,form_type:'intake',scope_type:'agency',organization_id:453,master_channel:'tutoring',inherits_office_master:1,intake_fields:[],intake_steps:[{id:'counseling_dep_about_you',type:'questions',fields:[{key:'guardian_dob',required:true}]},{id:'counseling_dep_about_child',type:'questions',fields:[{key:'child_sex',required:true}]},{type:'packet_hipaa_notice'},{type:'smart_disclosure'}]},agency:{id:453,name:'NLU QA',slug:'nlu-qa-demo'},organization:{id:453,name:'NLU QA',slug:'nlu-qa-demo',organization_type:'agency'},templates:[]}:url.endsWith('/progress')?{submissionId:12,intakeData:null}:{}}));
});
afterEach(()=>w?.unmount());
async function render(){w=mount(View,{global:{plugins:[createPinia()],stubs:{DigitalFormShell:{template:'<main><slot/></main>'},SignaturePad:true,LearningEnrollmentQuestions:true}}});await flushPromises();}
it('removes clinical inherited steps while keeping the learning and tutoring agreement',async()=>{
 await render();expect(w.vm.isTutoringEnrollment).toBe(true);expect(w.vm.isOfficeInDepthIntake).toBe(false);
 expect(w.vm.intakeSteps.map(s=>s.id)).toEqual(['learning-enrollment','tutoring_provider_preference','tutoring_services_agreement']);
 expect(w.vm.otherGuardianContactOk()).toBe(true);
 w.vm.intakeResponses.submission.other_guardian_portal_requested='yes';
 expect(w.vm.otherGuardianFieldBag()).toEqual({other_guardian_portal_requested:'yes',other_guardian_send_intake_link:'no'});
});
it('rejects malformed email before continuing and allows an omitted tutoring phone',async()=>{
 await render();w.vm.serviceSubject='dependent';w.vm.intakeForSelf=false;w.vm.guardianFirstName='Morgan';w.vm.guardianLastName='QA';w.vm.guardianRelationship='Parent';w.vm.guardianEmail='qa.nlu.parent@';w.vm.guardianPhone='';w.vm.clients=[{firstName:'Parker',lastName:'QA',dateOfBirth:'2016-04-12'}];
 await flushPromises();await w.vm.continueWhoFor();await flushPromises();
 expect(w.vm.consentErrors.guardianEmail).toContain('valid email');expect(w.vm.consentErrors.guardianPhone).toBe('');expect(post.mock.calls.some(([url])=>url.endsWith('/consent'))).toBe(false);
});
it('submits the tutoring contact step without a parent DOB, phone or automatic co-guardian invitation',async()=>{
 await render();w.vm.serviceSubject='dependent';w.vm.intakeForSelf=false;w.vm.guardianFirstName='Morgan';w.vm.guardianLastName='QA';w.vm.guardianRelationship='Parent';w.vm.guardianEmail='qa.nlu.parent@example.com';w.vm.guardianPhone='';w.vm.clients=[{firstName:'Parker',lastName:'QA',dateOfBirth:'2016-04-12'}];
 w.vm.intakeResponses.submission.other_guardian_portal_requested='yes';await flushPromises();await w.vm.continueWhoFor();await flushPromises();
 expect(w.vm.consentErrors.guardianEmail).toBe('');expect(w.vm.consentErrors.guardianPhone).toBe('');
 const request=post.mock.calls.find(([url])=>url.endsWith('/consent'));
 expect(request).toBeTruthy();expect(request[1].signerEmail).toBe('qa.nlu.parent@example.com');
 expect(request[1].signerPhone||'').toBe('');expect(request[1].intakeData.responses.guardian.other_guardian_send_intake_link).toBe('no');
});
