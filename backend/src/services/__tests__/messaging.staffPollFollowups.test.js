import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {duePollFollowup,withPollFollowupLock} from '../staffPollFollowups.service.js';
const now=Date.parse('2026-11-09T19:00:00Z'),event={eventType:'team_poll',startsAt:'2026-10-01T19:00:00Z',endsAt:'2026-11-10T19:00:00Z',votingConfig:{enabled:true,closesAt:'2026-11-10T19:00:00Z'},reminderConfig:{enabled:true,offsetsHours:[24,2]}};
it('schedules from poll closing, not the poll creation date',()=>{expect(duePollFollowup(event,now)).toMatchObject({hours:24,at:now});});
it('catches up only the most recent due stage',()=>{expect(duePollFollowup(event,now+23*3600000)).toMatchObject({hours:2});});
it.each([{...event,reminderConfig:{enabled:false}},{...event,votingClosedAt:'2026-11-09T18:00:00Z'},{...event,votingConfig:{closesAt:'2026-11-09T18:00:00Z'}}])('does not send after closing or when disabled',value=>{expect(duePollFollowup(value,now)).toBeNull();});
it('releases the poll lock even when sending fails',async()=>{const conn={execute:vi.fn().mockResolvedValue([[{acquired:1}]]),release:vi.fn()},db={getConnection:async()=>conn};await expect(withPollFollowupLock(20,async()=>{throw Error('send failed')},db)).rejects.toThrow('send failed');expect(conn.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',['company-poll-followup:20']);expect(conn.release).toHaveBeenCalled();});
it('does not dispatch a second simultaneous follow-up',async()=>{const conn={execute:vi.fn().mockResolvedValue([[{acquired:0}]]),release:vi.fn()},action=vi.fn();await expect(withPollFollowupLock(20,action,{getConnection:async()=>conn})).rejects.toMatchObject({status:409});expect(action).not.toHaveBeenCalled();expect(conn.release).toHaveBeenCalled();});
