import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
const { get, post, route } = vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),route:{params:{publicKey:'office-test'},query:{},path:'/intake/office-test'}}));
vi.mock('../../services/api',()=>({default:{get,post,put:vi.fn(),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('../../components/documents/PDFPreview.vue',()=>({default:{template:'<div/>'}}));
const people=[{id:9,name:'Open Provider',acceptingNewClients:true,waitlist:false,intakeStatusByFormat:{VIRTUAL:'accepting',IN_PERSON:'unavailable'}},{id:10,name:'Waitlist Provider',acceptingNewClients:false,waitlist:true,intakeStatusByFormat:{VIRTUAL:'waitlist',IN_PERSON:'unavailable'}}];
const data={branding:{enrollmentProduct:'auricwell'},link:{id:1,form_type:'intake',scope_type:'agency',agency_id:2,organization_id:2,inherits_office_master:1,master_channel:'counseling',intake_steps:[{id:'needs',type:'questions',label:'Your needs',fields:[{key:'main_reason_seeking',label:'What would you like help with?',type:'text'}]},{id:'providers',type:'provider_match',label:'Choose a provider'},{id:'next',type:'communications',label:'Communications'}],intake_fields:[]},organization:{id:2,name:'Example Agency',organization_type:'agency'},agency:{id:2,name:'Example Agency',slug:'test'},templates:[]};
let wrapper;
beforeEach(()=>{route.query={};sessionStorage.clear();localStorage.clear();window.scrollTo=vi.fn();Element.prototype.scrollIntoView=vi.fn();get.mockReset().mockImplementation(async url=>({data:url==='/public-intake/office-test'?structuredClone(data):url.endsWith('/available-providers')?{providers:people}: {}}));post.mockReset().mockResolvedValue({data:{}});});
afterEach(()=>wrapper?.unmount());
async function render(){wrapper=mount(PublicIntakeSigningView,{global:{plugins:[createPinia()],stubs:{DigitalFormShell:{template:'<main><slot/></main>'},SignaturePad:true,PublicProviderSlotPicker:true}}});await flushPromises();}
async function showProviderStep(){wrapper.vm.intakeForSelf=true;wrapper.vm.serviceSubject='self';wrapper.vm.step=2;wrapper.vm.currentFlowIndex=wrapper.vm.flowSteps.findIndex(s=>s.type==='provider_match');await flushPromises();}
it('claims email delivery only after a transport receipt and exposes a packet reference', async()=>{
 await render();wrapper.vm.step=3;wrapper.vm.submissionId=1271;wrapper.vm.guardianEmail='qa.family@example.com';await flushPromises();
 expect(wrapper.vm.intakeSuccessEmailMessage).toContain('has not been confirmed');
 expect(wrapper.text()).toContain('Reference number: 1271');
 wrapper.vm.packetNeedsReview=true;await flushPromises();expect(wrapper.vm.intakeSuccessEmailMessage).toContain('needs review');
 wrapper.vm.emailDeliveryStatus={attempted:true,sent:true};await flushPromises();expect(wrapper.vm.intakeSuccessEmailMessage).toContain('emailed to qa.family@example.com');
 wrapper.vm.emailDeliveryStatus={attempted:true,sent:false};await flushPromises();expect(wrapper.vm.intakeSuccessEmailMessage).toContain('failed to send');
});
it('records the requested provider and modality before full consent and preserves them on old draft restore',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};await render();
 expect(wrapper.vm.intakeResponses.submission).toMatchObject({enrollment_source:'provider',requested_profile_provider_id:9,preferred_office_provider_ids:['9'],preferred_service_format:'VIRTUAL'});
 wrapper.vm.applyDraftSnapshot({intakeResponses:{submission:{},clients:[{}]},clients:[{firstName:'Test',lastName:'Client'}]});await flushPromises();
 expect(wrapper.vm.intakeResponses.submission.requested_profile_provider_id).toBe(9);
});
it('asks matching preferences before showing compact providers in general full enrollment',async()=>{
 await render();await showProviderStep();
 expect(wrapper.find('#enrollment-provider-format').exists()).toBe(true);expect(wrapper.find('.cpd--intake').exists()).toBe(false);
 await wrapper.findAll('button').find(b=>b.text()==='Show matching providers').trigger('click');await flushPromises();
 expect(wrapper.find('.cpd--intake').exists()).toBe(true);expect(wrapper.text()).toContain('does not guarantee placement');
});
it('skips a profile provider without silently restoring the selection',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};await render();await showProviderStep();
 await wrapper.vm.skipEnrollmentProvider();await flushPromises();
 expect(wrapper.vm.intakeResponses.submission).toMatchObject({enrollment_source:'general',requested_profile_provider_id:null,preferred_office_provider_ids:[]});
 await wrapper.vm.loadOfficeIntakeProviders();expect(wrapper.vm.selectedOfficeProviderIds).toEqual([]);
});
it('does not attach a virtual time to a profile request for in-person care',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'IN_PERSON'};sessionStorage.setItem('provider-hold:test',JSON.stringify({providerId:9,serviceType:'counseling',modality:'VIRTUAL',token:'different-format'}));await render();wrapper.vm.restoreEntryOpeningPreference();
 expect(wrapper.vm.providerHoldToken).toBeNull();
});

it('clears a hidden provider request and held time when the selected preferences exclude that provider',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};await render();await showProviderStep();
 sessionStorage.setItem('provider-hold:test',JSON.stringify({providerId:9,serviceType:'counseling',modality:'VIRTUAL',token:'held-time'}));
 wrapper.vm.officeProviders=[{...people[0],clinicalFocus:{excluded:{specialties:['Depression']}}},people[1]];
 wrapper.vm.intakeResponses.clients[0].matchingPreferences={specialties:['Depression']};await flushPromises();
 expect(wrapper.vm.selectedOfficeProviderIds).toEqual([]);expect(wrapper.vm.intakeResponses.submission.enrollment_source).toBe('general');
 expect(post).toHaveBeenCalledWith('/public/agency-services/test/release-hold',{token:'held-time'},expect.any(Object));
});
it('never exposes provider choice on brief or interest packets',async()=>{
 get.mockImplementation(async url=>({data:url==='/public-intake/office-test'?{...structuredClone(data),link:{...structuredClone(data.link),form_type:'quick_intake'}}:{}}));await render();
 expect(wrapper.vm.allowsFullProviderChoice).toBe(false);expect(wrapper.vm.flowSteps.some(s=>s.type==='provider_match')).toBe(false);
});
it('never exposes provider choice on school enrollment, even with a legacy provider step',async()=>{
 get.mockImplementation(async url=>({data:url==='/public-intake/office-test'?{...structuredClone(data),link:{...structuredClone(data.link),scope_type:'school',inherits_office_master:0},organization:{id:3,name:'Example School',organization_type:'school'}}:{}}));await render();
 expect(wrapper.vm.allowsFullProviderChoice).toBe(false);
 expect(wrapper.vm.flowSteps.some(s=>s.type==='provider_match')).toBe(false);
 expect(get.mock.calls.some(([url])=>url.endsWith('/available-providers'))).toBe(false);
});

it('keeps optional scheduling preferences even when the client skips choosing a provider',async()=>{
 await render();await showProviderStep();
 await wrapper.find('input[type="checkbox"][value="Tuesday"]').setValue(true);
 await wrapper.find('input[type="checkbox"][value="Evening"]').setValue(true);
 await wrapper.find('#enrollment-preference-timezone').setValue('America/Denver');
 await wrapper.find('#enrollment-scheduling-notes').setValue('After 4 PM, every other week');
 await wrapper.vm.skipEnrollmentProvider();await flushPromises();
 expect(wrapper.vm.intakeResponses.submission).toMatchObject({preferred_days:['Tuesday'],preferred_times:['Evening'],preferred_time_zone:'America/Denver',preferred_scheduling_notes:'After 4 PM, every other week',preferred_office_provider_ids:[]});
});

it('preserves a new profile choice over an older general or different-provider draft',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};await render();
 for(const saved of [{enrollment_source:'general',preferred_office_provider_ids:[]},{enrollment_source:'provider',requested_profile_provider_id:10,preferred_office_provider_ids:['10'],preferred_service_format:'VIRTUAL'}]){
  wrapper.vm.applyDraftSnapshot({intakeResponses:{submission:{...saved,preferred_days:['Tuesday']},clients:[{}]},clients:[{firstName:'Test',lastName:'Client'}]});await flushPromises();
  expect(wrapper.vm.intakeResponses.submission).toMatchObject({enrollment_source:'provider',requested_profile_provider_id:9,preferred_office_provider_ids:['9'],preferred_days:['Tuesday']});
 }
});
it('remembers an intentional skip when resuming the same profile entry',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};await render();
 wrapper.vm.applyDraftSnapshot({providerEntryContext:'9:VIRTUAL:',intakeResponses:{submission:{enrollment_source:'general',requested_profile_provider_id:null,preferred_office_provider_ids:[]},clients:[{}]},clients:[{firstName:'Test',lastName:'Client'}]});await flushPromises();
 expect(wrapper.vm.intakeResponses.submission.enrollment_source).toBe('general');expect(wrapper.vm.selectedOfficeProviderIds).toEqual([]);
});
it('keeps a released profile time only as a preference before sending enrollment',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};await render();
 sessionStorage.setItem('provider-hold:test',JSON.stringify({providerId:9,serviceType:'counseling',modality:'VIRTUAL',token:'released',startAt:'2030-01-07T17:00:00Z',endAt:'2030-01-07T18:00:00Z'}));
 post.mockResolvedValue({data:{active:false}});await wrapper.vm.restoreEntryOpeningPreference();
 expect(wrapper.vm.providerHoldToken).toBeNull();expect(wrapper.vm.intakeResponses.submission.requested_opening_preference.preferenceOnly).toBe(true);
 expect(wrapper.vm.providerSelectionNotice).toContain('no longer reserved');
});

it('releases a general enrollment hold before finalizing a clinical-review packet',async()=>{
 await render();await showProviderStep();
 wrapper.vm.sessionToken='test-session';wrapper.vm.submissionId=70;
 wrapper.vm.intakeResponses.submission.unusual_experiences_unsafe='yes';
 sessionStorage.setItem('provider-hold:test',JSON.stringify({providerId:9,serviceType:'counseling',modality:'VIRTUAL',token:'held-time'}));
 post.mockImplementation(async url=>({data:url.endsWith('/finalize')?{downloadUrl:'/test-packet.pdf'}:{}}));
 await wrapper.vm.finalizePacket();await flushPromises();
 const urls=post.mock.calls.map(([url])=>url);
 expect(urls).toContain('/public/agency-services/test/release-hold');
 expect(urls.indexOf('/public/agency-services/test/release-hold')).toBeLessThan(urls.indexOf('/public-intake/office-test/70/finalize'));
 expect(post.mock.calls.find(([url])=>url.endsWith('/finalize'))[1].providerHoldToken).toBeNull();
 expect(sessionStorage.getItem('provider-hold:test')).toBeNull();
});

it('shows the requested public provider and language at the compact first step',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};
 get.mockImplementation(async url=>({data:url==='/public-intake/office-test'?structuredClone(data):url.endsWith('/providers/9')?{provider:{id:9,displayName:'Dayana Example',profilePhotoUrl:'/dayana.png'},profile:{details:{languages:['English','Russian']}}}:url.endsWith('/available-providers')?{providers:people}:{}}));
 await render();wrapper.vm.step=0.5;await flushPromises();
 expect(wrapper.get('.office-enrollment-start').exists()).toBe(true);
 expect(wrapper.find('.intake-start-welcome-block').exists()).toBe(false);
 const request=wrapper.get('.intake-provider-request');
 expect(request.text()).toContain('Dayana Example');expect(request.text()).toContain('Russian');expect(request.text()).not.toContain('English');
 expect(request.text()).toContain('does not confirm an appointment');
 expect(wrapper.get('.intake-start-preparation').attributes('open')).toBeUndefined();
 const choices=wrapper.findAll('.intake-who-stack button');expect(choices).toHaveLength(4);
 await choices[0].trigger('click');expect(choices[0].attributes('aria-pressed')).toBe('true');
 expect(wrapper.get('label[for="guardianFirstName"]').exists()).toBe(true);
 await request.get('button').trigger('click');await flushPromises();
 expect(wrapper.find('.intake-provider-request').exists()).toBe(false);
 expect(wrapper.vm.selectedOfficeProviderIds).toEqual([]);
});
it('keeps the provider request usable if its public profile cannot be loaded',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};
 get.mockImplementation(async url=>{if(url.endsWith('/providers/9'))throw Error('offline');return {data:url==='/public-intake/office-test'?structuredClone(data):{}};});
 await render();wrapper.vm.step=0.5;await flushPromises();
 expect(wrapper.get('.intake-provider-request').text()).toContain('Your selected provider');
 expect(wrapper.vm.intakeResponses.submission.requested_profile_provider_id).toBe(9);
 expect(wrapper.get('#guardianFirstName').exists()).toBe(true);
});

const preferredOpening={providerId:9,serviceType:'counseling',modality:'VIRTUAL',preferenceOnly:true,startAt:'2030-01-07T02:00:00Z',endAt:'2030-01-07T03:00:00Z',frequency:'WEEKLY',timeZone:'America/Denver'};
it('shows the selected day and time on arrival and carries the same preference through drafts and final enrollment',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};
 sessionStorage.setItem('provider-hold:test',JSON.stringify(preferredOpening));await render();wrapper.vm.step=0.5;await flushPromises();
 const opening=wrapper.get('.intake-provider-opening');expect(opening.text()).toContain('Preferred time · not reserved');expect(opening.text()).toContain('Sunday, January 6, 2030');expect(opening.text()).toContain('7:00 PM – 8:00 PM');expect(opening.text()).toContain('Weekly · Virtual · America/Denver');
 expect(wrapper.vm.intakeResponses.submission.requested_opening_preference).toMatchObject(preferredOpening);
 expect(wrapper.vm.buildDraftSnapshot().intakeResponses.submission.requested_opening_preference).toMatchObject(preferredOpening);
 wrapper.vm.applyDraftSnapshot({intakeResponses:{submission:{requested_opening_preference:{...preferredOpening,startAt:'2029-02-01T17:00:00Z'}},clients:[{}]},clients:[{firstName:'Test',lastName:'Client'}]});await flushPromises();
 expect(wrapper.vm.intakeResponses.submission.requested_opening_preference).toMatchObject(preferredOpening);
 wrapper.vm.sessionToken='test-session';wrapper.vm.submissionId=70;
 post.mockImplementation(async url=>({data:url.endsWith('/finalize')?{downloadUrl:'/test-packet.pdf'}:{}}));
 await wrapper.vm.finalizePacket();await flushPromises();
 const payload=post.mock.calls.find(([url])=>url.endsWith('/finalize'))[1];
 expect(payload.providerHoldToken).toBeNull();expect(payload.intakeData.responses.submission.requested_opening_preference).toMatchObject(preferredOpening);
});
it('removes the preferred time with an intentional provider skip and does not restore it',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};
 sessionStorage.setItem('provider-hold:test',JSON.stringify(preferredOpening));await render();wrapper.vm.step=0.5;await flushPromises();
 await wrapper.get('.intake-provider-request button').trigger('click');await flushPromises();
 expect(wrapper.find('.intake-provider-opening').exists()).toBe(false);expect(sessionStorage.getItem('provider-hold:test')).toBeNull();
 expect(wrapper.vm.intakeResponses.submission.requested_opening_preference).toBeNull();await wrapper.vm.restoreEntryOpeningPreference();
 expect(wrapper.vm.intakeResponses.submission.requested_opening_preference).toBeNull();expect(post.mock.calls.some(([url])=>url.includes('/agency-services/'))).toBe(false);
});
it('does not restore a stale hold after someone removes the provider while verification is pending',async()=>{
 route.query={enrollmentSource:'provider',providerId:'9',format:'VIRTUAL'};
 sessionStorage.setItem('provider-hold:test',JSON.stringify({...preferredOpening,preferenceOnly:false,token:'pending-check'}));
 let finish;post.mockImplementation(url=>url.endsWith('/hold-status')?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:{}}));
 await render();await wrapper.vm.setSelectedOfficeProviderIds([]);await flushPromises();finish({data:{active:false}});await flushPromises();
 expect(wrapper.vm.providerHoldToken).toBeNull();expect(wrapper.vm.intakeResponses.submission.requested_opening_preference).toBeNull();expect(sessionStorage.getItem('provider-hold:test')).toBeNull();
});

it('keeps the enrollment shell while loading and carries Spanish into the full packet', async()=>{
 const {setPublicLocale}=await import('../../i18n');setPublicLocale('es');
 let finish;
 get.mockImplementation(url=>url==='/public-intake/office-test'?new Promise(resolve=>{finish=()=>resolve({data:structuredClone(data)});}):Promise.resolve({data:{}}));
 wrapper=mount(PublicIntakeSigningView,{global:{plugins:[createPinia()],stubs:{SignaturePad:true,PublicProviderSlotPicker:true}}});await flushPromises();
 expect(wrapper.find('.df-page--enrollment').exists()).toBe(true);
 expect(wrapper.find('.df-sidebar').exists()).toBe(false);
 expect(wrapper.find('.df-page--scenic-side').exists()).toBe(false);
 expect(wrapper.find('[role="status"]').text()).toContain('Cargando inscripción');
 finish();await flushPromises();
 expect(wrapper.find('.enrollment-brand').text()).toContain('Example Agency');
 expect(wrapper.find('.enrollment-brand').text()).toContain('AuricWell');
 wrapper.vm.step=0.5;await flushPromises();
 expect(wrapper.find('.office-enrollment-heading h1').text()).toContain('inscripción');
 expect(wrapper.find('.df-sidebar').exists()).toBe(false);
 setPublicLocale('en');
});

it('opens an explicit Spanish form in Spanish even after an English visit',async()=>{
 const {setPublicLocale}=await import('../../i18n');setPublicLocale('en');
 localStorage.setItem('publicLocale','en');localStorage.setItem('preferredFormLanguage','en');
 get.mockImplementation(async url=>({data:url==='/public-intake/office-test'?{...structuredClone(data),link:{...structuredClone(data.link),language_code:'es',scheduling_timezone:'America/Denver'}}:{}}));
 await render();expect(wrapper.vm.intakeLocale).toBe('es');
 expect(get.mock.calls.find(([url])=>url==='/public-intake/office-test')[1].params.locale).toBeUndefined();
 expect(wrapper.vm.enrollmentPreferenceTimeZone).toBe('America/Denver');
 wrapper.vm.enrollmentPreferenceTimeZone='America/Chicago';expect(wrapper.vm.enrollmentPreferenceTimeZone).toBe('America/Chicago');
 setPublicLocale('en');
});
it('honors an explicit English link instead of retaining another packet’s Spanish preference',async()=>{
 const {setPublicLocale}=await import('../../i18n');setPublicLocale('es');
 get.mockImplementation(async url=>({data:url==='/public-intake/office-test'?{...structuredClone(data),link:{...structuredClone(data.link),language_code:'en'}}:{}}));
 await render();expect(wrapper.vm.intakeLocale).toBe('en');setPublicLocale('en');
});
