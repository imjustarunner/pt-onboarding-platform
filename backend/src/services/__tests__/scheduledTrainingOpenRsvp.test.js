import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({canJoinTeamMeeting:vi.fn()}));
import {saveOpenTrainingRsvp} from '../scheduledTrainingRsvp.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([{affectedRows:1}]);});
it('enrolls active staff in the remaining visible training dates without making them required or a proctor',async()=>{
  m.execute.mockResolvedValueOnce([[{id:9,series_key:'training-series'}]]).mockResolvedValueOnce([[{id:9,is_required:0},{id:10,is_required:0}]]);
  expect(await saveOpenTrainingRsvp(9,7,'accepted')).toEqual({ok:true,response:'accepted',updated:2});
  const invites=m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT IGNORE'));expect(invites.map(([,params])=>params)).toEqual([[9,7],[10,7]]);
  const preferences=m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO meeting_participant_preferences'));
  expect(preferences[0][0]).toContain('VALUES (?,?,0,0,?,UTC_TIMESTAMP())');expect(preferences[0][0].split('ON DUPLICATE KEY UPDATE')[1]).not.toMatch(/is_required|is_cohost/);
  expect(m.commit).toHaveBeenCalledTimes(1);expect(m.rollback).not.toHaveBeenCalled();expect(m.release).toHaveBeenCalled();
});
it('records not interested without adding an attendee or requesting an absence reason',async()=>{
  m.execute.mockResolvedValueOnce([[{id:9,series_key:'training-series'}]]).mockResolvedValueOnce([[{id:9,is_required:0}]]);
  await saveOpenTrainingRsvp(9,7,'declined');expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT IGNORE'))).toBe(false);
  expect(m.execute.mock.calls.at(-1)[1]).toEqual([9,7,'declined']);
});
it('rejects removed membership, private or ended training and rolls back without changing invitations',async()=>{
  m.execute.mockResolvedValueOnce([[]]);await expect(saveOpenTrainingRsvp(9,7,'accepted')).rejects.toMatchObject({status:403});
  expect(m.execute).toHaveBeenCalledTimes(1);expect(m.rollback).toHaveBeenCalledTimes(1);expect(m.commit).not.toHaveBeenCalled();
});
it('cannot bypass a mandatory decline reason via open enrollment',async()=>{
  m.execute.mockResolvedValueOnce([[{id:9,series_key:'training-series'}]]).mockResolvedValueOnce([[{id:9,is_required:1}]]);
  await expect(saveOpenTrainingRsvp(9,7,'declined')).rejects.toMatchObject({status:400});expect(m.execute).toHaveBeenCalledTimes(2);expect(m.rollback).toHaveBeenCalled();
});
