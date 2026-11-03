import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({clinical:vi.fn(),main:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main}}));
import {runMedicalBillingReport,getMedicalBillingReportCatalog} from '../medicalBillingReports.service.js';
const schemaRows=map=>Object.entries(map).flatMap(([TABLE_NAME,columns])=>columns.map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})));
beforeEach(()=>{
 vi.clearAllMocks();
 m.main.mockImplementation(async sql=>sql.includes('INFORMATION_SCHEMA')?[schemaRows({clients:['id','agency_id','is_demo']})]:sql.includes('is_demo=1')?[[{id:40}]]:[[ {id:4,full_name:'DEMO is a real name'} ]]);
 m.clinical.mockImplementation(async sql=>sql.includes('INFORMATION_SCHEMA')?[schemaRows({clinical_claims:['id','claim_lifecycle','date_of_service','payer_name','place_of_service'],clinical_claim_lines:['id'],clinical_claim_references:['clinical_claim_id','agency_id','public_reference']})]:sql.startsWith('SELECT COUNT(*) AS total')?[[{total:1}]]:sql.startsWith('SELECT COUNT(*) AS record_count')?[[{record_count:1,total_amount_cents:10000}]]:[[{id:1,client_id:4,claim_reference:'001-2026-11-001',claim_number:'ORIGINAL-PAYER-NUMBER',amount_cents:10000}]]);
});
it.each(['claims','claim_lines'])('exports separate public and payer references for %s and searches the public reference',async type=>{
 const report=await runMedicalBillingReport({agencyId:1,type,filters:{search:'001-2026-11-001'}});
 expect(report.report.columns).toEqual(expect.arrayContaining([{key:'claim_reference',label:'Claim reference',format:'text'},{key:'claim_number',label:'Payer claim number',format:'text'}]));
 expect(report.rows[0]).toMatchObject({claim_reference:'001-2026-11-001',claim_number:'ORIGINAL-PAYER-NUMBER',client_display:'DEMO is a real name'});
 const reads=m.clinical.mock.calls.filter(([sql])=>!sql.includes('INFORMATION_SCHEMA'));
 expect(reads).toHaveLength(3);for(const [sql,params] of reads){expect(sql).toContain('cr.agency_id=c.agency_id');expect(sql).toContain('cr.public_reference');expect(sql).toContain('c.client_id NOT IN (?)');expect(params[0]).toBe(1);expect(params).toContain(40);expect(params).toContain('%001-2026-11-001%');}
 expect(m.main).toHaveBeenCalledWith('SELECT id FROM clients WHERE agency_id=? AND is_demo=1',[1]);
});
it('only changes presentation references and retains explicit test-report access',async()=>{
 await runMedicalBillingReport({agencyId:1,type:'claims',filters:{includeDemo:true}});
 expect(m.main.mock.calls.some(([sql])=>sql.includes('is_demo=1'))).toBe(false);expect(m.clinical.mock.calls.some(([sql])=>sql.includes('client_id NOT IN'))).toBe(false);
 expect(m.clinical.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);expect(getMedicalBillingReportCatalog().find(row=>row.type==='claims').columns[0].key).toBe('id');
});
