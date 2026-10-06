import { beforeEach, describe, expect, it, vi } from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute}}));
import { meetingEndPermission, assertLastMeetingHost, closeMeetingAsLastHost } from '../meetingEndPermission.service.js';
beforeEach(()=>{execute.mockReset();});
describe.each(['supervision','team-meeting'])('%s last-host closure',type=>{
  it.each([
    [[],7,false],[[7,9],7,false],[[7],7,true],[[9],7,false],[[7,7],7,true]
  ])('checks present hosts %j for actor %s',async(ids,actor,allowed)=>{
    execute.mockResolvedValue([ids.map(id=>({id}))]);
    expect((await meetingEndPermission(type,101,actor)).canEndForEveryone).toBe(allowed);
  });
  it('rejects transcript finishing while another host is present',async()=>{
    execute.mockResolvedValue([[{id:7},{id:9}]]);
    await expect(assertLastMeetingHost(type,101,7)).rejects.toMatchObject({status:409});
  });
  it('rechecks both actor presence and absence of other hosts in the closure write',async()=>{
    execute.mockResolvedValue([{affectedRows:1}]);
    await closeMeetingAsLastHost(type,101,7);
    const [sql,args]=execute.mock.calls[0];
    expect(sql).toContain('AND EXISTS (SELECT 1');expect(sql).toContain('AND NOT EXISTS (SELECT 1');
    expect(sql).toContain('AND u.id=?');expect(sql).toContain('AND u.id<>?');
    expect(sql).toContain('p.left_at IS NULL OR p.last_seen_at < p.left_at');
    expect(sql).toContain('INTERVAL 2 MINUTE');expect(args.slice(-3)).toEqual([101,7,7]);
    if(type==='team-meeting') expect(sql).toContain('pref.is_cohost=1');
    else expect(sql).toContain('e.co_facilitator_user_id');
  });
  it('rejects a stale button when the conditional close is denied',async()=>{
    execute.mockResolvedValue([{affectedRows:0}]);
    await expect(closeMeetingAsLastHost(type,101,7)).rejects.toMatchObject({status:409,code:'OTHER_HOSTS_PRESENT'});
  });
  it('fails closed on database errors',async()=>{
    execute.mockRejectedValue(new Error('unavailable'));
    await expect(closeMeetingAsLastHost(type,101,7)).rejects.toThrow('unavailable');
  });
});
