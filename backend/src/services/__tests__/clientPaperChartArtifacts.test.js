import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{findByClientId:vi.fn(),findSchoolPaperPacketsForClient:vi.fn(),findSchoolPaperPacket:vi.fn()}}));
vi.mock('../demographicsImport.service.js',()=>({decryptDemographicsPayload:value=>value}));
vi.mock('../../models/ClientSignedSchoolPacket.model.js',()=>({default:{listByClientId:vi.fn(async()=>[])}}));
vi.mock('../../models/IntakeSubmissionDocument.model.js',()=>({default:{listSignedForClient:vi.fn(async()=>[])}}));
vi.mock('../schoolPacketSections.service.js',()=>({PACKET_SECTION_KEYS:{HIPAA_NOTICE:'hipaa_notice',INFORMED_GROUP_CONSENT:'informed_group_consent',POLICY_SERVICES:'policy_services'},listPacketSectionAcknowledgementsForClient:vi.fn(async()=>[]),buildPacketSectionContext:vi.fn(),findPacketSectionAcknowledgementById:vi.fn()}));
vi.mock('../smartDisclosure.service.js',()=>({getLatestDisclosureAcknowledgement:vi.fn(async()=>null),buildSmartDisclosureContext:vi.fn(),normalizeSmartDisclosureResponse:vi.fn(),buildSmartDisclosureHtml:vi.fn()}));
import Documents from '../../models/ClientPhiDocument.model.js';
import {assembleClientChartArtifacts,renderChartArtifactView} from '../clientChartArtifacts.service.js';
import {paperReadingSnapshot} from '../paperPacketReading.service.js';
it('opens reviewed English paper enrollment answers with the escaped original, under the packet scan and agency gates',async()=>{
 const candidate={documentId:91,sourceLocale:'es',responses:[{key:'medicalInformation',label:'Medical information',sourceLocale:'es',sourceText:'Sin alergias. <script>mal</script>',englishText:'Draft.'}]};candidate.reviewedEnglishResponses={snapshotId:paperReadingSnapshot(candidate),answers:{medicalInformation:'No allergies. <script>bad</script>'},reviewedAt:'2026-11-14'};
 const client={id:4,agency_id:2,paper_packet_demo_candidate_enc:candidate},doc={id:91,client_id:4,agency_id:2,scan_status:'clean'};
 Documents.findByClientId.mockResolvedValue([doc]);Documents.findSchoolPaperPacketsForClient.mockResolvedValue([doc]);Documents.findSchoolPaperPacket.mockResolvedValue(doc);
 const result=await assembleClientChartArtifacts({clientId:4,client});expect(result.artifacts.find(item=>item.kind==='intake_responses').viewKey).toBe('paperanswers-91');
 const rendered=await renderChartArtifactView({client,viewKey:'paperanswers-91'});expect(rendered.html).toContain('No allergies. &lt;script&gt;bad&lt;/script&gt;');expect(rendered.html).toContain('Sin alergias. &lt;script&gt;mal&lt;/script&gt;');expect(rendered.html).not.toContain('<script>');
 for(const source of [{...doc,agency_id:8},{...doc,scan_status:'pending'},null]){Documents.findSchoolPaperPacket.mockResolvedValue(source);expect(await renderChartArtifactView({client,viewKey:'paperanswers-91'})).toEqual({notFound:true});}
 expect(await renderChartArtifactView({client,viewKey:'paperanswers-92'})).toEqual({notFound:true});
});
it.each(['clean','pending'])('recognizes the registered paper packet even with an arbitrary filename and keeps its scan gate (%s)',async scan=>{
 const doc={id:91,client_id:4,document_type:null,original_name:'example.pdf',scan_status:scan,uploaded_at:'2026-11-13'};
 Documents.findByClientId.mockResolvedValue([doc]);Documents.findSchoolPaperPacketsForClient.mockResolvedValue([doc]);
 const result=await assembleClientChartArtifacts({clientId:4,client:{id:4,agency_id:2}});
 const packet=result.artifacts.find(a=>a.kind==='packet');expect(packet).toMatchObject({kindLabel:'Uploaded paper packet',title:'example.pdf',viewKey:'phi-91',available:scan==='clean'});expect(packet.missing).toBeFalsy();
 expect(result.artifacts.filter(a=>a.viewKey==='phi-91')).toHaveLength(1);
 expect(result.artifacts.find(a=>a.kind==='intake_responses').title).toBe('Enrollment responses');
 expect(result.artifacts.find(a=>a.kind==='hipaa_notice').missing).toBe(true);
});
