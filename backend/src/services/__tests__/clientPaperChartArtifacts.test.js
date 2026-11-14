import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{findByClientId:vi.fn(),findSchoolPaperPacketsForClient:vi.fn()}}));
vi.mock('../../models/ClientSignedSchoolPacket.model.js',()=>({default:{listByClientId:vi.fn(async()=>[])}}));
vi.mock('../../models/IntakeSubmissionDocument.model.js',()=>({default:{listSignedForClient:vi.fn(async()=>[])}}));
vi.mock('../schoolPacketSections.service.js',()=>({PACKET_SECTION_KEYS:{HIPAA_NOTICE:'hipaa_notice',INFORMED_GROUP_CONSENT:'informed_group_consent',POLICY_SERVICES:'policy_services'},listPacketSectionAcknowledgementsForClient:vi.fn(async()=>[]),buildPacketSectionContext:vi.fn(),findPacketSectionAcknowledgementById:vi.fn()}));
vi.mock('../smartDisclosure.service.js',()=>({getLatestDisclosureAcknowledgement:vi.fn(async()=>null),buildSmartDisclosureContext:vi.fn(),normalizeSmartDisclosureResponse:vi.fn(),buildSmartDisclosureHtml:vi.fn()}));
import Documents from '../../models/ClientPhiDocument.model.js';
import {assembleClientChartArtifacts} from '../clientChartArtifacts.service.js';
it.each(['clean','pending'])('recognizes the registered paper packet even with an arbitrary filename and keeps its scan gate (%s)',async scan=>{
 const doc={id:91,client_id:4,document_type:null,original_name:'example.pdf',scan_status:scan,uploaded_at:'2026-11-13'};
 Documents.findByClientId.mockResolvedValue([doc]);Documents.findSchoolPaperPacketsForClient.mockResolvedValue([doc]);
 const result=await assembleClientChartArtifacts({clientId:4,client:{id:4,agency_id:2}});
 const packet=result.artifacts.find(a=>a.kind==='packet');expect(packet).toMatchObject({kindLabel:'Uploaded paper packet',title:'example.pdf',viewKey:'phi-91',available:scan==='clean'});expect(packet.missing).toBeFalsy();
 expect(result.artifacts.filter(a=>a.viewKey==='phi-91')).toHaveLength(1);
 expect(result.artifacts.find(a=>a.kind==='intake_responses').title).toBe('Enrollment responses');
 expect(result.artifacts.find(a=>a.kind==='hipaa_notice').missing).toBe(true);
});
