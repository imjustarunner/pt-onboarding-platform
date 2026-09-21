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
    expect(teamSql).toContain('provider_schedule_event_video_admissions');
    expect(teamArgs).toEqual(['user-9',9,9,9]);
    expect(mocks.execute.mock.calls[1][0]).toContain('s.live_ended_at IS NULL');
    expect(mocks.execute.mock.calls[1][0]).toContain("'DECLINED','REMOVED','CANCELLED'");
  });
  it('never queries for unauthenticated/invalid user IDs',async()=>{
    expect(await activeMeetingPrompts(0)).toEqual([]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
