import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),member:vi.fn(),artifact:vi.fn(),status:vi.fn(),interview:vi.fn(),interviewAccess:vi.fn(),interviewArtifact:vi.fn(),activity:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:mocks.member}));
vi.mock('../../models/HiringInterview.model.js',()=>({default:{findByScheduleEventId:mocks.interview}}));
vi.mock('../hiringInterviewAccess.service.js',()=>({canAccessHiringInterview:mocks.interviewAccess}));
vi.mock('../../models/HiringInterviewArtifact.model.js',()=>({default:{findByInterviewId:mocks.interviewArtifact}}));
vi.mock('../../models/VideoMeetingActivity.model.js',()=>({default:{list:mocks.activity}}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{findByEventId:mocks.artifact,toWorkspaceDto:()=>({goals:[],actionItems:[]})}}));
vi.mock('../meetingSummaryJobs.service.js',()=>({meetingSummaryStatus:mocks.status,enqueueMeetingSummary:vi.fn()}));
import {requireAttendedMeeting,myMeetingDetail,listMyMeetings,myMeetingActivity,saveMyMeetingNote,retryMyMeetingSummary,meetingCategory} from '../myMeetings.service.js';
beforeEach(()=>{
 vi.resetAllMocks();mocks.member.mockResolvedValue(true);mocks.status.mockResolvedValue('generating');
 mocks.artifact.mockResolvedValue({transcript_text:'Shared transcript',summary_text:'Summary',private_notes_text:'Never share legacy private notes'});
 mocks.interview.mockResolvedValue({id:4,candidate_user_id:10,agency_id:2});mocks.interviewAccess.mockResolvedValue(false);mocks.activity.mockResolvedValue([]);
 mocks.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('SELECT m.*'))return [[{id:7,agency_id:2,provider_id:10,title:'CPA'}]];
  if(sql.includes('FROM meeting_personal_notes'))return [[{note_text:'My own note'}]];
  return [[]];
 });
});
describe('personal attended meeting library',()=>{
 it('denies an invited non-attendee without loading shared records',async()=>{
  mocks.execute.mockResolvedValue([[]]);
  await expect(myMeetingDetail('team',7,10)).rejects.toMatchObject({status:403});expect(mocks.artifact).not.toHaveBeenCalled();
 });
 it('denies former agency members even if they attended',async()=>{
  mocks.member.mockResolvedValue(false);
  await expect(requireAttendedMeeting('team',7,10)).rejects.toMatchObject({status:403});
 });
 it('loads only the requesting author’s personal note and no legacy private notes',async()=>{
  const detail=await myMeetingDetail('team',7,10);
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('FROM meeting_personal_notes'),[7,10]);
  expect(detail).toMatchObject({transcript:'Shared transcript',personalNote:'My own note',summaryStatus:'generating'});
  expect(JSON.stringify(detail)).not.toContain('Never share');
 });
 it('requires attendance for both meeting sources and supports the administrative category',async()=>{
  mocks.execute.mockImplementation(async(sql,args)=>{
   if(sql.includes('SELECT m.id')){
    expect(sql).toContain('ar.user_id=?');expect(sql).toContain('va.user_id=?');expect(args.slice(2,6)).toEqual([10,'user-10',10,10]);
    return [[{id:7,title:'CPA',meeting_subtype:'cpa',session_type:'group',start_at:'2026-10-01'}]];
   }
   return [[{meeting_id:7,user_id:10,name:'Sam Jones'}]];
  });
  const result=await listMyMeetings({agencyId:2,userId:10,category:'administrative'});
  expect(result.meetings).toHaveLength(1);expect(result.meetings[0]).toMatchObject({type:'team',participants:[{user_id:10,name:'Sam Jones'}]});
  expect(result.counts).toEqual({cpa:1,group_supervision:1});expect(result.total).toBe(1);
 });
 it.each([
  ['supervision',{session_type:'group'},'group_supervision'],['supervision',{session_type:'individual'},'supervision'],
  ['team',{kind:'HUDDLE',meeting_subtype:'general'},'huddle'],['team',{meeting_subtype:'cpa'},'cpa'],
  ['team',{interview_id:8,meeting_subtype:'general'},'interview']
 ])('classifies %s records consistently', (type,row,expected)=>expect(meetingCategory(type,row)).toBe(expected));
 it('excludes interview titles and counts from candidates, including relabeled interviews',async()=>{
  mocks.execute.mockImplementation(async(sql,args)=>sql.includes('SELECT m.id')&&args[0]==='team'?[[{id:7,interview_id:4,title:'Confidential interview',meeting_subtype:'general'}]]:[[]]);
  const result=await listMyMeetings({agencyId:2,userId:10});
  expect(result).toEqual({meetings:[],hasMore:false,total:0,counts:{}});expect(mocks.interviewAccess).toHaveBeenCalledWith({id:10},expect.any(Object));
 });
 it.each(['detail','activity','note','summary'])('blocks candidate direct %s requests before any artifact access',async action=>{
  mocks.execute.mockResolvedValue([[{id:7,agency_id:2,interview_id:4,meeting_subtype:'general'}]]);
  const actions={detail:()=>myMeetingDetail('team',7,10),activity:()=>myMeetingActivity('team',7,10),note:()=>saveMyMeetingNote('team',7,10,'test'),summary:()=>retryMyMeetingSummary('team',7,10)};
  await expect(actions[action]()).rejects.toMatchObject({status:403});
  expect(mocks.artifact).not.toHaveBeenCalled();expect(mocks.interviewArtifact).not.toHaveBeenCalled();expect(mocks.activity).not.toHaveBeenCalled();
 });
 it('fails closed for an interview with no hiring record',async()=>{
  mocks.execute.mockResolvedValue([[{id:7,agency_id:2,meeting_subtype:'interview'}]]);mocks.interview.mockResolvedValue(null);
  await expect(myMeetingDetail('team',7,10)).rejects.toMatchObject({status:403});
 });
 it('gives attending authorized staff interview chat without exposing private notes or scorecards',async()=>{
  const original=mocks.execute.getMockImplementation();
  mocks.execute.mockImplementation((sql,args)=>sql.includes('SELECT m.*')?[[{id:7,agency_id:2,provider_id:12,interview_id:4,meeting_subtype:'interview'}]]:original(sql,args));
  mocks.interviewAccess.mockResolvedValue(true);
  mocks.interviewArtifact.mockResolvedValue({team_chat_json:[{text:'Shared team chat',authorName:'Sam',at:'2026-10-01',secret:'omit'}],private_notes_json:{12:'Other private notes'},scorecard_json:{score:4}});
  const result=await myMeetingDetail('team',7,12,{id:12,effectiveRole:'admin'});
  expect(result.interviewTeamChat).toEqual([{text:'Shared team chat',authorName:'Sam',at:'2026-10-01'}]);
  expect(JSON.stringify(result)).not.toMatch(/Other private notes|scorecard|secret/);
 });
 it('paginates saved activity instead of silently stopping at the first model limit',async()=>{
  mocks.activity.mockResolvedValue(Array.from({length:101},(_,i)=>({id:101+i,payload:{text:'Message'}})));
  const result=await myMeetingActivity('team',7,10,100);
  expect(mocks.activity).toHaveBeenCalledWith({eventId:7,limit:101,offset:100,viewerUserId:10});expect(result.activity).toHaveLength(100);expect(result.hasMore).toBe(true);
 });
});

it('includes admitted guests in participant records without treating waiting visitors as attendees',async()=>{
 const original=mocks.execute.getMockImplementation();
 mocks.execute.mockImplementation((sql,args)=>{
  if(sql.includes('SELECT m.id')&&args[0]==='team')return [[{id:7,title:'Interview',meeting_subtype:'general'}]];
  if(sql.includes('AS meeting_id')){expect(sql).toContain('va.join_identity COLLATE utf8mb4_unicode_ci=jp.join_identity COLLATE utf8mb4_unicode_ci');return [[{meeting_id:7,user_id:null,identity:'guest-one',name:'Guest attendee'}]];}
  return original(sql,args);
 });
 const result=await listMyMeetings({agencyId:2,userId:10});
 expect(result.meetings[0].participants[0]).toMatchObject({identity:'guest-one',name:'Guest attendee'});
});

it('lets an invited non-attendee read shared notes while withholding transcript, attendance and personal notes',async()=>{
 mocks.execute.mockImplementation(async sql=>sql.includes('SELECT m.*')&&!sql.includes('ar.user_id=?')?[[{id:7,agency_id:2,title:'Training',meeting_subtype:'training'}]]:[[]]);
 const detail=await myMeetingDetail('team',7,10);expect(detail).toMatchObject({attended:false,summary:'Summary',transcript:'',personalNote:'',attendance:[],attendanceLog:[]});
 expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('FROM meeting_personal_notes'))).toBe(false);
});
