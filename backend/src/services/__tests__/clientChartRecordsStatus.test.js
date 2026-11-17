import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {markRecordsClientCurrent,requireRecordsCurrentStatus} from '../clientRecordsStatus.service.js';
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
