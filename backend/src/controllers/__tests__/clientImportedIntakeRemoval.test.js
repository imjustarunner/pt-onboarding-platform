import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),update:vi.fn(),status:vi.fn(),access:vi.fn(),client:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.access}}));
vi.mock('../../models/ClientIntakeNoteDraft.model.js',()=>({default:{findForClient:m.find,updateContent:m.update,updateStatus:m.status}}));
vi.mock('../../services/intakeDraftMutationLock.service.js',()=>({withIntakeDraftMutationLock:(_id,work)=>work()}));
vi.mock('../../services/clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:value=>value,maybeDecryptNotePayload:value=>value}));
vi.mock('../../services/noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:m.audit}));
vi.mock('../publicIntake.controller.js',()=>({buildClinicalSummaryText:vi.fn(),buildIntakeAnswersText:vi.fn()}));
import {removeImportedClientIntakeNote} from '../clientIntakeNote.controller.js';
const req=()=>({params:{id:5,draftId:12},user:{id:7,role:'admin'},body:{reason:'Duplicate imported copy'}});
const run=async request=>{const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await removeImportedClientIntakeNote(request||req(),res,next);return {res,next};};
beforeEach(()=>{vi.clearAllMocks();m.client.mockResolvedValue({id:5,agency_id:2});m.access.mockResolvedValue([{id:2}]);m.find.mockResolvedValue({id:12,status:'draft',session_context_enc:JSON.stringify({source:'client_records_import',original:'preserved'})});});
it('lets an authorized admin remove an unsigned imported duplicate, retaining its source and actor in audit',async()=>{
 const {res,next}=await run();expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({removed:true});
 expect(m.find).toHaveBeenCalledWith({draftId:12,clientId:5,agencyId:2});expect(m.status).toHaveBeenCalledWith(expect.objectContaining({draftId:12,status:'failed'}));
 expect(JSON.parse(m.update.mock.calls[0][0].sessionContextEnc)).toMatchObject({original:'preserved',removedImport:{byUserId:7,reason:'Duplicate imported copy'}});expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({user:{id:7,role:'admin'}}),expect.objectContaining({action:'client_imported_intake_removed'}));
});
it.each(['final','unrelated'])('preserves signed notes and unrelated clinical drafts (%s)',async type=>{
 m.find.mockResolvedValue({id:12,status:type==='final'?'final':'draft',session_context_enc:JSON.stringify({source:type==='final'?'client_records_import':'clinical'})});const {res}=await run();expect(res.status).toHaveBeenCalledWith(409);expect(m.update).not.toHaveBeenCalled();expect(m.status).not.toHaveBeenCalled();
});
it('requires admin authority, client-agency access and an explicit reason',async()=>{
 const r=req();r.user.role='support';expect((await run(r)).res.status).toHaveBeenCalledWith(403);expect(m.find).not.toHaveBeenCalled();
 m.access.mockResolvedValue([{id:99}]);expect((await run()).res.status).toHaveBeenCalledWith(403);expect(m.find).not.toHaveBeenCalled();
 const noReason=req();noReason.body={};expect((await run(noReason)).res.status).toHaveBeenCalledWith(400);
});
