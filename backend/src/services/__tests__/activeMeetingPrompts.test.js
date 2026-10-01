import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),base:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:mocks.base}));
import { activeMeetingPrompts } from '../activeMeetingPrompts.service.js';
describe('invited active meeting prompts',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.base.mockResolvedValue('https://tenant.example');});
  it('returns all meeting types with distinct keys and rejoin state across tenants',async()=>{
    mocks.execute.mockResolvedValueOnce([[{id:4,agency_id:2,title:'Leadership',meeting_type:'team_meeting',join_token:'personal-room',start_at:'2026-01-01 10:00:00',previously_joined:1}]]);
    mocks.execute.mockResolvedValueOnce([[{id:4,agency_id:3,title:'Supervision',meeting_type:'supervision',join_token:'supervision-room',start_at:'2026-01-01 10:00:00',previously_joined:0}]]);
    const prompts=await activeMeetingPrompts(9);
    expect(prompts.map(p=>p.key)).toEqual(['team_meeting:4','supervision:4']);
    expect(prompts[0]).toMatchObject({previouslyJoined:true,isLive:true,joinUrl:'https://tenant.example/join/team-meeting/personal-room'});
    expect(prompts[1].joinUrl).toBe('https://tenant.example/join/supervision/supervision-room');
    expect(mocks.base).toHaveBeenCalledWith(2); expect(mocks.base).toHaveBeenCalledWith(3);
    const [teamSql,teamArgs]=mocks.execute.mock.calls[0];
    expect(teamSql).toContain('p.meeting_completed_at IS NULL');
    expect(teamSql).toContain('provider_schedule_event_attendees');
    expect(teamSql).toContain('ua.is_active=1');
    expect(teamSql).not.toContain('video_admissions');
    expect(teamSql).toContain('live.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND)');
    expect(mocks.execute.mock.calls[1][0]).not.toContain('video_admissions');
    expect(mocks.execute.mock.calls[1][0]).toContain('live.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND)');
    expect(teamArgs).toEqual(['user-9',9,9,9]);
    expect(mocks.execute.mock.calls[1][0]).toContain('s.live_ended_at IS NULL');
    expect(mocks.execute.mock.calls[1][0]).toContain("'DECLINED','REMOVED','CANCELLED'");
  });
  it('never queries for unauthenticated/invalid user IDs',async()=>{
    expect(await activeMeetingPrompts(0)).toEqual([]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('uses the selected external meeting link instead of inventing a platform room',async()=>{
    mocks.execute.mockResolvedValueOnce([[{id:7,agency_id:2,meeting_type:'team_meeting',platform_video_link:0,google_meet_link:'https://meet.google.com/abc-defg-hij',start_at:'2026-01-01 10:00:00'}]]).mockResolvedValueOnce([[]]);
    expect((await activeMeetingPrompts(9))[0].joinUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(mocks.execute.mock.calls[0][0]).toContain('COALESCE(p.platform_video_link,1)=1');
    expect(mocks.execute.mock.calls[1][0]).toContain("NOT IN ('IN_PERSON','IN-PERSON')");
    expect(mocks.execute.mock.calls[1][0]).toContain('WITHDRAWN');
  });
});
