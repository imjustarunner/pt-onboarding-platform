vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{findSchoolPaperPacketsForClient:vi.fn()}}));
import ClientPhiDocument from '../../models/ClientPhiDocument.model.js';
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../services/clientOnboardingChecklist.service.js',()=>({isAssignedProvider:vi.fn()}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:vi.fn()}));
vi.mock('../../services/paperPacketProcessing.service.js',()=>({paperProcessingContext:vi.fn(),paperProcessingSourceDocument:vi.fn(),savePaperProcessingStep:vi.fn(),completePaperProcessing:vi.fn()}));
vi.mock('../../services/paperPacketTask.service.js',()=>({completePaperPacketTask:vi.fn(),listPaperPacketTasks:vi.fn(async()=>[])}));
vi.mock('../phiDocuments.controller.js',()=>({viewPhiDocument:vi.fn()}));
import Client from '../../models/Client.model.js';
import User from '../../models/User.model.js';
import {paperProcessingContext,paperProcessingSourceDocument,completePaperProcessing} from '../../services/paperPacketProcessing.service.js';
import {listPaperPacketDocuments,getPaperProcessing,postPaperProcessing,viewPaperProcessingDocument} from '../clientOnboarding.controller.js';
import {viewPhiDocument} from '../phiDocuments.controller.js';
let res,next;
beforeEach(()=>{vi.resetAllMocks();Client.findById.mockResolvedValue({id:4,agency_id:2,organization_id:3});User.getAgencies.mockResolvedValue([{id:2}]);res={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis()};next=vi.fn();});
const request=role=>({params:{id:'4'},user:{id:8,role},body:{signaturesConfirmed:true,staffRoiConfirmed:true}});
it.each(['school_staff','client_guardian','client','provider'])('rejects %s before reading packet details',async role=>{await getPaperProcessing(request(role),res,next);expect(res.status).toHaveBeenCalledWith(403);expect(paperProcessingContext).not.toHaveBeenCalled();});
it('rejects a support user from another agency without sending invitations',async()=>{User.getAgencies.mockResolvedValue([{id:9}]);await postPaperProcessing(request('support'),res,next);expect(res.status).toHaveBeenCalledWith(403);expect(completePaperProcessing).not.toHaveBeenCalled();});
it('allows agency support to read the resumable context without a write',async()=>{paperProcessingContext.mockResolvedValue({state:{}});await getPaperProcessing(request('support'),res,next);expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({state:{}});expect(completePaperProcessing).not.toHaveBeenCalled();});
it('opens only the validated paper source through the existing audited document reader',async()=>{
 const req=request('support');req.params.docId='9';paperProcessingSourceDocument.mockResolvedValue({id:9});
 await viewPaperProcessingDocument(req,res,next);
 expect(paperProcessingSourceDocument).toHaveBeenCalledWith(4,9);expect(viewPhiDocument).toHaveBeenCalledWith(req,res,next);
});
it('does not open a source when validation rejects it',async()=>{
 const req=request('support');req.params.docId='10';const error=new Error('Foreign document');paperProcessingSourceDocument.mockRejectedValue(error);
 await viewPaperProcessingDocument(req,res,next);expect(next).toHaveBeenCalledWith(error);expect(viewPhiDocument).not.toHaveBeenCalled();
});
it('does not open a source for support outside the client agency',async()=>{
 User.getAgencies.mockResolvedValue([{id:9}]);await viewPaperProcessingDocument(request('support'),res,next);
 expect(res.status).toHaveBeenCalledWith(403);expect(paperProcessingSourceDocument).not.toHaveBeenCalled();expect(viewPhiDocument).not.toHaveBeenCalled();
});

it('lists scoped pending and clean paper metadata without exposing storage paths or another child',async()=>{
 ClientPhiDocument.findSchoolPaperPacketsForClient.mockResolvedValue([
  {id:9,client_id:4,agency_id:2,original_name:'QA.pdf',scan_status:'pending',storage_path:'private/secret'},
  {id:10,client_id:5,agency_id:2},{id:11,client_id:4,agency_id:3},{id:12,client_id:4,agency_id:2,removed_at:'2026-11-08'}
 ]);
 await listPaperPacketDocuments(request('support'),res,next);
 expect(res.json).toHaveBeenCalledWith({tasks:[],documents:[expect.objectContaining({id:9,scan_status:'pending'})]});
 expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/storage_path|secret/);
 User.getAgencies.mockResolvedValue([{id:9}]);ClientPhiDocument.findSchoolPaperPacketsForClient.mockClear();
 await listPaperPacketDocuments(request('support'),res,next);expect(res.status).toHaveBeenCalledWith(403);expect(ClientPhiDocument.findSchoolPaperPacketsForClient).not.toHaveBeenCalled();
});
