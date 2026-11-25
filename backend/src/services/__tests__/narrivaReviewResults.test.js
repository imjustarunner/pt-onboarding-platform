import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),agency:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../narrivaAccess.service.js',()=>({requireNarrivaAgency:m.agency,positiveId:value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null,parseNarrivaObject:JSON.parse}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:value=>value}));
vi.mock('../noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:m.audit}));
import {listNarrivaReviewResults} from '../narrivaReviewResults.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{id:18,actor_user_id:7,draft_id:22,result_encrypted:JSON.stringify({clientId:12,phase:'output',documentationCode:'90791',status:'bypassed',manualEdited:true,scoring:{score:45},workingDraft:'Private clinical text must never be returned.',enrollmentPreview:{private:'Answers'},checks:[{id:'encounter_consent',status:'bypassed',findings:[{id:'consent',bypassed:true,message:'Private clinical detail'}]}]})}]]);});
it('limits ordinary authors to their own reviews and returns scores without clinical prose',async()=>{
 const result=await listNarrivaReviewResults({user:{id:7,role:'provider'},query:{agencyId:2}});
 expect(m.agency).toHaveBeenCalledWith(expect.anything(),2);expect(m.execute.mock.calls[0][0]).toContain('AND actor_user_id=?');expect(m.execute.mock.calls[0][1]).toContain(7);
 expect(m.execute.mock.calls[0][0]).not.toContain('client_id');
 expect(result.results[0]).toMatchObject({clientId:12,score:45,manualEdited:true,keptAsWritten:[{checkId:'encounter_consent',id:'consent'}]});expect(JSON.stringify(result)).not.toContain('Private clinical');expect(JSON.stringify(result)).not.toContain('Answers');
});
it('lets an authorized agency reviewer see ordinary signature scores without purchasing an audit report',async()=>{
 await listNarrivaReviewResults({user:{id:9,role:'admin'},query:{agencyId:2}});expect(m.execute.mock.calls[0][0]).not.toContain('AND actor_user_id=?');expect(m.audit).toHaveBeenCalled();
});
it('allows an administrator to choose only their own results',async()=>{
 await listNarrivaReviewResults({user:{id:9,role:'admin'},query:{agencyId:2,scope:'mine',limit:2.8}});expect(m.execute.mock.calls[0][0]).toContain('AND actor_user_id=?');expect(m.execute.mock.calls[0][0]).toContain('LIMIT 2');
});
