import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),decrypt:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/videoActivityEncryption.service.js',()=>({decryptPayload:m.decrypt,encryptPayload:vi.fn()}));
import VideoMeetingActivity from '../VideoMeetingActivity.model.js';
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[{id:1001,event_id:7,user_id:3,activity_type:'chat',participant_identity:'user-3',created_at:'2026-10-01',payload_ciphertext:'encrypted'}]]);m.decrypt.mockReturnValue({text:'Saved message'});});
it('paginates with a stable ordering and decrypts each historical message',async()=>{
 const rows=await VideoMeetingActivity.list({eventId:7,offset:1000,limit:101});
 expect(m.execute).toHaveBeenCalledWith(expect.stringMatching(/ORDER BY created_at ASC, id ASC\s+LIMIT 101 OFFSET 1000/),[7]);
 expect(rows[0]).toMatchObject({id:1001,eventId:7,payload:{text:'Saved message'}});
 expect(rows[0]).not.toHaveProperty('payload_ciphertext');
});
it('clamps untrusted pagination values before placing them in SQL',async()=>{
 await VideoMeetingActivity.list({sessionId:9,offset:'0; DROP TABLE users',limit:9000});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('LIMIT 1000 OFFSET 0'),[9]);
});
