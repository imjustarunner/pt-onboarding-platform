import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../guardianClinicalAccess.service.js',()=>({clinicalAccess:vi.fn()}));
import pool from '../../config/database.js';
import {clinicalAccess} from '../guardianClinicalAccess.service.js';
import {sharedChildParticipants,assertSharedChildThreadAccess,assertSharedGuardianSend} from '../guardianSharedMessages.service.js';
beforeEach(()=>{vi.clearAllMocks();clinicalAccess.mockResolvedValue({scopes:['clinical_messages']});});
function mockParticipants({noView=false,revokeSecond=false}={}){
 pool.execute.mockImplementation(async(sql)=>{
  if(sql.includes('FROM guardian_client_threads'))return [[{client_id:8,agency_id:2}]];
  if(sql.includes('SELECT id, agency_id'))return [[{id:8,agency_id:2,guardian_portal_enabled:1,client_type:'clinical',provider_id:9}]];
  if(sql.includes('FROM client_guardians cg'))return [[{guardian_user_id:1,permissions_json:{},first_name:'Parent One'},{guardian_user_id:2,permissions_json:{noView},first_name:'Parent Two'}]];
  if(sql.includes('SELECT DISTINCT u.id'))return [[{id:9,first_name:'Provider'}]];
  if(sql.startsWith('DELETE')||sql.startsWith('INSERT'))return [{affectedRows:1}];
  throw new Error('Unexpected query '+sql);
 });
 if(revokeSecond)clinicalAccess.mockImplementation(async({userId})=>({scopes:userId===2?[]:['clinical_messages']}));
}
it('includes both authorized parents and the assigned provider',async()=>{mockParticipants();expect((await sharedChildParticipants(8,2)).participants.map(p=>p.id)).toEqual([1,2,9]);});
it('keeps restricted guardian answers and messages out of shared access',async()=>{mockParticipants({noView:true});expect((await sharedChildParticipants(8,2)).participants.map(p=>p.id)).toEqual([1,9]);});
it('honors a revoked clinical grant even if thread membership remains',async()=>{mockParticipants({revokeSecond:true});await expect(assertSharedChildThreadAccess(2,4)).rejects.toMatchObject({status:403});});
it('syncs the recipient set before posting so both parents receive new messages',async()=>{mockParticipants();await assertSharedGuardianSend(9,4);expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO chat_thread_participants'),[4,2]);});
it('does not permit a stranger or another tenant to use the shared thread',async()=>{mockParticipants();await expect(assertSharedChildThreadAccess(999,4)).rejects.toMatchObject({status:403});});
it('blocks new private guardian replies instead of merging old private history',async()=>{pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:4}]]);await expect(assertSharedGuardianSend(9,4)).rejects.toMatchObject({status:409});});
