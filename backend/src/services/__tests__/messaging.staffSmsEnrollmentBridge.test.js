import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../chatEncryption.service.js',()=>({decryptChatText:vi.fn(e=>e.cipher)}));
import {verifySavedStaffSignature,queueStaffSmsEnrollment,currentStaffEnrollmentEvidence} from '../staffSmsEnrollmentBridge.service.js';
import {phoneFingerprint} from '../../utils/staffCommunicationChoices.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const registration={brandId:'B',campaignId:'C',resellerId:'R',brandName:'ITSCO',legalName:'ITSCO LLC',website:'https://example.test',privacyUrl:'https://example.test/privacy',termsUrl:'https://example.test/terms',evidenceUrl:'https://example.test/evidence',supportContact:'support@example.test',purposes:['workforce','polling'],keywordOwner:'application',approved:true,numberLinked:true};
function fixture(){
 const phone='+13035550101',choices={notifications:true,polling:false,messageAlerts:false,kioskArrivals:false,exchangeMatches:false,appointmentReplies:false};
 const disclosure={text:'Actual signed disclosure',programs:[{campaignId:'C',brandName:'ITSCO',privacyUrl:registration.privacyUrl,termsUrl:registration.termsUrl,purposes:['workforce','polling']}]};
 const signed={phone,choices,signerName:'Staff Person',agencyId:2,acknowledged:true,usageAcknowledged:true,reviewedAt:'2026-10-11T04:41:31.324Z',disclosure,disclosureHash:hash(JSON.stringify(disclosure))};
 const state={reference:'staff_communications:original',phoneHash:phoneFingerprint(phone),reviewedAt:signed.reviewedAt,choices,disclosureHash:signed.disclosureHash,envelope:{cipher:JSON.stringify(signed)}};
 return {state,phone,agencyId:2,registration};
}
it('uses the original signature, maps only chosen purposes, and ignores JSON property order',()=>{
 const f=fixture();f.state.choices=Object.fromEntries(Object.entries(f.state.choices).reverse());
 const out=verifySavedStaffSignature(f);expect(out.choices).toEqual({workforce:'yes',polling:'no'});expect(out.signed.signerName).toBe('Staff Person');
});
it.each(['phone','choice','signature','agency','campaign','disclosure'])('rejects a mismatched %s',kind=>{
 const f=fixture();if(kind==='phone')f.phone='+13035550102';if(kind==='choice')f.state.choices={...f.state.choices,polling:true};if(kind==='signature')f.state.envelope=null;if(kind==='agency')f.agencyId=3;if(kind==='campaign')f.registration={...registration,campaignId:'OTHER'};if(kind==='disclosure')f.state.disclosureHash='changed';
 expect(()=>verifySavedStaffSignature(f)).toThrow();
});
it('queues idempotently with original encrypted evidence and never signs a replacement disclosure',async()=>{
 const f=fixture(),database={execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[{id:17}]]:[{affectedRows:1}])};
 await queueStaffSmsEnrollment({...f,userId:9,programs:[{id:4,registration}],database});
 const [sql,args]=database.execute.mock.calls[0];expect(sql).toContain('ON DUPLICATE KEY');expect(args[6]).toBe(JSON.stringify(f.state.envelope));expect(JSON.parse(args[4])).toMatchObject({sourceReference:f.state.reference,originalDisclosure:JSON.parse(f.state.envelope.cipher).disclosure});
});
it('does not enroll an all-No signature',async()=>{
 const f=fixture(),signed=JSON.parse(f.state.envelope.cipher);signed.choices.notifications=false;f.state.choices={...signed.choices};f.state.envelope={cipher:JSON.stringify(signed)};
 const database={execute:vi.fn()};expect(await queueStaffSmsEnrollment({...f,userId:9,programs:[{id:4,registration}],database})).toEqual([]);expect(database.execute).not.toHaveBeenCalled();
});
it('refuses to activate an older signature after choices changed',async()=>{
 const f=fixture(),row={agency_id:2,disclosure_json:{userId:9,sourceReference:'old',campaignId:'C'},signed_payload_json:f.state.envelope};
 const db={execute:vi.fn(async()=>[[{notification_categories:{staff_communications_2:f.state},personal_phone:f.phone}]])};
 await expect(currentStaffEnrollmentEvidence(row,registration,db)).rejects.toMatchObject({code:'sms_consent_superseded'});
});
