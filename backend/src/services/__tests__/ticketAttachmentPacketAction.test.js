import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),read:vi.fn(),scan:vi.fn(),save:vi.fn(),createDraft:vi.fn(),createDocument:vi.fn(),updateDraft:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../../models/ClientSchoolStaffRoiAccess.model.js',()=>({default:{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:114,name:'Grant',slug:'grant',organization_type:'school'})}}));
vi.mock('../../models/AgencySchool.model.js',()=>({default:{}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{getActiveAgencyIdForOrganization:async()=>2}}));
vi.mock('../../models/ReferralPacketDraft.model.js',()=>({default:{create:m.createDraft,updateById:m.updateDraft}}));
vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{create:m.createDocument}}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:vi.fn()}));
vi.mock('../documentEncryption.service.js',()=>({default:{encryptBuffer:async()=>({encryptedBuffer:Buffer.from('encrypted')})}}));
vi.mock('../storage.service.js',()=>({default:{sanitizeFilename:name=>name,getGCSBucket:async()=>({file:()=>({save:m.save})})}}));
vi.mock('../sessionMaterialScan.service.js',()=>({scanSessionMaterial:m.scan}));
vi.mock('../schoolSupportResponsePlan.service.js',()=>({buildAndPersistResponsePlanForTicket:vi.fn()}));
vi.mock('../schoolGroupProvisioning.service.js',()=>({queueSchoolStaffGoogleGroupSync:vi.fn()}));
vi.mock('../unifiedEmail/ticketInboundAttachments.service.js',()=>({
 getTicketAttachmentRow:async()=>({id:20,file_name:'packet.pdf',mime_type:'application/pdf'}),readTicketAttachmentBuffer:m.read,
 isPdfAttachment:()=>true,ingestTicketAttachmentsFromGmail:vi.fn(),listTicketAttachments:vi.fn(),parseLikelyClientName:vi.fn()
}));
import { approveAndExecuteTicketAction } from '../unifiedEmail/ticketActionSuggestion.service.js';
const action={id:9,status:'proposed',action_type:'upload_school_packet',payload_json:JSON.stringify({schoolOrganizationId:114,attachmentId:20})};
const input={ticketId:745,actionId:9,approvedByUserId:7};
beforeEach(()=>{
 vi.clearAllMocks();
 m.execute.mockImplementation(async sql=>sql.includes('information_schema')?[[{cnt:1}]]:sql.startsWith('SELECT')?[[action]]:[{affectedRows:1}]);
 m.read.mockResolvedValue(Buffer.from('%PDF-1.7 synthetic packet'));m.scan.mockResolvedValue({status:'clean'});
 m.createDraft.mockResolvedValue({id:60});m.createDocument.mockResolvedValue({id:80});
});
it('preserves the original packet as an encrypted, scanned draft for the exact school',async()=>{
 const {action:completed}=await approveAndExecuteTicketAction(input);
 expect(completed.result).toMatchObject({draftId:60,phiDocumentId:80,organizationId:114,organizationSlug:'grant',scanStatus:'clean'});
 expect(m.save.mock.calls[0][0]).toEqual(Buffer.from('encrypted'));
 expect(m.createDocument).toHaveBeenCalledWith(expect.objectContaining({clientId:null,referralDraftId:60,schoolOrganizationId:114,scanStatus:'clean',isEncrypted:true}));
});
it('prevents a concurrent approval from creating another packet',async()=>{
 const original=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes("SET status = 'approved'")?Promise.resolve([{affectedRows:0}]):original(sql,args));
 await expect(approveAndExecuteTicketAction(input)).rejects.toMatchObject({statusCode:409});
 expect(m.read).not.toHaveBeenCalled();expect(m.createDraft).not.toHaveBeenCalled();
});
it('does not create a packet when the attachment fails scanning',async()=>{
 m.scan.mockResolvedValue({status:'infected'});
 await expect(approveAndExecuteTicketAction(input)).rejects.toMatchObject({statusCode:422});
 expect(m.save).not.toHaveBeenCalled();expect(m.createDraft).not.toHaveBeenCalled();
});
