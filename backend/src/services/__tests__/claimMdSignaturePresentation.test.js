import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {clinicalNoteSignatureView} from '../clinicalNoteSignatureView.service.js';
import {clinicalSignatureEvidence} from '../../utils/clinicalSignatureEvidence.js';
import {clinicalDisplayTimestamp,clinicalDisplayClock} from '../../utils/clinicalDisplayTime.js';
it('shows both persisted actors and dates and recovers a legacy missing label from the correct account',async()=>{
 const execute=vi.fn(async()=>[[{id:9,first_name:'Synthetic',last_name:'Supervisor',credential:'LPC'}]]);
 const note={provider_signed_at:'2026-11-06 01:23:48',provider_signed_by_user_id:7,supervisor_cosigned_at:'2026-11-11 22:33:00',supervisor_cosigned_by_user_id:9,content_hash:'original-hash',metadata_json:{attestation:{signerLabel:'Synthetic Provider, LSW',ipAddress:'192.0.2.1',userAgent:'Synthetic QA',accurateAndComplete:true},supervisorCosign:{reviewedAndApproved:true,ipAddress:'192.0.2.2',userAgent:'Synthetic QA',contentHash:'original-hash'}}};
 const before=JSON.stringify(note);const rows=await clinicalNoteSignatureView(note,null,null,{execute});
 expect(rows).toMatchObject([{role:'provider',actorUserId:7,signerLabel:'Synthetic Provider, LSW',signedAt:'2026-11-06T01:23:48.000Z',evidence:{ipAddressRecorded:true,userAgentRecorded:true}},{role:'supervisor',actorUserId:9,signerLabel:'Synthetic Supervisor, LPC',signedAt:'2026-11-11T22:33:00.000Z'}]);
 expect(execute).toHaveBeenCalledWith(expect.stringContaining('credential FROM users'),[9]);expect(JSON.stringify(rows)).not.toContain('192.0.2.');expect(JSON.stringify(note)).toBe(before);
 expect(clinicalDisplayTimestamp(rows[0].signedAt)).toContain('Nov 5, 2026, 6:23 PM MST');expect(clinicalDisplayClock('18:13')).toBe('6:13 PM');
});
it('does not invent missing legacy evidence or attribute an unsigned note to its creator',async()=>{
 expect(await clinicalNoteSignatureView({created_by_user_id:7},null,null)).toEqual([]);
 const rows=await clinicalNoteSignatureView({provider_signed_at:'2026-11-06 01:23:48',provider_signed_by_user_id:7},null,{id:7,name:'Synthetic Provider'});
 expect(rows[0].evidence).toEqual({ipAddressRecorded:false,userAgentRecorded:false,attestationRecorded:false});
});
it('shows only signatures attached to the approved amended version',async()=>{
 const versions={originalRevisionId:1,effectiveRevisionId:2,revisions:[{id:2,signatures:[{id:11,actorUserId:9,action:'supervisor_sign',signedAt:'2026-11-11T22:33:00Z',contentHash:'amendment-hash',attestation:{ipAddress:'192.0.2.1',userAgent:'Synthetic'}}]}]};
 const execute=vi.fn(async()=>[[{first_name:'Synthetic',last_name:'Supervisor'}]]);const rows=await clinicalNoteSignatureView({provider_signed_at:'2026-11-06',provider_signed_by_user_id:7},versions,null,{execute});
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({role:'supervisor',actorUserId:9,signatureId:11,revisionId:2,contentHash:'amendment-hash'});
});

it('uses the trusted request address instead of spoofable forwarding headers',()=>{
 expect(clinicalSignatureEvidence({ip:'192.0.2.9',headers:{'x-forwarded-for':'203.0.113.99, 192.0.2.9','user-agent':'Synthetic device'}})).toEqual({ipAddress:'192.0.2.9',ipAddressSource:'trusted_proxy_request',userAgent:'Synthetic device'});
 expect(clinicalSignatureEvidence({headers:{'x-forwarded-for':'203.0.113.99'}}).ipAddress).toBeNull();
});
