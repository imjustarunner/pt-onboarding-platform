import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {createScheduleRecordReferences} from '../scheduleRecordReference.service.js';
it('persists one random reference per record and retains it on subsequent reads',async()=>{
 const stored=[];const db={execute:vi.fn(async(sql,params)=>{if(sql.startsWith('SELECT'))return[stored];for(let i=0;i<params.length;i+=3)if(!stored.some(r=>r.record_type===params[i]&&r.record_id===params[i+1]))stored.push({record_type:params[i],record_id:params[i+1],reference:params[i+2]});return[{}];})};
 const random=vi.fn().mockReturnValueOnce('0123456789ABCDEFABCD').mockReturnValueOnce('FEDCBA9876543210ABCD');const refs=createScheduleRecordReferences({db,random});
 const first=await refs.ensure([{type:'appointment',id:12},{type:'office_booking',id:40},{type:'appointment',id:12}]);const second=await refs.ensure([{type:'appointment',id:12}]);
 expect(first.get('appointment:12')).toBe('S0123456789ABCDEFABCD');expect(first.get('office_booking:40')).toBe('OFEDCBA9876543210ABCD');expect(second.get('appointment:12')).toBe(first.get('appointment:12'));expect(random).toHaveBeenCalledTimes(2);
});
it('leaves the schedule usable before the reference migration is installed',async()=>{
 const service=createScheduleRecordReferences({db:{execute:vi.fn(async()=>{throw Object.assign(new Error('Unavailable'),{code:'ER_NO_SUCH_TABLE'});})}});
 expect((await service.enrich({officeEvents:[{id:40}]})).officeEvents[0].scheduleReference).toBeNull();
});
it('does not generate references for external or invalid record IDs',async()=>{
 const db={execute:vi.fn()},service=createScheduleRecordReferences({db});expect((await service.ensure([{type:'google',id:12},{type:'appointment',id:-1}])).size).toBe(0);expect(db.execute).not.toHaveBeenCalled();
});
