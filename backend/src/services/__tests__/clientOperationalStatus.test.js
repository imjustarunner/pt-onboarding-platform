import { expect, it, vi } from 'vitest';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../clientAccountSupportAccess.service.js',()=>({requireClientAccountSupport:vi.fn()}));
import { clientOperationalStatus, operationalSession } from '../clientOperationalStatus.service.js';
it('returns only status metadata, even when a row has sensitive extra fields',()=>{
  const result=operationalSession({id:1,note_id:2,encounter_status:'completed',note_payload:'secret',diagnosis:'secret',claim_payload:'secret',documentUrl:'secret'});
  expect(result).toMatchObject({sessionId:1,noteStatus:'draft',noteWritten:true,sessionStatus:'completed',claimStatus:'none'});
  expect(JSON.stringify(result)).not.toContain('secret');
});
it.each([[{},'missing'],[{note_id:2},'draft'],[{provider_signed_at:'2026-10-25'},'signed'],[{supervisor_cosigned_at:'2026-10-25'},'cosigned']])('describes note lifecycle without content', (row,status)=>expect(operationalSession(row).noteStatus).toBe(status));
it('authorizes the client before touching clinical metadata',async()=>{
  const db={execute:vi.fn()},authorize=vi.fn().mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));
  await expect(clientOperationalStatus({id:1434,role:'support'},99,{db,authorize})).rejects.toMatchObject({status:403});expect(db.execute).not.toHaveBeenCalled();
});
it('uses the authorized client agency and never selects payloads',async()=>{
  const db={execute:vi.fn().mockResolvedValue([[{id:1,claim_lifecycle:'submitted'}]])},authorize=vi.fn().mockResolvedValue({id:70,agency_id:450});
  expect((await clientOperationalStatus({id:1434,role:'support'},70,{db,authorize})).sessions[0].claimStatus).toBe('submitted');
  const [sql,params]=db.execute.mock.calls[0];expect(params).toEqual([450,70]);expect(sql).not.toMatch(/SELECT\s+\*|note_payload|metadata_json|claim_payload|diagnos/i);
});
