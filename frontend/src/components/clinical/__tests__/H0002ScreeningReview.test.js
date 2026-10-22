import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Review from '../H0002ScreeningReview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
const fixture=()=>({clientCode:'SAMPLE',clientId:5,clientType:'school',schoolName:'Example School',sourceText:'Reported worry',sourceHash:'v1',sourceLanguage:'en',psc:{complete:true,answered:17,total:11,subscales:{attention:{score:7}}},suggestedOutcome:'further_evaluation',reportedConcerns:true,safetyFlag:false,location:{code:'10'},proposedReview:{presentingProblem:'Reported worry',assessment:'Further assessment needed.',followUp:'Discuss care options.'}});
async function open(overrides={}){api.get.mockResolvedValue({data:{...fixture(),...overrides}});const w=mount(Review,{props:{sessionId:12,agencyId:2},global:{stubs:{Teleport:true}}});await flushPromises();return w;}
const label=(w,text)=>w.findAll('label').find(node=>node.text().startsWith(text));
beforeEach(()=>{vi.clearAllMocks();api.put.mockImplementation(async(url,body)=>({data:{review:{...body,revision:body.revision+1},noteId:99}}));api.post.mockResolvedValue({data:{ok:true}});});
describe('ROI disposition and source documents',()=>{
 it('previews an encrypted PDF returned as bytes and releases it when closed',async()=>{
  const create=vi.fn(()=> 'blob:test-packet'),revoke=vi.fn();
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke;});
  api.get.mockImplementation(async url=>({data:url.endsWith('/review')?{...fixture(),submissionId:22,psc:{complete:false,answered:0}}:url.endsWith('/view')?new Blob(['%PDF-test'],{type:'application/pdf'}):[{id:1,intake_submission_id:22,document_type:'Intake Packet'}]}));
  const w=mount(Review,{props:{sessionId:12,agencyId:2},global:{stubs:{Teleport:true}}});await flushPromises();
  expect(w.get('iframe').attributes('src')).toBe('blob:test-packet');
  expect(api.get).toHaveBeenCalledWith('/medical-billing/screening-sessions/12/documents/1/view',{responseType:'blob'});
  w.unmount();expect(revoke).toHaveBeenCalledWith('blob:test-packet');vi.unstubAllGlobals();
 });
 it('offers ROI closure without a screening signature or automatic draft rewrite',async()=>{
  const w=await open({roiOnly:true,psc:{complete:false,answered:0}});
  expect(w.text()).toContain('Release of Information');expect(w.find('.btn-primary').exists()).toBe(false);
  expect(api.put).not.toHaveBeenCalled();
  await w.findAll('button').find(b=>b.text()==='Close ROI task without signing').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/screening-sessions/12/close-roi',expect.objectContaining({sourceHash:'v1'}),expect.anything());
  expect(w.emitted('signed')).toBeUndefined();expect(w.emitted('close')).toHaveLength(1);w.unmount();
 });
 it('opens the matching packet beside an incomplete screening and keeps other client documents available',async()=>{
  api.get.mockImplementation(async url=>({data:url.endsWith('/review')?{...fixture(),submissionId:22,psc:{complete:false,answered:0},pscItems:[],clinicalFields:[]}:url.endsWith('/view')?{url:'https://example.test/packet.pdf'}:[{id:1,intake_submission_id:22,document_type:'Intake Packet',document_title:'Current packet'},{id:2,intake_submission_id:21,document_title:'Earlier paper scan'}]}));
  const w=mount(Review,{props:{sessionId:12,agencyId:2},global:{stubs:{Teleport:true}}});await flushPromises();
  expect(w.get('iframe').attributes('src')).toBe('https://example.test/packet.pdf');expect(w.text()).toContain('Earlier paper scan');
  expect(w.findAll('details').find(d=>d.text().includes('Find client intake documents')).attributes('open')).toBeDefined();w.unmount();
 });
 it('requires the paper source confirmation as well as all answers before signing',async()=>{
  const w=await open({pscItems:Array.from({length:17},(_,i)=>({key:`psc_${i+1}`,label:`Question ${i+1}`})),clinicalFields:[]});
  await label(w,'Transcribe a paper').get('input').setValue(true);
  for(let i=1;i<=17;i++)await label(w,`Question ${i}`).get('select').setValue(0);
  await label(w,'Clinical assessment').get('textarea').setValue('Reviewed actual paper responses.');
  for(const text of ['I confirmed the client','I reviewed the screening','The note is accurate','This screening service'])await label(w,text).get('input').setValue(true);
  expect(w.get('.btn-primary').element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
});
describe('screening review and saved work',()=>{
 it('opens as a saved draft without signing or requesting the reviewer address',async()=>{const w=await open();expect(w.text()).toContain('Example School');expect(w.text()).not.toContain('Setting of your professional review');expect(api.put).toHaveBeenCalled();expect(w.find('.btn-primary').element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();});
 it('restores saved edits and resets signature attestations',async()=>{const w=await open({savedReview:{revision:3,assessment:'Saved assessment',followUp:'Saved follow-up',presentingProblem:'Saved concern',safetyConcern:'',placeOfService:'03',paperResponses:{}}});expect(label(w,'Clinical assessment').get('textarea').element.value).toBe('Saved assessment');expect(label(w,'Client service location').get('select').element.value).toBe('03');expect(label(w,'The note is accurate').get('input').element.checked).toBe(false);expect(api.put).not.toHaveBeenCalled();w.unmount();});
 it('saves edited text before closing and emits the saved queue update',async()=>{const w=await open();await label(w,'Presenting problem').get('textarea').setValue('Updated concern');await w.findAll('button').find(b=>b.text()==='Save and close').trigger('click');await flushPromises();expect(api.put).toHaveBeenLastCalledWith('/medical-billing/screening-sessions/12/draft',expect.objectContaining({presentingProblem:'Updated concern',revision:1}),expect.anything());expect(w.emitted('saved')).toHaveLength(2);expect(w.emitted('close')).toHaveLength(1);w.unmount();});
 it('keeps the form open and retains edits when saving fails',async()=>{const w=await open();await label(w,'Presenting problem').get('textarea').setValue('Keep this text');api.put.mockRejectedValue(new Error('offline'));await w.findAll('button').find(b=>b.text()==='Save and close').trigger('click');await flushPromises();expect(w.emitted('close')).toBeUndefined();expect(label(w,'Presenting problem').get('textarea').element.value).toBe('Keep this text');expect(w.text()).toContain('Not saved');w.unmount();});
 it('signs only after explicit review and location confirmation',async()=>{const w=await open();for(const text of ['I confirmed the client','I reviewed the screening','The note is accurate','This screening service'])await label(w,text).get('input').setValue(true);await w.find('.btn-primary').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/medical-billing/screening-sessions/12/sign',expect.objectContaining({sourceHash:'v1',locationConfirmed:true,reviewConfirmed:true,placeOfService:'10'}),expect.anything());expect(w.emitted('signed')).toHaveLength(1);w.unmount();});
 it('shows the specific safety concern in bold without checking follow-up automatically',async()=>{const w=await open({safetyFlag:true,safetyConcerns:['History of neglect reported']});expect(w.findAll('strong').some(n=>n.text().includes('History of neglect'))).toBe(true);expect(label(w,'I documented the indicated').get('input').element.checked).toBe(false);expect(w.find('.btn-primary').element.disabled).toBe(true);w.unmount();});
 it('does not send any Spanish source text automatically and requires redacted preview approval',async()=>{const w=await open({sourceLanguage:'es',sourceText:'Original privado',translationPreview:'[removed] reporta preocupación',transferProviders:[]});expect(w.text()).toContain('submitted in Spanish');expect(api.post).not.toHaveBeenCalled();const button=w.findAll('button').find(b=>b.text()==='Translate reviewed text to English');expect(button.element.disabled).toBe(true);w.findAll('details')[0].element.open=true;await label(w,'I checked this text').get('input').setValue(true);await flushPromises();expect(w.findAll('button').find(b=>b.text()==='Translate reviewed text to English').element.disabled).toBe(false);api.post.mockResolvedValue({data:{status:'translated',text:'[removed] reports worry'}});await w.findAll('button').find(b=>b.text()==='Translate reviewed text to English').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/medical-billing/screening-sessions/12/translate',{agencyId:2,reviewedText:'[removed] reporta preocupación',noIdentifiersConfirmed:true},expect.anything());expect(JSON.stringify(api.post.mock.calls)).not.toContain('Original privado');expect(w.text()).toContain('[removed] reports worry');w.unmount();});
 it('keeps a missing paper PSC answer unanswered',async()=>{const w=await open({pscItems:Array.from({length:17},(_,i)=>({key:`psc_${i+1}`,label:`Question ${i+1}`})),clinicalFields:[]});await label(w,'Transcribe a paper').get('input').setValue(true);await flushPromises();expect(w.text()).toContain('0/17 valid answers');expect(w.find('.btn-primary').element.disabled).toBe(true);expect(label(w,'Question 1').get('select').element.selectedOptions[0].textContent).toBe('Unanswered');w.unmount();});
});

describe('sign and open next',()=>{
 const confirm=async w=>{for(const text of ['I confirmed the client','I reviewed the screening','The note is accurate','This screening service'])await label(w,text).get('input').setValue(true);};
 it('requests the next item only after a successful save and signature',async()=>{
  const w=await open();await w.setProps({hasNextInQueue:true});await confirm(w);
  await w.get('.sign-next').trigger('click');await flushPromises();
  expect(api.put.mock.invocationCallOrder.at(-1)).toBeLessThan(api.post.mock.invocationCallOrder.at(-1));
  expect(w.emitted('signed')[0][1]).toEqual({openNext:true});w.unmount();
 });
 it('keeps the current screening open when signing fails',async()=>{
  const w=await open();await w.setProps({hasNextInQueue:true});await confirm(w);api.post.mockRejectedValue(new Error('signature failed'));
  await w.get('.sign-next').trigger('click');await flushPromises();expect(w.emitted('signed')).toBeUndefined();expect(w.emitted('close')).toBeUndefined();expect(w.text()).toContain('Signing failed');w.unmount();
 });
 it('disables sign-and-next when there is no next item while allowing ordinary signing',async()=>{
  const w=await open();await confirm(w);expect(w.get('.sign-next').element.disabled).toBe(true);expect(w.get('.btn-primary').element.disabled).toBe(false);w.unmount();
 });
});
