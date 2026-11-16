import {it,expect,vi} from 'vitest';
vi.mock('../../models/Client.model.js',()=>({default:{}}));vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{}}));
vi.mock('../paperPacketBytes.service.js',()=>({paperPacketBytes:vi.fn()}));vi.mock('../sessionMaterialScan.service.js',()=>({scanSessionMaterial:vi.fn()}));
vi.mock('../paperPacketVision.service.js',()=>({schedulePaperPacketVisionEval:vi.fn(),getLatestPaperPacketVisionEval:vi.fn()}));
vi.mock('../privatePacketScanJob.service.js',()=>({queuePrivatePacketScan:vi.fn()}));
import {checkPaperPacketFile} from '../paperPacketScan.service.js';
it('queues an explicit reread for a clean previously read packet while keeping ordinary checks deduplicated',async()=>{
 const doc={id:9,client_id:4,agency_id:2,school_organization_id:3,scan_status:'clean'};
 const deps={clients:{findById:async()=>({id:4,agency_id:2,organization_id:3})},documents:{findSchoolPaperPacket:async()=>doc},read:async()=>({doc,buffer:Buffer.from('synthetic')}),latest:async()=>({phi_document_id:9,status:'applied',raw_summary:{reviewHints:{locale:'es'}}}),schedule:vi.fn()};
 expect((await checkPaperPacketFile({clientId:4,documentId:9,actorId:8},deps)).readingQueued).toBeUndefined();expect(deps.schedule).not.toHaveBeenCalled();
 expect(await checkPaperPacketFile({clientId:4,documentId:9,actorId:8,reread:true},deps)).toMatchObject({status:'clean',readingQueued:true});
 expect(deps.schedule).toHaveBeenCalledWith({clientId:4,schoolOrganizationId:3,phiDocumentId:9,actorUserId:8});
 doc.client_id=99;await expect(checkPaperPacketFile({clientId:4,documentId:9,actorId:8,reread:true},deps)).rejects.toMatchObject({status:404});expect(deps.schedule).toHaveBeenCalledTimes(1);
});

it.each(['applied','needs_review'])('keeps a current %s reading with review hints stable until an explicit reread',async status=>{
 const doc={id:9,client_id:4,agency_id:2,school_organization_id:3,scan_status:'clean'};const schedule=vi.fn();
 const result=await checkPaperPacketFile({clientId:4,documentId:9,actorId:8},{clients:{findById:async()=>({id:4,agency_id:2,organization_id:3})},documents:{findSchoolPaperPacket:async()=>doc},read:async()=>({doc,buffer:Buffer.from('synthetic')}),latest:async()=>({phi_document_id:9,status,raw_summary:{reviewHints:{locale:'es'}}}),schedule});
 expect(result.readingQueued).toBeUndefined();expect(schedule).not.toHaveBeenCalled();
});
it('upgrades a legacy reading without extracted language, date and page hints',async()=>{
 const doc={id:9,client_id:4,agency_id:2,school_organization_id:3,scan_status:'clean'};const schedule=vi.fn();
 const result=await checkPaperPacketFile({clientId:4,documentId:9,actorId:8},{clients:{findById:async()=>({id:4,agency_id:2,organization_id:3})},documents:{findSchoolPaperPacket:async()=>doc},read:async()=>({doc,buffer:Buffer.from('synthetic')}),latest:async()=>({phi_document_id:9,status:'applied'}),schedule});
 expect(result.readingQueued).toBe(true);expect(schedule).toHaveBeenCalledOnce();
});
