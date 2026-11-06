import {it,expect,vi} from 'vitest';
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:vi.fn(),decryptFamilyBilling:x=>x}));
import {submissionMatches} from '../remittances/store.js';
import {normalizeEra} from '../remittances/normalize.js';
const sent={pcn:'002-2026-11-009',ins_number:'SYNTHETIC',bill_npi:'1234567893',payerid:'TEST',total_charge:'100.00',charge:[{proc_code:'90837',from_date:'2026-01-01',units:'1',charge:'100.00'}]};
const era=normalizeEra({eraid:'100',prov_taxid:'123456789',prov_npi:'1234567893',payerid:'TEST',paid_date:'2026-01-03',paid_amount:'80.00',claim:[{pcn:sent.pcn,ins_number:'SYNTHETIC',payer_icn:'ICN-123',status_code:'1',total_charge:'100.00',total_paid:'80.00',charge:[{proc_code:'90837',from_dos:'20260101',units:'1',charge:'100.00',paid:'80.00',adjustment:[{group:'CO',code:'45',amount:'20.00'}]}]}]},{taxId:'123456789',npis:['1234567893'],eraId:'100'});
const dbFor=states=>({execute:vi.fn(async sql=>sql.includes('FROM clinical_claims')?[states.map((state,i)=>({id:11+i,claim_lifecycle:state,claimmd_submitted_at:'2026-01-02'}))]:[[{event_key:'sent',payload_encrypted:{payload:sent}}]])});
it('matches a stable PCN to its submitted attempt without treating prior confirmed rejections as payments',async()=>{
 const db=dbFor(['rejected','rejected','submitted']);expect(await submissionMatches(db,2,'account:2',era.items[0],era)).toEqual([13]);
 expect(db.execute.mock.calls[0][1]).toEqual([2,'account:2',sent.pcn,sent.pcn]);
});
it('keeps ambiguous adjudicated/replacement matches for manual review and refuses changed payer data',async()=>{
 expect(await submissionMatches(dbFor(['paid','submitted']),2,'account:2',era.items[0],era)).toEqual([11,12]);
 expect(await submissionMatches(dbFor(['submitted']),2,'account:2',{...era.items[0],memberId:'DIFFERENT'},era)).toEqual([]);
});
