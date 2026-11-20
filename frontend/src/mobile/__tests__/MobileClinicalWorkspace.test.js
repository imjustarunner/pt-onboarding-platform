import {webcrypto,createHash} from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { NARRIVA_CHECKS } from '../../config/narrivaBrand.js';
import {clearClinicalRecovery} from '../clinicalRecovery.js';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('axios',()=>({default:api}));
import MobileClinicalWorkspace from '../MobileClinicalWorkspace.vue';
import MobileClientSummary from '../MobileClientSummary.vue';
import NarrivaModeChooser from '../../components/clinical/NarrivaModeChooser.vue';

const fixture=()=>({agencyId:7,client:{id:31,maskedName:'Syn****** Cli***',age:14},session:{id:82,dateOfService:'2026-11-06',startTimeLocal:'10:00',endTimeLocal:'10:45',durationMinutes:45,serviceCode:'90834',participants:'Client Only',locationLabel:'Office',modality:'in_person'},preferences:{defaultMode:'manual',features:{writing:true}},treatmentPlan:{presentingProblem:'Anxiety affects daily function.',diagnoses:[{id:14,code:'F41.9',justification:'Documented impairment.'}],goals:[]},serviceCodes:[{code:'90834',label:'Psychotherapy',serviceInfo:{code:'90834',status:'verified',title:'Psychotherapy'}}],alerts:[]});
const review=(phase='output')=>({id:41,phase,status:'passed',quickSignEligible:phase!=='pre_generation',scoring:{score:100,threshold:70,passed:true,mandatoryPassed:true,qualityPassed:true},checks:NARRIVA_CHECKS.map(check=>({...check,status:'passed',findings:[]}))});
async function mountWriter(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:MobileClinicalWorkspace,props:{apiBase:'/api/quick-view',sessionToken:'scoped',userId:1}}]});await router.push('/mobile/workspace?view=clinical&clinicalSessionId=82');const w=mount({template:'<router-view />'},{global:{plugins:[router],stubs:{Teleport:true}}});await flushPromises();return {w,router};}
beforeEach(()=>{clearClinicalRecovery({deactivate:true});vi.resetAllMocks();api.get.mockResolvedValue({data:fixture()});api.post.mockImplementation(async (url,body)=>({data:url.endsWith('/drafts')?{draft:{id:61}}:url.endsWith('/narriva/reviews')?{review:review(body?.phase)}: {}}));api.patch.mockResolvedValue({data:{draft:{id:61}}});});

describe('scoped mobile clinical writer',()=>{
  it('shows only the masked client and age, defaults to Manual and saves an actual session draft',async()=>{
    const {w}=await mountWriter();expect(w.text()).toContain('Syn****** Cli***');expect(w.text()).toContain('Age 14');expect(w.text()).not.toMatch(/Date of birth|DOB/);expect(w.findComponent(NarrivaModeChooser).props('modelValue')).toBe('manual');
    await w.get('textarea[aria-label="Narrative note section"]').setValue('Clinician documented the actual intervention and response.');
    await w.findAll('button').find(b=>b.text()==='Save draft').trigger('click');await flushPromises();
    const call=api.post.mock.calls.find(([url])=>url.endsWith('/clinical/drafts'));expect(call[1]).toMatchObject({agencyId:7,clientId:31,clinicalSessionId:82,writerMode:'manual'});expect(call[2].headers).toEqual({'X-Quick-View-Session':'scoped'});expect(call[1].outputJson.meta.narrivaContext.consentConfirmed).toBe(false);w.unmount();
  });
  it('collects risk beside the narrative and requires an explicit observation for every objective before the private draft',async()=>{
    const data=fixture();
    data.preferences.defaultMode='narriva';
    data.treatmentPlan.goals=[{id:1,title:'Goal',objectives:[{id:5,title:'First objective',previousScore:4},{id:6,title:'Second objective'}]}];
    api.get.mockResolvedValue({data});
    const {w}=await mountWriter();
    const narrative=w.get('#mobile-session-narrative');
    await narrative.get('textarea').setValue('Synthetic session observations.');
    await narrative.findAll('label').find(label=>label.text().includes('Include a risk assessment')).get('input').setValue(true);
    const submit=w.findAll('button').find(button=>button.text().includes('Submit for compliance check'));
    await submit.trigger('click');await flushPromises();
    expect(w.get('#mobile-treatment-objectives').element.open).toBe(true);
    expect(w.text()).toContain('Please rate each treatment objective');
    expect(api.post.mock.calls.some(([url])=>url.endsWith('/narriva/reviews'))).toBe(false);
    const groups=w.findAll('.mn-rating-buttons');
    await groups[0].findAll('button').find(b=>b.text()==='6').trigger('click');
    await groups[1].findAll('button').find(b=>b.text()==='Not addressed').trigger('click');
    await submit.trigger('click');await flushPromises();
    const saved=api.post.mock.calls.find(([url])=>url.endsWith('/drafts'))[1].outputJson.meta;
    expect(saved.narrivaContext.riskAssessmentIncluded).toBe(true);
    expect(saved.objectiveRatings).toMatchObject([{objectiveId:5,scaleValue:6},{objectiveId:6,disposition:'not_addressed',scaleValue:null}]);
    expect(w.find('.mn-note').exists()).toBe(false);
    expect(w.findAll('label').filter(label=>label.text().includes('Include a risk assessment'))).toHaveLength(1);
    w.unmount();
  });
  it('opens the selected service handbook using the scoped mobile client without changing the encounter',async()=>{
    const data=fixture();data.serviceCodes[0].serviceInfo={code:'90834',title:'Psychotherapy',status:'available',serviceDescription:'Exact supplied psychotherapy description.',documentation:'Record interventions and response.',source:{title:'Supplied handbook',edition:'October 2026',pages:[91]}};api.get.mockResolvedValue({data});const {w}=await mountWriter();expect(w.find('[role="region"]').exists()).toBe(false);await w.get('button[aria-label="Service information for 90834"]').trigger('click');await flushPromises();expect(w.get('[role="region"]').text()).toContain('Exact supplied psychotherapy description.');expect(w.get('[role="region"]').text()).toContain('Page 91');expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('retains Pro Bono funding and saves an explicit clinical service for documentation review',async()=>{
    const data=fixture();data.session.serviceCode='PRO-BONO SERVICE';data.serviceCodes.push({code:'PRO-BONO SERVICE',label:'Pro Bono'},{code:'99051',label:'After hours'});api.get.mockResolvedValue({data});const {w}=await mountWriter();expect(w.text()).toContain('Until then, this note remains unverified');const picker=w.findAll('select').find(select=>select.find('option').text()==='Choose clinical service');expect(picker.find('option[value="99051"]').exists()).toBe(false);await picker.setValue('90834');await w.get('textarea[aria-label="Narrative note section"]').setValue('An actual intervention and response were documented.');await w.findAll('button').find(button=>button.text()==='Save draft').trigger('click');await flushPromises();const saved=api.post.mock.calls.find(([url])=>url.endsWith('/clinical/drafts'));expect(saved[1]).toMatchObject({serviceCode:'PRO-BONO SERVICE',outputJson:{meta:{underlyingServiceCode:'90834',narrivaContext:{underlyingServiceCode:'90834'}}}});expect(api.post.mock.calls.some(([url])=>url.endsWith('/service'))).toBe(false);w.unmount();
  });
  it('saves a reviewed recording narrative before generating without requiring a token edit',async()=>{
    const data=fixture();data.preferences.defaultMode='narriva';data.recordingNarrative={recordingId:11,narrative:'A reviewed session narrative documents grounding practice.'};api.get.mockResolvedValue({data});api.post.mockImplementation(async (url,body)=>({data:url.endsWith('/drafts')?{draft:{id:61}}:url.endsWith('/generate')?{draftId:61,outputJson:{sections:{Narrative:'Grounding was practiced with an engaged response.'}}}:url.endsWith('/narriva/reviews')?{review:review(body?.phase)}:{}}));
    const {w}=await mountWriter();expect(w.get('textarea[aria-label="Session Narrative"]').element.value).toContain('reviewed session narrative');await w.get('.mn-generate').trigger('click');await flushPromises();expect(api.post.mock.calls.some(([url])=>url.endsWith('/clinical/generate'))).toBe(false);await w.get('.mn-generate').trigger('click');await flushPromises();const saved=api.post.mock.calls.find(([url])=>url.endsWith('/clinical/drafts'));expect(saved[1].inputText).toContain('reviewed session narrative');expect(api.post.mock.calls.some(([url])=>url.endsWith('/clinical/generate'))).toBe(true);w.unmount();
  });
  it('uses the exact supervisor review hashes and server review ID for mobile Quick Sign',async()=>{
    const data=fixture();data.note={id:99,readOnly:true,outputJson:{sections:{Narrative:'Signed current clinical note.'},meta:{}}};data.review={canCosign:true,contentHash:'current-version',reviewSnapshotToken:'current-snapshot',entryManifestHash:'current-entries',narriva:review()};api.get.mockResolvedValue({data});api.post.mockImplementation(async url=>({data:url.endsWith('/narriva/reviews')?{review:review()}:url.endsWith('/cosign')?{ok:true,cosignedAt:'2026-11-06T19:00:00Z'}:{}}));
    const {w}=await mountWriter();expect(w.findAll('button').some(b=>['Run Narriva checks','Check Note'].includes(b.text()))).toBe(false);expect(w.get('#mobile-encounter-details').find('input,select,textarea').exists()).toBe(false);expect(w.get('.mn-note').find('textarea').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();expect(w.get('.mn-quick-sign').element.disabled).toBe(true);await w.get('.mn-sign input[type="checkbox"]').setValue(true);await w.get('.mn-quick-sign').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/clinical/notes/99/cosign',{agencyId:7,contentHash:'current-version',reviewSnapshotToken:'current-snapshot',expectedEntryManifestHash:'current-entries',reviewedAndApproved:true,quickSign:true,narrivaReviewId:41},expect.objectContaining({headers:{'X-Quick-View-Session':'scoped'}}));expect(w.text()).toContain('Supervisor signature saved');expect(w.findComponent(MobileClinicalWorkspace).emitted('signed')[0][0]).toMatchObject({noteId:99,agencyId:7,kind:'cosign',openNext:false});w.unmount();
  });
  it('offers memory-only unsaved recovery after lock without replacing a newer server draft or saving automatically',async()=>{
    const first=await mountWriter();await first.w.get('textarea[aria-label="Narrative note section"]').setValue('UNSAVED-LOCAL-SYNTHETIC');first.w.unmount();
    const data=fixture();data.draft={id:61,inputText:'',outputJson:{sections:{Narrative:'NEWER-SERVER-SYNTHETIC'},meta:{writerMode:'manual'}}};api.get.mockResolvedValue({data});api.post.mockClear();api.patch.mockClear();
    const second=await mountWriter();expect(second.w.text()).toContain('Unsaved text is available');expect(second.w.get('textarea[aria-label="Narrative note section"]').element.value).toBe('NEWER-SERVER-SYNTHETIC');expect(api.patch).not.toHaveBeenCalled();
    await second.w.findAll('button').find(button=>button.text()==='Restore unsaved draft').trigger('click');await flushPromises();expect(second.w.get('textarea[aria-label="Narrative note section"]').element.value).toBe('UNSAVED-LOCAL-SYNTHETIC');await new Promise(resolve=>setTimeout(resolve,650));expect(api.patch).not.toHaveBeenCalled();
    await second.w.findAll('button').find(button=>button.text()==='Save draft').trigger('click');await flushPromises();expect(api.patch.mock.calls.some(([url])=>url.endsWith('/clinical/drafts/61'))).toBe(true);second.w.unmount();
  });
  it('requires explicit service confirmation against the actual encounter before saving the changed code',async()=>{
    const data=fixture();data.serviceCodes.push({code:'H2011',label:'Crisis intervention',serviceInfo:{code:'H2011',status:'available'}});api.get.mockResolvedValue({data});api.post.mockImplementation(async url=>({data:url.endsWith('/service')?{serviceCode:'H2011',session:{id:82,serviceCode:'H2011'}}:url.endsWith('/drafts')?{draft:{id:61,clinicalSessionId:82}}:{}}));
    const {w}=await mountWriter();await w.get('textarea[aria-label="Narrative note section"]').setValue('Synthetic crisis service source.');await w.findAll('select')[0].setValue('H2011');await w.findAll('button').find(b=>b.text()==='Save draft').trigger('click');await flushPromises();expect(api.post.mock.calls.some(([url])=>url.endsWith('/clinical/drafts'))).toBe(false);
    await w.get('.mn-service-confirm textarea').setValue('An unscheduled crisis intervention was delivered.');await w.findAll('button').find(b=>b.text()==='Confirm service change').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/clinical/sessions/82/service',expect.objectContaining({serviceCode:'H2011',previousServiceCode:'90834',confirmed:true,justification:'An unscheduled crisis intervention was delivered.',durationMinutes:45}),expect.objectContaining({headers:{'X-Quick-View-Session':'scoped'}}));
    await w.findAll('button').find(b=>b.text()==='Save draft').trigger('click');await flushPromises();expect(api.post.mock.calls.find(([url])=>url.endsWith('/clinical/drafts'))[1].serviceCode).toBe('H2011');w.unmount();
  });
  it('honors manual-writing profile restrictions while keeping an existing manual draft readable',async()=>{
    const data=fixture();data.preferences.features.manualAllowed=false;data.draft={id:61,inputText:'',outputJson:{sections:{Narrative:'Existing clinician-authored text.'},meta:{writerMode:'manual',manualSections:true}}};api.get.mockResolvedValue({data});
    const {w}=await mountWriter();expect(w.findComponent(NarrivaModeChooser).props('allowManual')).toBe(false);expect(w.get('textarea[aria-label="Narrative note section"]').element.disabled).toBe(true);expect(w.get('textarea[aria-label="Narrative note section"]').element.value).toBe('Existing clinician-authored text.');w.unmount();
  });
  it('rehydrates a pending confirmation after reload and retries only on an explicit click',async()=>{
    const data=fixture();data.serviceCodes.push({code:'H2011',label:'Crisis',serviceInfo:{code:'H2011',status:'available'}});const pending={expectedOldServiceCode:'90834',serviceCode:'H2011',justification:'The original confirmed crisis justification.'};api.get.mockImplementation(async url=>({data:url.endsWith('/sessions/82/service')?{session:{id:82,serviceCode:'H2011',pendingServiceChange:true},serviceCode:'H2011',pendingServiceChange:true,pendingConfirmation:pending}:data}));api.post.mockResolvedValue({data:{session:{id:82,serviceCode:'H2011'},serviceCode:'H2011'}});
    const {w}=await mountWriter();expect(w.text()).toContain('Finish pending service change');expect(w.get('.mn-service-confirm textarea').element.value).toBe(pending.justification);expect(api.post).not.toHaveBeenCalled();await w.findAll('button').find(b=>b.text()==='Retry confirmation').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/clinical/sessions/82/service',expect.objectContaining({previousServiceCode:'90834',serviceCode:'H2011',justification:pending.justification,confirmed:true}),expect.any(Object));w.unmount();
  });
  it('keeps mandatory risk included after an edit invalidates the verification badge',async()=>{
    const required=review();required.status='action_required';required.quickSignEligible=false;required.riskAssessmentRequired=true;required.checks[0]={...required.checks[0],status:'action_required',findings:[{id:'risk',message:'Document the safety assessment.',canBypass:false}]};api.post.mockImplementation(async url=>({data:url.endsWith('/drafts')?{draft:{id:61}}:url.endsWith('/narriva/reviews')?{review:required}:{}}));
    const {w}=await mountWriter();await w.get('textarea[aria-label="Narrative note section"]').setValue('The session included a safety concern requiring assessment.');await w.findAll('button').find(b=>['Run Narriva checks','Check Note'].includes(b.text())).trigger('click');await flushPromises();expect(w.text()).toContain('Required for this note');expect(w.find('input[name="mobile-risk"]').exists()).toBe(false);
    await w.get('#mobile-risk-assessment textarea').setValue('Assessment findings and safety interventions were documented.');await flushPromises();expect(w.text()).toContain('Required for this note');expect(w.find('input[name="mobile-risk"]').exists()).toBe(false);expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);w.unmount();
  });
  it('preserves newly typed narrative when an earlier generation returns late',async()=>{
    let finish;api.post.mockImplementation(async (url,body)=>url.endsWith('/generate')?await new Promise(resolve=>{finish=resolve;}):{data:url.endsWith('/drafts')?{draft:{id:61}}:url.endsWith('/narriva/reviews')?{review:review(body?.phase)}:{}});
    const {w}=await mountWriter();w.findComponent(NarrivaModeChooser).vm.$emit('update:modelValue','narriva');await flushPromises();await w.get('textarea[aria-label="Session Narrative"]').setValue('Original source describes the intervention.');await w.get('.mn-generate').trigger('click');await flushPromises();await w.get('.mn-generate').trigger('click');await flushPromises();await w.get('textarea[aria-label="Session Narrative"]').setValue('New text typed while generation was running.');await flushPromises();finish({data:{outputJson:{sections:{Narrative:'Earlier source output'}}}});await flushPromises();expect(w.get('textarea[aria-label="Session Narrative"]').element.value).toBe('New text typed while generation was running.');expect(w.text()).toContain('changed while generating');expect(w.find('textarea[aria-label="Narrative note section"]').exists()).toBe(false);w.unmount();
  });
});

it('prepares and sends SMS by verified recipient key without trusting a phone number from the UI',async()=>{
  api.get.mockResolvedValue({data:{client:{id:31,maskedName:'Syn****** Cli***',age:14},contacts:[{key:'guardian:9',maskedName:'Gua**** Cli***',relationship:'Parent',phone:'555-0100',channels:{sms:true}}]}});api.post.mockImplementation(async url=>({data:url.endsWith('/contact/send')?{ok:true,messageId:15}:{channel:'sms',to:'555-0100'}}));
  const w=mount(MobileClientSummary,{props:{apiBase:'/api/quick-view',sessionToken:'scoped',clientId:31}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Text').trigger('click');await flushPromises();await w.get('textarea').setValue('Synthetic scheduling update.');await w.get('form').trigger('submit');await flushPromises();const sent=api.post.mock.calls.find(([url])=>url.endsWith('/contact/send'));expect(sent[1]).toEqual({recipientKey:'guardian:9',channel:'sms',text:'Synthetic scheduling update.'});expect(w.text()).toContain('Text sent.');w.unmount();
});

describe('assigned locations and portal readiness',()=>{
 it('shows the historical saved label when the assigned site has since been renamed',async()=>{const data=fixture();Object.assign(data.session,{serviceLocationId:8,locationLabel:'Former office name'});data.locationChoices=[{value:'service:8',name:'New office name',label:'New office name (POS 11)',serviceLocationId:8,placeOfService:'11'}];api.get.mockResolvedValue({data});const {w}=await mountWriter();const select=w.get('select[aria-label="Location"]');expect(select.element.value).toBe('saved');expect(select.text()).toContain('Former office name · Saved session location');expect(api.patch).not.toHaveBeenCalled();w.unmount();});
 it('offers assigned dropdown choices, preserves historical locations and saves the selected site IDs',async()=>{
  const data=fixture();data.locationChoices=[{value:'service:8',name:'Windchime',label:'Windchime (POS 11)',serviceLocationId:8,billingOfficeLocationId:2,placeOfService:'11'},{value:'service:9',name:'Assigned school',label:'Assigned school (POS 03)',serviceLocationId:9,placeOfService:'03'}];api.get.mockResolvedValue({data});const {w}=await mountWriter();const select=w.get('select[aria-label="Location"]');expect(select.text()).toContain('Office · Saved session location');expect(select.text()).toContain('Assigned school');await select.setValue('service:8');await w.get('textarea[aria-label="Narrative note section"]').setValue('Documented session content.');await w.findAll('button').find(b=>b.text()==='Save draft').trigger('click');await flushPromises();expect(api.post.mock.calls.find(([url])=>url.endsWith('/drafts'))[1].outputJson.meta.sessionContext).toMatchObject({locationLabel:'Windchime',serviceLocationId:8,billingOfficeLocationId:2,placeOfService:'11'});w.unmount();
 });
 it('keeps the saved location and explains a location lookup failure',async()=>{const data=fixture();data.locationChoicesUnavailable=true;api.get.mockResolvedValue({data});const {w}=await mountWriter();expect(w.get('select[aria-label="Location"]').element.disabled).toBe(true);expect(w.text()).toContain('saved location is preserved');expect(w.text()).toContain('Office · Saved session location');w.unmount();});
 it('keeps a secure-message setup option visible with no portal contacts without dispatching a message or invitation',async()=>{api.get.mockResolvedValue({data:{client:{maskedName:'Syn* Cli*',age:14},contacts:[],secureMessaging:{available:false,reason:'Review Portal settings to arrange authorized access.'}}});const w=mount(MobileClientSummary,{props:{apiBase:'/api/quick-view',sessionToken:'scoped',clientId:31}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Secure message · Set up access').trigger('click');expect(w.text()).toContain('Review Portal settings');expect(api.post).not.toHaveBeenCalled();w.unmount();});
});

it('checks the saved narrative before generation, reviews output separately, and hides signing when the source changes',async()=>{
 vi.stubGlobal('crypto',webcrypto);const data=fixture();data.preferences.defaultMode='narriva';api.get.mockResolvedValue({data});
 const text='The clinician practiced grounding; the client engaged and planned continued practice.';
 const claim={v:1,sourceHash:createHash('sha256').update(JSON.stringify([text,'90834','narriva'])).digest('hex')};
 const receipt=Buffer.from(JSON.stringify(claim)).toString('base64url')+'.synthetic-signature';
 api.post.mockImplementation(async (url,body)=>({data:url.endsWith('/drafts')?{draft:{id:61}}:url.endsWith('/generate')?{draftId:61,outputJson:{sections:{Narrative:'Generated supported clinical note.'},meta:{generationReceipt:receipt}}}:url.endsWith('/narriva/reviews')?{review:review(body?.phase)}:{}}));
 const {w}=await mountWriter();expect(w.find('.mn-note').exists()).toBe(false);expect(w.find('.mn-sign').exists()).toBe(false);expect(w.find('.narriva-compliance').exists()).toBe(false);
 await w.get('[aria-label="Session Narrative"]').setValue(text);await flushPromises();expect(api.post.mock.calls.some(([u])=>u.endsWith('/reviews'))).toBe(false);expect(w.find('.mn-sign').exists()).toBe(false);
 await w.get('.mn-generate').trigger('click');await flushPromises();expect(api.post.mock.calls.some(([u])=>u.endsWith('/generate'))).toBe(false);expect(w.get('.mn-generate').text()).toContain('Generate note');expect(w.find('.mn-sign').exists()).toBe(false);await w.get('.mn-generate').trigger('click');await vi.waitFor(()=>expect(w.find('.mn-sign').exists()).toBe(true));expect(w.get('.mn-note').text()).toContain('Generated note');expect(api.post.mock.calls.find(([u])=>u.endsWith('/generate'))[1].preflightReviewId).toBe(41);expect(api.post.mock.calls.filter(([u])=>u.endsWith('/reviews')).map(([,body])=>body.phase)).toEqual(['pre_generation','output']);
 expect(w.get('.mn-note').find('textarea').exists()).toBe(false);
 expect(w.get('.mn-note').text()).toContain('Generated supported clinical note.');
 expect(w.get('.mn-note').text()).toContain('Presenting Problem');
 expect(w.get('.mn-note').text()).toContain('F41.9');
 expect(w.get('.mn-note').text()).toContain('Diagnostic Justification');
 w.findComponent({name:'NoteAidStructuredChartPanel'}).vm.$emit('mse-all-normal');await flushPromises();
 expect(w.get('#mobile-assessment-todos h2').text()).toBe('Assessments complete');
 const sign=w.get('.mn-sign');
 await sign.findAll('input[type="checkbox"]')[0].setValue(true);await sign.findAll('input[type="checkbox"]')[1].setValue(true);
 expect(sign.get('button').element.disabled).toBe(false);
 await w.get('[aria-label="Session Narrative"]').setValue(text+' Changed source.');await flushPromises();expect(w.find('.mn-sign').exists()).toBe(false);expect(w.text()).toContain('Generate again');w.unmount();vi.unstubAllGlobals();
});
it('opens a previously generated note with its saved scores and signs it after the MSE',async()=>{
 vi.stubGlobal('crypto',webcrypto);
 const data=fixture();
 const inputText='Synthetic session documenting a practiced skill.';
 const sourceHash=createHash('sha256').update(JSON.stringify([inputText,'90834','narriva'])).digest('hex');
 const generationReceipt=Buffer.from(JSON.stringify({v:1,sourceHash})).toString('base64url')+'.synthetic-signature';
 data.treatmentPlan.goals=[{id:1,title:'Skill practice',objectives:[{id:8,title:'Use a grounding skill'},{id:9,title:'Practice at home'}]}];
 data.draft={id:61,inputText,outputJson:{sections:{Narrative:'The client practiced the grounding skill.'},meta:{writerMode:'narriva',generationReceipt,objectiveRatings:[{objectiveId:8,scaleValue:6},{objectiveId:9,disposition:'not_addressed'}]}}};
 api.get.mockResolvedValue({data});
 api.post.mockImplementation(async(url,body)=>{
   if(url.endsWith('/narriva/reviews'))return {data:{review:review(body.phase)}};
   if(url.endsWith('/sessions/82/notes'))return {data:{note:{id:99,signingToken:'reviewed-token'}}};
   if(url.endsWith('/notes/99/sign'))return {data:{ok:true,noteId:99,signedAt:'2026-11-11T19:00:00Z'}};
   return {data:{}};
 });
 const {w}=await mountWriter();
 await vi.waitFor(()=>expect(w.find('.mn-session-scores').exists()).toBe(true));
 expect(w.get('.mn-session-scores').text()).toContain('Use a grounding skill — 6/10');
 expect(w.get('.mn-session-scores').text()).toContain('Practice at home — Not addressed');
 w.findComponent({name:'NoteAidStructuredChartPanel'}).vm.$emit('mse-all-normal');await flushPromises();
 for(const box of w.get('.mn-sign').findAll('input[type="checkbox"]'))await box.setValue(true);
 await w.get('.mn-sign button').trigger('click');await flushPromises();
 await vi.waitFor(()=>expect(w.text()).toContain('Provider signature saved'));
 const [,chart]=api.post.mock.calls.find(([url])=>url.endsWith('/sessions/82/notes'));
 expect(JSON.parse(chart.notePayload).sections).toMatchObject({'Presenting Problem':'Anxiety affects daily function.',Diagnosis:'F41.9','Diagnostic Justification':'F41.9: Documented impairment.'});
 expect(w.text()).not.toContain('workspace’s existing requirements');
 expect(JSON.parse(chart.notePayload).sections['Treatment objective ratings']).toContain('Use a grounding skill — 6/10');
 expect(api.post.mock.calls.filter(([url])=>url.endsWith('/notes/99/sign'))).toHaveLength(1);
 w.unmount();vi.unstubAllGlobals();
});
it('invalidates the pre-generation decision when the narrative changes before writing',async()=>{
 const data=fixture();data.preferences.defaultMode='narriva';api.get.mockResolvedValue({data});
 const {w}=await mountWriter();await w.get('[aria-label="Session Narrative"]').setValue('Synthetic source describing skills practice and the response.');await w.get('.mn-generate').trigger('click');await flushPromises();
 expect(w.get('.mn-generate').text()).toContain('Generate note');expect(w.find('.mn-sign').exists()).toBe(false);
 await w.get('[aria-label="Session Narrative"]').setValue('A revised synthetic account of the same actual encounter.');await flushPromises();expect(w.get('.mn-generate').text()).toContain('Submit for compliance check');
 await w.get('.mn-generate').trigger('click');await flushPromises();expect(api.post.mock.calls.some(([url])=>url.endsWith('/generate'))).toBe(false);expect(api.post.mock.calls.filter(([url,body])=>url.endsWith('/reviews') && body.phase==='pre_generation')).toHaveLength(2);w.unmount();
});
it('confirms consent and participant roles inside the pre-generation prompts and saves the same header',async()=>{
 const data=fixture();data.preferences.defaultMode='narriva';api.get.mockResolvedValue({data});let checkCount=0;
 api.post.mockImplementation(async(url,body)=>{if(url.endsWith('/drafts'))return {data:{draft:{id:61}}};if(url.endsWith('/reviews')){const result=review(body.phase);if(!checkCount++){result.status='action_required';result.checks[0]={...result.checks[0],status:'action_required',findings:[{id:'encounter:consent',action:'consent',message:'Confirm participation consent.',canBypass:false},{id:'encounter:participants',action:'participants',message:'Confirm whether mother attended.',canBypass:false}]};}return {data:{review:result}};}return {data:{}};});
 const {w}=await mountWriter();await w.get('[aria-label="Session Narrative"]').setValue('The client and mother practiced the agreed skill.');await w.get('.mn-generate').trigger('click');await flushPromises();
 const forms=w.findAll('.narriva-inline-finding');expect(forms).toHaveLength(2);await forms[0].get('input[type="checkbox"]').setValue(true);await forms[0].trigger('submit');await flushPromises();
 await forms[1].get('select').setValue('Client and Others');await forms[1].get('input').setValue('Mother');await forms[1].trigger('submit');await flushPromises();await w.get('.mn-generate').trigger('click');await flushPromises();
 const saved=api.patch.mock.calls.find(([url,body])=>url.endsWith('/drafts/61') && body.outputJson?.meta?.narrivaContext?.participantsDetail==='Mother');expect(saved[1].outputJson.meta.sessionContext).toMatchObject({participants:'Client and Others',consentConfirmed:true});expect(saved[1].outputJson.meta.narrivaContext).toMatchObject({participantsDetail:'Mother',consentConfirmed:true});expect(w.get('.mn-generate').text()).toContain('Generate note');expect(w.find('.mn-sign').exists()).toBe(false);w.unmount();
});
it('saves confirmed clinical context through the scoped mobile transport and preserves other diagnoses',async()=>{
 const data=fixture();data.credentialTier='intern_plus';data.preferences.defaultMode='narriva';data.clinicalContext={presentingProblem:'',diagnoses:[{id:14,icd10_code:'F43.9',justification:'Existing documented context.'}],diagnosticJustification:''};api.get.mockResolvedValue({data});let checkCount=0;
 api.post.mockImplementation(async(url,body)=>{if(url.endsWith('/diagnosis-search'))return {data:{items:[{code:'F41.1',description:'Generalized anxiety disorder'}]}};if(url.endsWith('/drafts'))return {data:{draft:{id:61}}};if(url.endsWith('/reviews')){const result=review(body.phase);if(!checkCount++){result.status='action_required';result.checks[3]={...result.checks[3],status:'action_required',findings:[{id:'necessity_interventions:presenting',action:'clinical_context',message:'Confirm the current concern.'},{id:'necessity_interventions:diagnosis',action:'clinical_context',message:'Confirm diagnosis and justification.'}]};}return {data:{review:result}};}return {data:{}};});
 const {w}=await mountWriter();await w.get('[aria-label="Session Narrative"]').setValue('An actual intervention and response were documented.');await w.get('.mn-generate').trigger('click');await flushPromises();
 const findInline=id=>w.findAllComponents({name:'NarrivaInlineFinding'}).find(component=>component.props('finding').id.endsWith(id));
 await findInline(':presenting').get('textarea').setValue('Recent worry disrupts sleep and school participation.');await findInline(':presenting').get('form').trigger('submit');await flushPromises();
 const diagnosis=findInline(':diagnosis');await diagnosis.props('diagnosisSearch')({agencyId:7,query:'F41.1',dateOfService:'2026-11-06'});expect(api.post).toHaveBeenCalledWith('/api/quick-view/clinical/diagnosis-search',expect.objectContaining({agencyId:7,query:'F41.1'}),expect.objectContaining({headers:{'X-Quick-View-Session':'scoped'}}));
 diagnosis.findComponent({name:'ClinicalDiagnosisSearch'}).vm.$emit('select',{code:'F41.1',description:'Generalized anxiety disorder'});await flushPromises();await diagnosis.get('textarea').setValue('Provider confirmed symptom duration and functional impact.');await diagnosis.get('form').trigger('submit');await flushPromises();await w.get('.mn-generate').trigger('click');await flushPromises();
 const saved=api.patch.mock.calls.find(([url,body])=>url.endsWith('/drafts/61') && body.outputJson?.meta?.narrivaContext?.presentingProblemOverride);expect(saved[1].outputJson.meta.narrivaContext).toMatchObject({presentingProblem:'Recent worry disrupts sleep and school participation.',presentingProblemOverride:'Recent worry disrupts sleep and school participation.'});expect(saved[1].outputJson.meta.structuredChart.diagnoses.map(item=>item.icd10_code)).toEqual(['F43.9','F41.1']);expect(saved[1].outputJson.meta.structuredChart.diagnosticJustification).toContain('Provider confirmed');expect(data.treatmentPlan.presentingProblem).toBe('Anxiety affects daily function.');expect(w.get('.mn-generate').text()).toContain('Generate note');w.unmount();
});
it('keeps a bypassed risk finding attached to the preflight and sends only its matching review ID for generation',async()=>{
 const data=fixture();data.preferences.defaultMode='narriva';api.get.mockResolvedValue({data});const finding={id:'risk:assessment',action:'risk_assessment',message:'Risk was detected; include an assessment.',canBypass:true};const result=review('pre_generation');result.status='action_required';result.riskAssessmentRequired=true;result.riskAssessmentIncluded=false;result.checks[0]={...result.checks[0],status:'action_required',findings:[finding]};
 api.post.mockImplementation(async(url,body)=>({data:url.endsWith('/drafts')?{draft:{id:61}}:url.endsWith('/reviews')?{review:body.phase==='pre_generation'?result:review()}:url.endsWith('/generate')?{draftId:61,outputJson:{sections:{Narrative:'Synthetic supported output.'},meta:{narrivaPreflight:{reviewId:41,keptAsIs:true}}}}:{}}));
 api.patch.mockImplementation(async url=>({data:url.endsWith('/findings')?{review:{...result,status:'bypassed',riskAssessmentRequired:false,quickSignEligible:false,checks:result.checks.map(check=>({...check,status:'bypassed',findings:check.findings.map(item=>({...item,bypassed:true,bypassReason:'The provider retained this account for supervisor review.'}))}))}}:{draft:{id:61}}}));
 const {w}=await mountWriter();await w.get('[aria-label="Session Narrative"]').setValue('Synthetic clinical narrative mentions a safety concern.');await w.get('.mn-generate').trigger('click');await flushPromises();
 await w.findAll('button').find(button=>button.text()==='Keep my note as it is').trigger('click');const bypassForm=w.findAll('.narriva-check__findings form').find(form=>form.text().includes('Reason for keeping this note'));await bypassForm.get('textarea').setValue('The provider retained this account for supervisor review.');await bypassForm.trigger('submit');await flushPromises();expect(w.text()).toContain('Quick Sign is unavailable');expect(w.text()).not.toContain('Required for this note');expect(w.find('.mn-quick-sign').exists()).toBe(false);expect(w.get('.mn-generate').text()).toContain('Generate note');
 await w.get('.mn-generate').trigger('click');await flushPromises();const request=api.post.mock.calls.find(([url])=>url.endsWith('/generate'));expect(request[1]).toMatchObject({agencyId:7,clientId:31,clinicalSessionId:82,preflightReviewId:41,writerMode:'narriva'});w.unmount();
});
it('does not start compliance or show signing merely by typing a manual note',async()=>{const {w}=await mountWriter();await w.get('[aria-label="Narrative note section"]').setValue('A few letters are not a reviewed note.');await flushPromises();expect(w.find('.narriva-compliance').exists()).toBe(false);expect(w.find('.mn-sign').exists()).toBe(false);expect(api.post.mock.calls.some(([u])=>u.endsWith('/reviews'))).toBe(false);w.unmount();});
it('normalizes Client and in-person defaults and preserves parent-only attendance',async()=>{const data=fixture();Object.assign(data.session,{participants:'Parent/Guardian without Client',modality:'',placeOfService:'11'});api.get.mockResolvedValue({data});const {w}=await mountWriter();const selects=w.findAll('select');expect(selects.find(n=>n.text().includes('Choose participants')).element.value).toBe('Parent/Guardian without Client');expect(selects.some(n=>n.text().includes('Choose method'))).toBe(false);expect(w.get('select[aria-label="Location"]').element.value).toBe('saved');w.unmount();});


it('confirms co-sign before advancing and retains the note when saving is rejected',async()=>{
 const data=fixture();data.note={id:99,readOnly:true,outputJson:{sections:{Narrative:'Synthetic submitted screener.'},meta:{}},consentEvidence:{confirmed:true,label:'Completed screening submission reviewed by the author'}};data.review={canCosign:true,contentHash:'version',reviewSnapshotToken:'snapshot',narriva:{...review(),status:'bypassed',quickSignEligible:false}};
 api.get.mockResolvedValue({data});api.post.mockRejectedValueOnce({response:{status:409,data:{error:{message:'Review changed; reopen.'}}}});
 const {w}=await mountWriter();expect(w.text()).toContain('Completed screening submission');expect(w.text()).not.toContain('I confirm consent');expect(w.find('.mn-quick-sign').exists()).toBe(false);
 const button=()=>w.findAll('button').find(b=>b.text()==='Co-sign & open next');await w.get('.mn-sign input').setValue(true);await button().trigger('click');await flushPromises();expect(w.findComponent(MobileClinicalWorkspace).emitted('signed')).toBeUndefined();expect(w.findComponent(MobileClinicalWorkspace).emitted('finished')).toBeUndefined();expect(w.text()).toContain('Review changed');
 api.post.mockResolvedValue({data:{ok:true,noteId:99,cosignedAt:'2026-11-11T19:00:00Z',supervisorCosign:{signerLabel:'Synthetic supervisor, LPC',statement:'Synthetic supervisor signed the reviewed version.'}}});
 await w.get('.mn-sign input').setValue(true);vi.useFakeTimers();await button().trigger('click');await flushPromises();expect(w.text()).toContain('Synthetic supervisor, LPC');expect(w.get('.mn-signature').text()).toContain('Nov 11, 2026, 12:00 PM MST');expect(w.findComponent(MobileClinicalWorkspace).emitted('signed')[0][0]).toMatchObject({kind:'cosign',openNext:true,noteId:99});expect(w.findComponent(MobileClinicalWorkspace).emitted('finished')).toBeUndefined();await vi.advanceTimersByTimeAsync(1800);expect(w.findComponent(MobileClinicalWorkspace).emitted('finished')[0][0]).toMatchObject({openNext:true,noteId:99});w.unmount();vi.useRealTimers();
});
it('shows unavailable submission evidence without a fabricated zero-percent score or a supervisor rerun',async()=>{
 const data=fixture();data.note={id:99,readOnly:true,outputJson:{sections:{Narrative:'Signed note.'},meta:{}}};data.review={canCosign:true,narriva:{...review(),status:'unavailable',quickSignEligible:false,scoring:{score:0,threshold:70},message:'Private guidance unavailable.'}};api.get.mockResolvedValue({data});const {w}=await mountWriter();expect(w.text()).toContain('Score unavailable');expect(w.text()).toContain('Private guidance unavailable');expect(w.text()).not.toContain('0%');expect(w.find('.mn-quick-sign').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it.each([['90834','PROGRESS_NOTE'],['90791','INTAKE'],['H0031','INTAKE']])('retries %s on the same reviewed %s without attaching or checking again',async(code,noteType)=>{
 const initial=fixture();initial.session.serviceCode=code;initial.serviceCodes=[{code,label:code,serviceInfo:{code,status:'verified',title:code}}];api.get.mockResolvedValue({data:initial});
 let attempts=0;
 api.post.mockImplementation(async(url,body)=>{
   if(url.endsWith('/drafts'))return {data:{draft:{id:61}}};
   if(url.endsWith('/narriva/reviews'))return {data:{review:review(body?.phase)}};
   if(url.endsWith('/sessions/82/notes'))return {data:{note:{id:99,signingToken:'reviewed-token'}}};
   if(url.endsWith('/notes/99/sign')){
     if(++attempts===1)throw Error('Signature could not be saved.');
     return {data:{ok:true,noteId:99,signedAt:'2026-11-11T19:00:00Z'}};
   }
   return {data:{}};
 });
 const {w}=await mountWriter();
 await w.get('[aria-label="Narrative note section"]').setValue('The clinician documented the intervention and response.');
 await w.findAll('button').find(b=>b.text()==='Check Note').trigger('click');await flushPromises();
 for(const box of w.findAll('.mn-sign input'))await box.setValue(true);
 await w.get('.mn-sign button').trigger('click');await flushPromises();
 expect(w.get('.mn-sign').text()).toContain('Signature could not be saved.');
 await w.get('.mn-sign button').trigger('click');await flushPromises();
 expect(w.text()).toContain('Provider signature saved');
 const attachments=api.post.mock.calls.filter(([url])=>url.endsWith('/sessions/82/notes'));
 expect(attachments).toHaveLength(1);expect(attachments[0][1].noteType).toBe(noteType);
 expect(api.post.mock.calls.filter(([url,body])=>url.endsWith('/narriva/reviews') && body.noteId===99)).toHaveLength(1);
 w.unmount();
});
it('returns an author signature receipt only after the chart confirms it and cancels auto-return after leaving',async()=>{
 api.post.mockImplementation(async url=>({data:url.endsWith('/drafts')?{draft:{id:61}}:url.endsWith('/narriva/reviews')?{review:review()}:url.endsWith('/sessions/82/notes')?{note:{id:99,signingToken:'reviewed-token'}}:url.endsWith('/notes/99/sign')?{ok:true,noteId:99,signedAt:'2026-11-11T19:00:00Z'}:{}}));
 const {w}=await mountWriter();await w.get('[aria-label="Narrative note section"]').setValue('The clinician documented the actual intervention and response.');await w.findAll('button').find(b=>b.text()==='Check Note').trigger('click');await flushPromises();for(const checkbox of w.findAll('.mn-sign input'))await checkbox.setValue(true);await w.findAll('button').find(b=>b.text()==='Sign & save to chart').trigger('click');await flushPromises();const writer=w.findComponent(MobileClinicalWorkspace);expect(writer.emitted('signed')[0][0]).toMatchObject({kind:'author',agencyId:7,noteId:99,draftId:61});expect(w.text()).toContain('Provider signature saved');w.unmount();expect(writer.emitted('finished')).toBeUndefined();
});


it('displays the provider and supervisor signatures with local times while keeping the signed narrative unchanged',async()=>{
 const data=fixture(),original='Digital questionnaire submitted: 2026-11-06T01:23:48.000Z (source timestamp)\nService time: 18:13–18:23 America/Denver; duration: 10 minutes.';
 data.note={id:99,readOnly:true,outputJson:{sections:{Narrative:original},meta:{}},signatures:[{role:'provider',actorUserId:7,signerLabel:'Synthetic Provider, LSW',signedAt:'2026-11-06T01:23:48Z',contentHash:'original'},{role:'supervisor',actorUserId:9,signerLabel:'Synthetic Supervisor, LPC',signedAt:'2026-11-11T22:33:00Z'}]};data.review={canCosign:false};api.get.mockResolvedValue({data});
 const {w}=await mountWriter();const signatures=w.get('[aria-label="Electronic signatures"]');expect(signatures.text()).toContain('Synthetic Provider, LSW');expect(signatures.text()).toContain('Nov 5, 2026, 6:23 PM MST');expect(signatures.text()).toContain('Synthetic Supervisor, LPC');expect(signatures.text()).toContain('Nov 11, 2026, 3:33 PM MST');
 const shown=w.get('.mn-signed-section>p').text();expect(shown).toContain('6:13 PM–6:23 PM');expect(shown).not.toContain('T01:23:48');expect(w.get('.mn-original-text p').text()).toBe(original);expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('updates the end time from a duration edit and preserves the service date',async()=>{
  const {w}=await mountWriter();
  const header=w.get('#mobile-encounter-details');
  const [start,end]=header.findAll('input[type=time]');
  await start.setValue('17:00');
  await header.get('input[type=number]').setValue('55');
  expect(end.element.value).toBe('17:55');
  expect(header.get('input[type=date]').element.value).toBe('2026-11-06');
  w.unmount();
});
it('restores the server-checked narrative on return and requires review again after an edit',async()=>{
  const data=fixture();
  data.draft={id:61,inputText:'Fictional session narrative',outputJson:{sections:{},meta:{writerMode:'narriva'}}};
  data.review={narriva:review('pre_generation')};
  api.get.mockResolvedValue({data});
  const {w}=await mountWriter();
  expect(w.get('.mn-generate').text()).toContain('Generate note');
  await w.get('[aria-label="Session Narrative"]').setValue('Changed synthetic facts');
  expect(w.get('.mn-generate').text()).toContain('Submit for compliance check');
  w.unmount();
});
