import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {clientChartSetupNeeds} from '../clientChartSetupNeeds.service.js';
import {finalizeFlags,matchesRenewalFlagFilter} from '../clientRenewalFlags.service.js';
it('keeps saved-but-empty, pending, unfinished clinical charts and placeholder plans out of Up to date',async()=>{
 const base={agency_id:2,source:'ADMIN_CREATED',client_type:'clinical',has_demographics:1};
 const db={execute:vi.fn().mockResolvedValueOnce([[{...base,id:12,has_demographics:0},{...base,id:13},{...base,id:14},{...base,id:15,client_type:'school',records_import_status:'pending'},{...base,id:16},{...base,id:17}]])
  .mockResolvedValueOnce([[{client_id:13},{client_id:14},{client_id:17}]])};
 const clinicalDb={execute:vi.fn().mockResolvedValue([[{client_id:13,agency_id:2,title:'Reviewed treatment plan'},{client_id:14,agency_id:2,title:'Intake Treatment Plan (placeholder)'},{client_id:17,agency_id:99,title:'Other agency plan'}]])};
 const needs=await clientChartSetupNeeds([12,13,14,15,16,17],{db,clinicalDb});expect(Object.fromEntries(needs)).toEqual({12:true,13:false,14:true,15:true,16:true,17:true});
 expect(db.execute.mock.calls[0][0]).not.toContain('SELECT *');expect(db.execute.mock.calls[1][1]).toEqual([13,14,16,17]);
 const flags=finalizeFlags({recordsImportPending:needs.get(12)});expect(flags).toMatchObject({any:true,needsClientRenewal:false,recordsImportPending:true});expect(matchesRenewalFlagFilter(flags,'up_to_date')).toBe(false);expect(matchesRenewalFlagFilter(flags,'client_setup')).toBe(true);
});
it('avoids clinical lookups for a pending import or empty demographics and keeps unknown clinical results pending',async()=>{
 const row={id:12,agency_id:2,source:'ADMIN_CREATED',client_type:'clinical',has_demographics:0};const db={execute:vi.fn().mockResolvedValue([[row]])},clinicalDb={execute:vi.fn()};
 expect((await clientChartSetupNeeds([12],{db,clinicalDb})).get(12)).toBe(true);expect(db.execute).toHaveBeenCalledOnce();expect(clinicalDb.execute).not.toHaveBeenCalled();
 db.execute.mockResolvedValueOnce([[{...row,has_demographics:1}]]).mockResolvedValueOnce([[{client_id:12}]]);clinicalDb.execute.mockRejectedValue(Error('Unavailable'));
 expect((await clientChartSetupNeeds([12],{db,clinicalDb})).get(12)).toBe(true);
});
it('clears finished records import work without requiring the provider to finalize a plan first',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{id:2579,agency_id:2,source:'ADMIN_CREATED',client_type:'clinical',has_demographics:1,records_import_status:'complete'}]])},clinicalDb={execute:vi.fn()};
 expect((await clientChartSetupNeeds([2579],{db,clinicalDb})).get(2579)).toBe(false);expect(db.execute).toHaveBeenCalledOnce();expect(clinicalDb.execute).not.toHaveBeenCalled();
});
