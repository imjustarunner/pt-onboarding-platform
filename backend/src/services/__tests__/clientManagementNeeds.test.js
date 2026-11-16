import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import { computeRenewalFlagsForClients, filterClientsByRenewalFlag } from '../clientRenewalFlags.service.js';
it('filters evaluated up-to-date clients without hiding pending packet reviews as complete',()=>{
 const rows=[{id:1,renewalFlags:{any:false}},{id:2,renewalFlags:{any:true,paperPacketVisionReview:true}},{id:3}];
 expect(filterClientsByRenewalFlag(rows,'up_to_date').map(row=>row.id)).toEqual([1]);expect(filterClientsByRenewalFlag(rows,'any').map(row=>row.id)).toEqual([2]);
});
it('resolves a completed human packet review without changing the Vision evidence or suppressing replacement packets',async()=>{
 const processed={documentId:8,processedAt:'2026-11-16T17:00:00Z',signatureSourceDocumentId:8,packetEvaluationId:18,consentReview:{kind:'human_source_review',documentId:8,evaluationId:18}};
 const client={id:1,agency_id:2,organization_id:3,client_type:'school',roi_expires_at:'2099-01-01',paper_packet_staff_roi_pending:0};
 for(const [changes,sourceDocumentId,needsReview] of [[{},8,false],[{processedAt:null},8,true],[{packetEvaluationId:17},8,true],[{documentId:7},8,true],[{},9,true]]){
  const evaluation={client_id:1,id:18,phi_document_id:8,status:'needs_review',onboarding_docs_json:JSON.stringify({paperPacketSource:{documentId:sourceDocumentId},paperProcessing:{...processed,...changes}})};
  pool.execute.mockImplementation(async sql=>[sql.includes('SELECT e.client_id')?[evaluation]:[]]);
  const flags=(await computeRenewalFlagsForClients([client])).get(1);
  expect(flags.paperPacketVisionReview).toBe(needsReview);expect(evaluation.status).toBe('needs_review');
 }
});
