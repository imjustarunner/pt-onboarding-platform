import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import {attachCheckinSeries,completeClientSubmission,readSubmissionAnswers} from '../officeClientSubmissions.service.js';
import {checkinSeries} from '../../utils/officeCheckinSeries.js';
import {officeFeedbackForms,scoreOfficeFeedback} from '../officeFeedbackForms.js';
const visit=(id,date,changes={})=>({id,provider_id:7,agency_id:2,office_location_id:1,timezone:'America/Denver',scheduled_start_at:date,client_id:null,...changes});
const key='1ccab28e-45d3-4409-9cef-083bdd1905cd';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,17).toString('base64'));});
it('groups local weekday/time across daylight saving changes, but isolates agency, office, and provider',()=>{
 const a=visit(1,'2026-10-27 22:00:00'),b=visit(2,'2026-11-03 23:00:00');
 expect(checkinSeries(a).label).toBe('Tuesday · 4:00 PM');expect(checkinSeries(a).key).toBe(checkinSeries(b).key);
 for(const changes of [{provider_id:8},{agency_id:6},{office_location_id:6}])expect(checkinSeries({...a,...changes}).key).not.toBe(checkinSeries(a).key);
});
it('provides exactly two optional, explicitly nonvalidated forms with distinct proxy wording',()=>{
 const self=officeFeedbackForms('adult_self'),proxy=officeFeedbackForms('caregiver');expect(self).toHaveLength(2);expect(proxy).toHaveLength(2);
 expect(proxy.every(f=>f.respondentType==='caregiver'&&f.validated===false&&f.fields.every(q=>!q.required))).toBe(true);
 expect(proxy[0].fields[0].label).toContain('dependent');expect(self[0].fields[0].label).not.toContain('dependent');
});
it('encrypts answers and skip choices, then decrypts only for the private reader',async()=>{
 const forms=officeFeedbackForms('caregiver');m.execute.mockResolvedValueOnce([[{id:4,expires_at:'2099-01-01 00:00:00',forms_json:{forms}}]]).mockResolvedValueOnce([{}]);
 await completeClientSubmission({locationId:1,key,answers:{[forms[0].id]:{heard:'4'}},skippedFormIds:[forms[1].id]});
 const stored=m.execute.mock.calls[1][1][0];expect(stored).not.toContain('heard');expect(stored).not.toContain(forms[1].id);
 expect(readSubmissionAnswers(stored)).toEqual({answers:{[forms[0].id]:{heard:'4'}},skippedFormIds:[forms[1].id]});
});
it('allows skipping a whole configured form even if its questions are required',async()=>{
 m.execute.mockResolvedValueOnce([[{id:4,expires_at:'2099-01-01 00:00:00',forms_json:{forms:[{id:'a',fields:[{id:'q',required:true,type:'text'}]}]}}]]).mockResolvedValueOnce([{}]);
 await expect(completeClientSubmission({locationId:1,key,answers:{},skippedFormIds:['a']})).resolves.toEqual({ok:true});
});
it('fails closed if feedback encryption is unavailable',async()=>{
 vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');m.execute.mockResolvedValueOnce([[{id:4,expires_at:'2099-01-01 00:00:00',forms_json:{forms:[]}}]]);
 await expect(completeClientSubmission({locationId:1,key,answers:{}})).rejects.toHaveProperty('status',503);expect(m.commit).not.toHaveBeenCalled();
});
it('attaches reviewed dates atomically and retains audit history',async()=>{
 const rows=[visit(1,'2026-10-27 22:00:00'),visit(2,'2026-11-03 23:00:00')];m.execute.mockResolvedValueOnce([rows]).mockResolvedValueOnce([[{id:9}]]).mockResolvedValue([{}]);
 await expect(attachCheckinSeries({providerId:7,ids:[1,2],clientId:9})).resolves.toEqual({ok:true,attachedCount:2});
 expect(m.execute.mock.calls.filter(([s])=>s.startsWith('UPDATE'))).toHaveLength(2);expect(JSON.parse(m.execute.mock.calls[2][1][1])[0]).toMatchObject({source:'recurring_checkin_review',series:'Tuesday · 4:00 PM',clientId:9});expect(m.commit).toHaveBeenCalledOnce();
});
it.each(['other provider','different time','already attached','outside caseload'])('rejects a bulk attachment with %s',async reason=>{
 const rows=[visit(1,'2026-10-27 22:00:00'),visit(2,'2026-11-03 23:00:00')];if(reason==='other provider')rows.pop();if(reason==='different time')rows[1].scheduled_start_at='2026-11-03 22:00:00';if(reason==='already attached')rows[1].client_id=11;
 m.execute.mockResolvedValueOnce([rows]).mockResolvedValueOnce([reason==='outside caseload'?[]:[{id:9}]]);
 await expect(attachCheckinSeries({providerId:7,ids:[1,2],clientId:9})).rejects.toHaveProperty('status');expect(m.commit).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([s])=>s.startsWith('UPDATE'))).toBe(false);
});

it('scores ten as the positive end, reverses distress, and never treats missing answers as zero',()=>{
 const forms=officeFeedbackForms('adult_self');
 const input=(high)=>Object.fromEntries(forms.map(f=>[f.id,Object.fromEntries(f.fields.map(q=>[q.id,String(q.scoreDirection==='reverse'?(high?0:10):(high?10:0))]))]));
 expect(scoreOfficeFeedback(forms,input(true))).toMatchObject({total:10,connection:10,progress:10,answered:6,expected:6,validated:false});
 expect(scoreOfficeFeedback(forms,input(false)).total).toBe(0);
 const partial=input(true);partial[forms[0].id].heard='not_sure';expect(scoreOfficeFeedback(forms,partial)).toMatchObject({total:null,connection:null,progress:10,answered:5});
 expect(scoreOfficeFeedback(forms,input(true),[forms[1].id])).toMatchObject({total:null,connection:10,progress:null,answered:3});
});
it('uses learning-specific questions for tutoring rather than therapy wording',()=>{
 const forms=officeFeedbackForms('caregiver','tutoring');const text=JSON.stringify(forms);expect(text).toContain('learning');expect(text).toContain('tutor');expect(text).not.toContain('therapist');expect(forms.every(f=>f.serviceType==='tutoring')).toBe(true);
});
