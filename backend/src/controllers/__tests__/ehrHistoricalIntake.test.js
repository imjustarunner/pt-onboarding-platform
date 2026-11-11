import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({latest:vi.fn(),create:vi.fn(),find:vi.fn(),update:vi.fn(),reopen:vi.fn(),status:vi.fn(),access:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn(async()=>({id:42,agency_id:2}))}}));
vi.mock('../../models/ClientIntakeNoteDraft.model.js',()=>({default:{latestForClient:mocks.latest,create:mocks.create,findById:mocks.find,updateContent:mocks.update,reopenForReplace:mocks.reopen,updateStatus:mocks.status}}));
vi.mock('../../services/safetyPlans/access.js',()=>({clientAccess:mocks.access}));
vi.mock('../../services/ehrHistoricalImportLock.service.js',()=>({withHistoricalImportLock:vi.fn((_agencyId,_clientId,_kind,work)=>work())}));
vi.mock('../../services/clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:value=>value,maybeDecryptNotePayload:value=>value}));
vi.mock('../../services/noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:vi.fn()}));
vi.mock('../publicIntake.controller.js',()=>({buildClinicalSummaryText:vi.fn(),buildIntakeAnswersText:vi.fn()}));
import {importClientIntakeNote} from '../clientIntakeNote.controller.js';
import {historicalImportDetails} from '../../services/ehrHistoricalImport.service.js';
const historicalImport={sourceSystem:'TherapyNotes',sourceDate:'2020-02-03',sourceAuthor:'Original Clinician',reviewed:true};
const request=()=>({params:{id:42},user:{id:7,role:'super_admin'},body:{text:'Presenting Problem\nOriginal concern\nDiagnosis\nF41.1 Anxiety',historicalImport}});
const run=async()=>{const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await importClientIntakeNote(request(),res,next);return{res,next};};
beforeEach(()=>{
 vi.resetAllMocks();mocks.latest.mockResolvedValue(null);mocks.access.mockResolvedValue({agency_id:2});
 mocks.create.mockImplementation(async value=>{mocks.find.mockResolvedValue({id:11,status:value.status,note_body_enc:value.noteBodyEnc,note_sections_json_enc:value.noteSectionsJsonEnc,session_context_enc:value.sessionContextEnc});return{id:11};});
});
it('retains original intake attribution as an unsigned draft with suggested rather than confirmed diagnosis',async()=>{
 const {res,next}=await run();expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 const saved=mocks.create.mock.calls[0][0];expect(saved).toMatchObject({status:'draft',providerUserId:7});
 expect(saved.noteBodyEnc).toContain('Original author: Original Clinician');
 expect(JSON.parse(saved.sessionContextEnc)).toMatchObject({source:'ehr_transition_import',historicalImport:{sourceDate:'2020-02-03',sourceAuthor:'Original Clinician',sourceText:request().body.text,reviewRequired:true}});
 expect(mocks.status).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
});
it.each(['final','ready','draft'])('does not overwrite or reopen an unrelated existing intake (%s)',async status=>{
 mocks.latest.mockResolvedValue({id:10,status,session_context_enc:'{}'});
 const {res,next}=await run();expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(409);
 expect(mocks.create).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();expect(mocks.reopen).not.toHaveBeenCalled();
});
it('reuses the exact imported source on retries without creating or changing a draft',async()=>{
 const details=historicalImportDetails(historicalImport,request().body.text);
 mocks.latest.mockResolvedValue({id:11,status:'draft',session_context_enc:JSON.stringify({historicalImport:details})});
 const {res,next}=await run();expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(200);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({reused:true,draft:expect.objectContaining({id:11})}));
 expect(mocks.create).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
});
it('fails closed on historical source lookup and clinical access failures',async()=>{
 mocks.latest.mockRejectedValue(new Error('Lookup unavailable'));let result=await run();expect(result.next).toHaveBeenCalledWith(expect.objectContaining({message:'Lookup unavailable'}));
 mocks.access.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));result=await run();expect(result.next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(mocks.create).not.toHaveBeenCalled();
});
