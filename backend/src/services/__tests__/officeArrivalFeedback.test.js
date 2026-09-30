import {it,expect,vi,beforeEach} from 'vitest';
import {validateOutboundEmailQuality} from '../outboundEmailQuality.service.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../officeClientSubmissions.service.js',()=>({readSubmissionAnswers:vi.fn(value=>({answers:value||{},skippedFormIds:[]})),assertCheckinClientAccess:vi.fn()}));
import pool from '../../config/database.js';import {assertCheckinClientAccess} from '../officeClientSubmissions.service.js';
import {officeFeedbackForms} from '../officeFeedbackForms.js';import {arrivalFeedbackScores,feedbackForArrival} from '../officeArrivalFeedback.service.js';import {arrivalEmail,scoreColor} from '../officeArrivalEmail.js';
const row=(id,score,extra={})=>{const forms=officeFeedbackForms('adult_self');return {id,provider_id:7,agency_id:2,client_id:9,forms_json:{forms,respondentType:'adult_self',serviceType:'counseling'},answers_json:Object.fromEntries(forms.map(f=>[f.id,Object.fromEntries(f.fields.map(q=>[q.id,String(q.scoreDirection==='reverse'?10-score:score)]))])),scheduled_start_at:`2026-09-${String(id).padStart(2,'0')} 14:00:00`,created_at:'2026-09-30 14:00:00',completed_at:'2026-09-30 14:01:00',...extra};};
beforeEach(()=>{vi.clearAllMocks();assertCheckinClientAccess.mockResolvedValue({id:9});});
it('calculates current, previous and all-history average with higher scores always better',()=>{
 const result=arrivalFeedbackScores(row(30,10),[row(1,4),row(20,7)]);expect(result.metrics.connection).toEqual({current:10,previous:7,average:7,count:3,changeFromStart:6});expect(result.metrics.progress).toEqual({current:10,previous:7,average:7,count:3,changeFromStart:6});
});
it('does not infer anonymous history and separates respondent, service, missing and future scores',()=>{
 const current=row(30,8);const guardian=row(20,1);guardian.forms_json.respondentType='caregiver';const tutor=row(21,1);tutor.forms_json.serviceType='tutoring';
 const result=arrivalFeedbackScores(current,[row(1,6),guardian,tutor,row(31,0),row(22,0,{answers_json:{}})]);expect(result.metrics.connection).toMatchObject({previous:6,average:7,count:2});
 expect(arrivalFeedbackScores({...current,client_id:null},[row(1,6)]).metrics.connection).toMatchObject({current:8,previous:null,average:null});
});
it('renders six inline score circles, safe links, opt-out and missing-score explanations',()=>{
 const scores=arrivalFeedbackScores(row(30,10),[row(1,4),row(20,7)]);const mail=arrivalEmail({message:'Office <script>test</script>'},'safe-token',scores);
 expect(mail.html.match(/border-radius:50%/g)).toHaveLength(6);expect(mail.html).toContain('/office-checkin-responses/30');expect(mail.html).toContain('Sign in with your provider');expect(mail.html).toContain('Keep check-ins in-app only');expect(mail.html).toContain('&lt;script&gt;');expect(mail.html).not.toContain('<script>');expect(mail.text).toContain('current 10.0/10; previous 7.0/10; average 7.0/10');expect(scoreColor(0)).toBe('#bc3030');expect(scoreColor(10)).toBe('#23833d');
 const missing=arrivalEmail({message:'Arrival'},'safe-token',arrivalFeedbackScores(row(30,0,{answers_json:{},client_id:null})));expect(missing.text).toContain('current —/10');expect(missing.html).toContain('confirmed client');
});
it('matches the notification owner, agency and exact slot, then waits only while feedback is in progress',async()=>{
 pool.execute.mockResolvedValue([[row(30,8,{completed_at:null})]]);const notification={notification_id:12,user_id:7,agency_id:2};expect(await feedbackForArrival(notification,Date.parse('2026-09-30T14:02:00Z'))).toEqual({wait:true});expect(pool.execute.mock.calls[0][1]).toEqual([12,7,2]);expect(pool.execute.mock.calls[0][0]).toContain('s.scheduled_start_at=COALESCE(ci.slot_start_at,e.start_at)');expect(assertCheckinClientAccess).not.toHaveBeenCalled();
 pool.execute.mockResolvedValueOnce([[row(30,8,{completed_at:null,client_id:null})]]);const result=await feedbackForArrival(notification,Date.parse('2026-09-30T14:06:00Z'));expect(result.completed).toBe(false);expect(result.metrics.connection.current).toBeNull();
});
it('withholds historical comparison when client access has been removed',async()=>{
 pool.execute.mockResolvedValue([[row(30,8)]]);assertCheckinClientAccess.mockRejectedValue(Object.assign(new Error('Access revoked'),{status:403}));const result=await feedbackForArrival({notification_id:12,user_id:7,agency_id:2});expect(result.linked).toBe(false);expect(result.metrics.connection).toMatchObject({current:8,previous:null,average:null});expect(pool.execute).toHaveBeenCalledTimes(1);
});

it('allows linked, anonymous, pending and absent-feedback email through the real quality check',()=>{
 for(const feedback of [null,arrivalFeedbackScores(row(30,8)),arrivalFeedbackScores(row(30,8,{client_id:null})),arrivalFeedbackScores(row(30,8,{client_id:null,completed_at:null}))]) {
  const mail=arrivalEmail({message:'Your 9 AM appointment is waiting.'},'safe-token',feedback);
  expect(validateOutboundEmailQuality({...mail,templateType:'kiosk_checkin',source:'auto'})).toEqual({ok:true,flags:[]});
 }
});
it('returns pending scores immediately for the splash, without waiting for email completion',async()=>{
 pool.execute.mockResolvedValueOnce([[row(30,8,{completed_at:null,client_id:null})]]);
 const result=await feedbackForArrival({notification_id:12,user_id:7,agency_id:2},Date.parse('2026-09-30T14:02:00Z'),{waitForCompletion:false});
 expect(result).toMatchObject({submissionId:30,completed:false,metrics:{connection:{current:null,changeFromStart:null}}});
});
it('shows regression and zero change, without inventing a baseline for the first visit',()=>{
 expect(arrivalFeedbackScores(row(30,4),[row(1,7)]).metrics.progress.changeFromStart).toBe(-3);
 expect(arrivalFeedbackScores(row(30,7),[row(1,7)]).metrics.progress.changeFromStart).toBe(0);
 expect(arrivalFeedbackScores(row(30,7)).metrics.progress.changeFromStart).toBeNull();
});
