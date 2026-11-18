import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
import pool from '../../config/database.js';
import ClinicalNoteDraft from '../ClinicalNoteDraft.model.js';
import NoteAidWorkQueueItem from '../NoteAidWorkQueueItem.model.js';
let connection;
beforeEach(()=>{
 vi.clearAllMocks();
 connection={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>[sql.startsWith('DELETE')?{affectedRows:1}:{affectedRows:1}])};
 pool.getConnection.mockResolvedValue(connection);
});
afterEach(()=>vi.restoreAllMocks());
it('rejects a generated overwrite atomically when an autosave changed the original snapshot',async()=>{
 const expected={agency_id:2,client_id:10,clinical_session_id:90,service_code:'90837',input_text:'sealed original source',output_json:'sealed original metadata'};
 pool.execute.mockResolvedValue([{affectedRows:0}]);
 expect(await ClinicalNoteDraft.updateForUser({draftId:17,userId:501,patch:{inputText:'sealed stale generation',outputJson:'sealed generated output'},expectedSnapshot:expected})).toBeNull();
 const [sql,values]=pool.execute.mock.calls[0];
 for(const column of ['agency_id','client_id','office_event_id','clinical_session_id','service_code','program_id','date_of_service','archived_at'])expect(sql).toContain(column+' <=> ?');
 for(const column of ['input_text','output_json'])expect(sql).toContain('BINARY '+column+' <=> BINARY ?');
 expect(values).toContain('sealed original source');expect(values).toContain('sealed original metadata');
 expect(pool.execute).toHaveBeenCalledOnce();
});
it('returns the generated row only after its original owned snapshot still matches',async()=>{
 pool.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:17,user_id:501,input_text:'sealed source',output_json:'sealed generated output'}]]);
 expect(await ClinicalNoteDraft.updateForUser({draftId:17,userId:501,patch:{outputJson:'sealed generated output'},expectedSnapshot:{input_text:'sealed source',output_json:'sealed old'}})).toMatchObject({id:17,output_json:'sealed generated output'});
});
it('deletes only the owned draft and resets its unfinished queue link atomically',async()=>{
 expect(await ClinicalNoteDraft.deleteForUser({userId:501,draftIds:[17]})).toBe(1);
 expect(connection.beginTransaction).toHaveBeenCalledOnce();
 const [update,remove]=connection.execute.mock.calls;
 expect(update[0]).toContain('d.user_id=q.user_id');expect(update[0]).toContain('q.user_id=?');
 expect(update[0]).toContain("q.status<>'signed'");expect(update[0]).toContain('q.clinical_note_id IS NULL');
 expect(update[0]).not.toMatch(/SET[^]*clinical_session_id=/);
 expect(update[1]).toEqual([501,17]);expect(remove[1]).toEqual([501,17]);
 expect(connection.commit).toHaveBeenCalledOnce();expect(connection.release).toHaveBeenCalledOnce();
});
it('rolls back the queue reset when deletion fails',async()=>{
 connection.execute.mockImplementation(async sql=>{if(sql.startsWith('DELETE'))throw new Error('synthetic storage failure');return [{affectedRows:1}];});
 await expect(ClinicalNoteDraft.deleteForUser({userId:501,draftIds:[17]})).rejects.toThrow('synthetic storage failure');
 expect(connection.rollback).toHaveBeenCalledOnce();expect(connection.commit).not.toHaveBeenCalled();expect(connection.release).toHaveBeenCalledOnce();
});
it('preserves scheduled items missing from an older full-queue snapshot',async()=>{
 pool.execute.mockResolvedValueOnce([[{id:1,client_key:'booked',clinical_session_id:90},{id:2,client_key:'manual_keep'},{id:3,client_key:'manual_remove'},{id:4,client_key:'office',office_event_id:460}]]).mockResolvedValue([{affectedRows:1}]);
 vi.spyOn(NoteAidWorkQueueItem,'updateRow').mockResolvedValue({serverId:2});
 const canonical=[{id:'booked',clinicalSessionId:90},{id:'manual_keep'},{id:'office',officeEventId:460}];
 vi.spyOn(NoteAidWorkQueueItem,'listForUser').mockResolvedValue(canonical);
 expect(await NoteAidWorkQueueItem.syncForUser(501,[{clientKey:'manual_keep'}])).toEqual(canonical);
 const removal=pool.execute.mock.calls.find(([sql])=>sql.includes('DELETE FROM note_aid_work_queue_items'));
 expect(removal[1]).toEqual([501,3]);
});
it('recovers previously dangling draft references as a clean queued session on read',async()=>{
 pool.execute.mockResolvedValueOnce([[{id:1,user_id:501,client_key:'booked',clinical_session_id:90,office_event_id:460,draft_id:17,linked_draft_id:null,status:'started',started_at:'2026-11-16',payload_enc:'{}'}]]);
 expect(await NoteAidWorkQueueItem.listForUser(501)).toEqual([expect.objectContaining({clinicalSessionId:90,officeEventId:460,draftId:null,status:'not_started',startedAt:null})]);
});
