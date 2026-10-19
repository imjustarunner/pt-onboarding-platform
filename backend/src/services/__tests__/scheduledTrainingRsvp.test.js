import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),canJoin:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({canJoinTeamMeeting:m.canJoin}));
import {saveTrainingRsvp} from '../scheduledTrainingRsvp.service.js';
const event={id:9,meeting_subtype:'training'};
beforeEach(()=>{vi.clearAllMocks();m.canJoin.mockResolvedValue(true);m.execute.mockResolvedValue([{affectedRows:3}]);});
it.each(['accepted','declined'])('applies %s to only the same person’s remaining dates without changing requirement or proctor status',async response=>{
 expect(await saveTrainingRsvp(event,4,response)).toEqual({ok:true,response,updated:3});
 const [sql,params]=m.execute.mock.calls[0];expect(params).toEqual([4,response,9,4,4]);
 expect(sql).toContain('selected.series_key=t.series_key');expect(sql).toContain('e.end_at>UTC_TIMESTAMP()');expect(sql).toContain('a.user_id=?');
 expect(sql.split('ON DUPLICATE KEY UPDATE')[1]).not.toMatch(/is_required|is_cohost/);
});
it('rejects registration by someone who only sees the agency calendar',async()=>{m.canJoin.mockResolvedValue(false);await expect(saveTrainingRsvp(event,4,'accepted')).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();});
it('rejects invalid RSVP and non-training events',async()=>{await expect(saveTrainingRsvp(event,4,'pending')).rejects.toMatchObject({status:400});await expect(saveTrainingRsvp({...event,meeting_subtype:'general'},4,'accepted')).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();});
