import {expect,it,vi} from 'vitest';
import {directoryPageQueries,readDirectoryPage} from '../clientDirectoryPage.js';
import {formatClientDirectoryProvider} from '../clientDirectoryProvider.js';
const query="SELECT c.* FROM clients c LEFT JOIN users provider ON provider.id=c.provider_id LEFT JOIN agencies org ON org.id=c.organization_id LEFT JOIN client_statuses cs ON cs.id=c.client_status_id LEFT JOIN paperwork_statuses ps ON ps.id=c.paperwork_status_id LEFT JOIN insurance_types it ON it.id=c.insurance_type_id WHERE 1=1 AND c.agency_id=?";
it('hydrates only selected IDs and keeps names/charts out of totals queries',async()=>{
 const execute=vi.fn(async(sql,args)=>sql.startsWith('SELECT COUNT')?[[{total:905,completed:900,pending:5,attention:0}]]:sql.startsWith('SELECT DISTINCT')?[[{id:51},{id:52}]]:[[ {id:52},{id:51}]]);
 const page=await readDirectoryPage({executor:{execute},query,values:[2],page:2,perPage:50,sort:'full_name',order:'asc'});
 expect(page.items.map(c=>c.id)).toEqual([51,52]);expect(page.total).toBe(905);expect(execute).toHaveBeenCalledTimes(3);
 expect(execute.mock.calls[0][0]).not.toContain('c.*');expect(execute.mock.calls[1][0]).toContain('LIMIT 50 OFFSET 50');expect(execute.mock.calls[2][0]).toContain('c.id IN (?,?)');expect(execute.mock.calls[2][1]).toEqual([2,51,52]);
});
it('applies status filtering before page selection while retaining unfiltered summary totals',()=>{
 const plan=directoryPageQueries({query,values:[2],hasChecklist:true,page:1,perPage:500,sort:'full_name; DROP TABLE clients',summaryTone:'pending'});
 expect(plan.ids.sql).toContain('LIMIT 200 OFFSET 0');expect(plan.ids.values).toEqual([2,'pending']);expect(plan.summary.values).toEqual([2]);expect(plan.ids.sql).not.toContain('DROP TABLE');expect(plan.summary.sql).toContain('directory_item.is_needed');
});
it('does not attribute a service assignment to the old client owner or expose insurance payloads',()=>{
 const row={id:4,provider_id:9,directory_provider_id:8,assigned_service_id:20,provider_first_name:'Michael',provider_last_name:'Synthetic',assigned_at:'2020-01-01',assigned_by_name:'Old actor',provider_assigned_at:'2020-01-01',provider_assigned_by_name:'Old actor',billing_insurance_payload:'private'};
 const output=formatClientDirectoryProvider(row);
 expect(output).toMatchObject({provider_id:9,directory_provider_id:8,provider_name:'Michael Synthetic',assigned_at:null,assigned_by_name:null,provider_assigned_at:null,provider_assigned_by_name:null});
 expect(output).not.toHaveProperty('billing_insurance_payload');
 expect(row.assigned_by_name).toBe('Old actor');
});
