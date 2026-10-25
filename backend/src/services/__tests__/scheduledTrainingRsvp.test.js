import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),canJoin:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({canJoinTeamMeeting:m.canJoin}));
import {saveTrainingRsvp} from '../scheduledTrainingRsvp.service.js';
const event={id:9,meeting_subtype:'training'};
beforeEach(()=>{vi.clearAllMocks();m.canJoin.mockResolvedValue(true);m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{is_required:1}]]:[{affectedRows:3}]);});
it.each(['accepted','declined'])('applies %s to only the same person’s remaining dates without changing requirement or proctor status',async response=>{
 expect(await saveTrainingRsvp(event,4,response,'attended in the spring')).toEqual({ok:true,response,updated:3});
 const [sql,params]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'));expect(params).toEqual([4,response,response==='declined'?'attended in the spring':null,9,4,4]);
 expect(sql).toContain('selected.series_key=t.series_key');expect(sql).toContain('e.end_at>UTC_TIMESTAMP()');expect(sql).toContain('a.user_id=?');
 expect(sql.split('ON DUPLICATE KEY UPDATE')[1]).not.toMatch(/is_required|is_cohost/);
});
it('requires a reason for mandatory decline and permits optional reminder opt-out without a reason',async()=>{
 await expect(saveTrainingRsvp(event,4,'declined')).rejects.toMatchObject({status:400});
 expect(m.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{is_required:0}]]:[{affectedRows:3}]);
 await expect(saveTrainingRsvp(event,4,'declined')).resolves.toMatchObject({response:'declined'});
});
it('rejects oversized reasons without updating any RSVP',async()=>{await expect(saveTrainingRsvp(event,4,'declined','x'.repeat(2001))).rejects.toMatchObject({status:400});expect(m.execute).not.toHaveBeenCalled();});
it('rejects registration by someone who only sees the agency calendar',async()=>{m.canJoin.mockResolvedValue(false);await expect(saveTrainingRsvp(event,4,'accepted')).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();});
it('rejects invalid RSVP and non-training events',async()=>{await expect(saveTrainingRsvp(event,4,'pending')).rejects.toMatchObject({status:400});await expect(saveTrainingRsvp({...event,meeting_subtype:'general'},4,'accepted')).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();});

it('rejects acceptance after the first date registration deadline even from a later series invitation',async()=>{
 m.execute.mockResolvedValue([[{start_at:'2020-10-01 18:00:00',meeting_settings_json:null}]]);
 await expect(saveTrainingRsvp({...event,start_at:'2099-10-01 18:00:00'},4,'accepted')).rejects.toMatchObject({status:409});
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
