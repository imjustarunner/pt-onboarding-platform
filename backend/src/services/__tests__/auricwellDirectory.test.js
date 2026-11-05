import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {createAuricwellDirectory} from '../auricwellDirectory.service.js';
import {previewRouteAllowed} from '../auricwellPreviewPolicy.js';
let db,service;
beforeEach(()=>{db={execute:vi.fn(async sql=>sql.includes('COUNT(*) AS total')?[[{total:63}]]:sql.includes('AS client_count')?[[{id:2,name:'Agency A',client_count:40},{id:3,name:'Agency B',client_count:23}]]:sql.includes('FROM client_organization_assignments')?[[{client_id:9,id:12,name:'School',icon_file_path:'school.svg'}]]:[[{id:9,agency_id:3,agency_name:'Agency B',organization_id:12,organization_name:'School',provider_name:'Assigned provider'}]])};service=createAuricwellDirectory({database:db});});
it('uses the authenticated assignment across tenants without a membership or ACTIVE-status prefilter',async()=>{
 const result=await service.mine({actor:{id:7},input:{providerId:99,agencyId:2}});
 const [sql,args]=db.execute.mock.calls[0];expect(sql).toContain('c.provider_id=? OR EXISTS');expect(sql).toContain('own_assignment.is_active=1');expect(sql).not.toMatch(/user_agencies|c.agency_id=\?|c.status=/);expect(args).toEqual([7,7]);
 expect(result.total).toBe(63);expect(result.agencies).toHaveLength(2);expect(result.clients[0].affiliations).toHaveLength(1);
});
it('applies agency filtering before count and pagination without restricting agency choices',async()=>{
 await service.mine({actor:{id:7},input:{filterAgencyId:'3',sort:'agency',order:'desc',page:2,search:'Example'}});
 const [count,countArgs]=db.execute.mock.calls[0], [rows,args]=db.execute.mock.calls[1], [options,optionArgs]=db.execute.mock.calls[2];
 expect(count).toContain('c.agency_id=?');expect(count).toContain('REPLACE');expect(countArgs.slice(0,3)).toEqual([7,7,3]);expect(countArgs).toContain('e');expect(countArgs).not.toContain('Example');expect(args).toEqual(countArgs);expect(rows).toContain('ORDER BY a.name DESC');expect(rows).toContain('COALESCE(ai.file_path');expect(rows).toContain('LIMIT 50 OFFSET 50');expect(optionArgs).toEqual([7,7]);expect(options).not.toContain('c.agency_id=?');
});
it('keeps QA caseloads inside the synthetic practice and binds all input values',async()=>{
 await service.mine({actor:{id:7},qaAgencyId:450,input:{filterAgencyId:3,sort:'name;DROP TABLE clients',order:'DESC;DROP'}});
 expect(db.execute.mock.calls[0][1]).toEqual([7,7,450,3]);expect(db.execute.mock.calls[2][1]).toEqual([7,7,450]);expect(db.execute.mock.calls[1][0]).not.toContain('DROP');
 await expect(service.mine({actor:{id:7},input:{filterAgencyId:'bad'}})).rejects.toMatchObject({status:400});
 await service.mine({actor:{id:7},input:{sort:'toString'}});expect(db.execute.mock.calls.at(-3)[0]).not.toContain('function');
 await expect(service.mine({actor:{}})).rejects.toMatchObject({status:401});
});
it('exposes only GET for the personal directory through the practice boundary',()=>{expect(previewRouteAllowed('GET','/auricwell-preview/my-clients')).toBe(true);expect(previewRouteAllowed('POST','/auricwell-preview/my-clients')).toBe(false);});
