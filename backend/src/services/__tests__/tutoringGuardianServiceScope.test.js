import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),subjects:vi.fn(),join:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/StudentSubject.model.js',()=>({default:{listByClient:m.subjects}}));
vi.mock('../guardianVirtualJoin.js',()=>({guardianAppointmentJoin:m.join}));
vi.mock('../tutoringAiDraft.service.js',()=>({callTutoringAiJson:vi.fn(),buildLearningPlanPrompt:vi.fn(),buildSessionBriefPrompt:vi.fn(),buildParentUpdatePrompt:vi.fn(),buildPracticePrompt:vi.fn(),buildTutorAssistPrompt:vi.fn()}));
import {getGuardianTutoringDashboard,getGuardianLearningSnapshot,getLearningOverview} from '../tutoringLearningOs.service.js';
beforeEach(()=>{vi.clearAllMocks();m.subjects.mockResolvedValue([]);m.join.mockResolvedValue(null);m.execute.mockImplementation(async(sql,values)=>{
 if(sql.includes('FROM appointments'))return [values.at(-1)===0?[]:[{id:324,provider_user_id:1496,starts_at:'2099-11-16T18:15:00Z',ends_at:'2099-11-16T19:15:00Z',status:'scheduled',modality:'IN_PERSON',agency_id:453}]];
 if(sql.includes('SELECT CONCAT_WS'))return [values.at(-1)===0?[]:[{name:'QA assigned tutor'}]];
 return [[]];
});});
it('an explicitly unassigned enrollment never expands to another tutoring appointment, tutor or learning feed',async()=>{
 m.subjects.mockResolvedValue([{id:8,primary_tutor_user_id:1496},{id:9,primary_tutor_user_id:null}]);
 const result=await getGuardianTutoringDashboard(2545,{agencyId:453,providerId:0});
 expect(result).toMatchObject({nextSession:null,assignedTutor:null,subjects:[],upcomingSessions:[],recentSessions:[],practice:[],publishedReports:[]});
 expect(m.execute.mock.calls.every(([,values])=>values.at(-1)===0)).toBe(true);expect(m.join).not.toHaveBeenCalled();
 expect(await getLearningOverview(2545,{agencyId:453,providerId:0})).toMatchObject({subjects:[],attendanceHistory:{entries:[]}});
 expect(await getGuardianLearningSnapshot(2545,{agencyId:453,providerId:0})).toEqual({subjects:[]});
});
it('keeps the actual assigned tutoring appointment for its own enrollment',async()=>{
 const result=await getGuardianTutoringDashboard(2545,{agencyId:453,providerId:1496});expect(result.nextSession).toMatchObject({id:324,provider_user_id:1496});expect(result.assignedTutor).toBe('QA assigned tutor');expect(m.execute.mock.calls.every(([,values])=>values.at(-1)===1496)).toBe(true);
});
it('retains deliberate agency-wide aggregation when no individual service was selected',async()=>{
 const result=await getGuardianTutoringDashboard(2545,{agencyId:453});expect(result.nextSession?.id).toBe(324);expect(m.execute.mock.calls.filter(([sql])=>sql.includes('a.video_room_mode')||sql.includes('SELECT CONCAT_WS')).every(([,values])=>values.at(-1)===null)).toBe(true);
});
it('projects an external tutoring destination through authorized join access without returning its raw URL',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,values)=>{
  const result=await base(sql,values);
  if(sql.includes('FROM appointments')&&sql.includes('a.video_room_mode')){expect(sql).toContain('a.external_meeting_url');return [[{...result[0][0],video_room_mode:'external',external_meeting_url:'https://video.example.test/session',modality:'TELEHEALTH'}]];}
  return result;
 });
 const result=await getGuardianTutoringDashboard(2545,{agencyId:453,providerId:1496});
 expect(m.join).toHaveBeenCalledWith(expect.objectContaining({videoRoomMode:'external',externalMeetingUrl:'https://video.example.test/session'}),expect.any(Object),expect.any(Object),{recipientUserId:null});
 expect(result.nextSession.joinUrl).toBeNull();expect(result.nextSession).not.toHaveProperty('external_meeting_url');
});
