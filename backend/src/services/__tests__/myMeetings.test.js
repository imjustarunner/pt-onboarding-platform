import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),member:vi.fn(),artifact:vi.fn(),status:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:mocks.member}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{findByEventId:mocks.artifact,toWorkspaceDto:()=>({goals:[],actionItems:[]})}}));
vi.mock('../meetingSummaryJobs.service.js',()=>({meetingSummaryStatus:mocks.status,enqueueMeetingSummary:vi.fn()}));
import {requireAttendedMeeting,myMeetingDetail,listMyMeetings} from '../myMeetings.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.member.mockResolvedValue(true);mocks.status.mockResolvedValue('generating');mocks.artifact.mockResolvedValue({transcript_text:'Shared transcript',summary_text:'Summary',private_notes_text:'Never share legacy private notes'});});
describe('personal attended meeting library',()=>{
 it('denies an invited non-attendee without loading shared records',async()=>{
  mocks.execute.mockResolvedValue([[]]);
  await expect(myMeetingDetail('team',7,10)).rejects.toMatchObject({status:403});expect(mocks.artifact).not.toHaveBeenCalled();
 });
 it('denies former agency members even if they attended',async()=>{
  mocks.execute.mockResolvedValue([[{id:7,agency_id:2}]]);mocks.member.mockResolvedValue(false);
  await expect(requireAttendedMeeting('team',7,10)).rejects.toMatchObject({status:403});
 });
 it('loads only the requesting author’s personal note and no legacy private notes',async()=>{
  mocks.execute.mockImplementation(async(sql,args)=>{
   if(sql.includes('SELECT m.*'))return [[{id:7,agency_id:2,provider_id:10,title:'CPA'}]];
   if(sql.includes('FROM meeting_personal_notes')){expect(args).toEqual([7,10]);return [[{note_text:'My own note'}]];}
   return [[]];
  });
  const detail=await myMeetingDetail('team',7,10);
  expect(detail).toMatchObject({transcript:'Shared transcript',personalNote:'My own note',summaryStatus:'generating'});
  expect(JSON.stringify(detail)).not.toContain('Never share');
 });
 it('requires attended membership for both meeting types and filters categories',async()=>{
  mocks.execute.mockImplementation(async(sql,args)=>{
   expect(sql).toContain('ar.user_id=?');expect(sql).toContain('va.user_id=?');expect(args.slice(2,6)).toEqual([10,'user-10',10,10]);
   return [[{id:7,title:'CPA',category:args[0]==='team'?'cpa':'supervision',start_at:'2026-10-01'}]];
  });
  const result=await listMyMeetings({agencyId:2,userId:10,category:'cpa'});
  expect(result.meetings).toHaveLength(1);expect(result.meetings[0].type).toBe('team');
 });
});
