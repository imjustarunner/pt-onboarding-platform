import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {markRecordsClientCurrent,readRecordsClientStatus,requireRecordsCurrentStatus} from '../clientRecordsStatus.service.js';
let row,db,current;
beforeEach(()=>{
 row={status:'PENDING_REVIEW',client_status_id:7,status_key:'received'};current={id:11,label:'Current'};
 db={execute:vi.fn(async(sql)=>{
  if(sql.includes('FROM clients c'))return [[row]];
  if(sql.includes('FROM client_statuses'))return [current?[current]:[]];
  return [{affectedRows:1}];
 })};
});
it('sets workflow and agency Current together and appends actual actor history for each changed field',async()=>{
 expect(await markRecordsClientCurrent({clientId:12,agencyId:2},10,db)).toEqual({id:11,key:'current',label:'Current'});
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"),[11,10,12,2]);
 const history=db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO client_status_history'));
 expect(history.map(([,args])=>args.slice(0,5))).toEqual([[12,10,'client_status_id','7','11'],[12,10,'status','PENDING_REVIEW','ACTIVE']]);
 expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');
});
it('does not create duplicate writes or history when already Current',async()=>{
 row={status:'ACTIVE',client_status_id:11,status_key:'current'};await markRecordsClientCurrent({clientId:12,agencyId:2},10,db);
 expect(db.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it.each([{status:'ARCHIVED'},{status:'ACTIVE',status_key:'terminated'}])('requires explicit profile reopening for a closed chart (%j)',async closed=>{
 Object.assign(row,closed);await expect(markRecordsClientCurrent({clientId:12,agencyId:2},10,db)).rejects.toHaveProperty('status',409);
 expect(db.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it('never substitutes another agency or an inactive Current catalog entry',async()=>{
 current=null;await expect(requireRecordsCurrentStatus(2,db)).rejects.toHaveProperty('status',409);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("agency_id=? AND LOWER(status_key)='current' AND is_active=1"),[2]);
 row=null;await expect(markRecordsClientCurrent({clientId:12,agencyId:9},10,db)).rejects.toHaveProperty('status',404);
});

it('reactivates an actual Inactive chart inside the explicit import completion transaction', async () => {
 row={status:'ARCHIVED',client_status_id:20,status_key:'inactive'};
 const reactivate=vi.fn().mockResolvedValue({reactivated:true,clientStatusId:11,statusKey:'current',statusLabel:'Current'});
 const scope={clientId:12,agencyId:2};
 expect(await markRecordsClientCurrent(scope,10,db,{importRevision:4,reactivate})).toEqual({id:11,key:'current',label:'Current'});
 expect(reactivate).toHaveBeenCalledWith({...scope,actorUserId:10,trigger:'records_import',sourceId:'records-import:4'},{executor:db});
 expect(db.execute).toHaveBeenCalledTimes(1);
});
it('preserves an active Being Seen school status and reports it on a repeat completion', async () => {
 row={status:'ACTIVE',client_status_id:20,status_key:'being_seen',catalog_active:1,label:'Being Seen'};
 expect(await markRecordsClientCurrent({clientId:12,agencyId:2},10,db)).toEqual({id:20,key:'being_seen',label:'Being Seen'});
 expect(await readRecordsClientStatus({clientId:12,agencyId:2},db)).toEqual({id:20,key:'being_seen',label:'Being Seen'});
 expect(db.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it.each([{status_key:'archived'},{status_key:'dead'},{status_key:'terminated'},{status_key:'inactive',compliance_archived_at:'2026-10-01'}])('keeps closed or retained charts out of import reactivation (%j)', async changes => {
 Object.assign(row,changes);
 const reactivate=vi.fn();
 await expect(markRecordsClientCurrent({clientId:12,agencyId:2},10,db,{importRevision:4,reactivate})).rejects.toHaveProperty('status',409);
 expect(reactivate).not.toHaveBeenCalled();
});
