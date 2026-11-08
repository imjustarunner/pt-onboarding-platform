vi.mock('../../services/storage.service.js',()=>({default:{getSignedUrl:m.url}}));
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ parent: vi.fn(), agency: vi.fn(), school: vi.fn(), render: vi.fn(), submission: vi.fn(), signed: vi.fn(), url:vi.fn() }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: async () => ({ id: 4, scope_type: 'school', organization_id: 90, form_type: 'intake' }) } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findBySessionToken: m.submission } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
vi.mock('../../models/AgencySchoolIntakeMaster.model.js', () => ({ default: { resolveParentAgencyIdForSchool: m.parent, applyMasterToLink: m.school } }));
vi.mock('../../models/AgencyOfficeIntakeMaster.model.js', () => ({ default: { applyMasterToLink: async link => link } }));
vi.mock('../../models/IntakeSubmissionDocument.model.js', () => ({ default: { listSignedForRecord: m.signed } }));
vi.mock('../../services/jobApplicationRecord.service.js', () => ({ enrichApplicationRecord: async value => value, appendApplicationJobDescription: async value => value }));
vi.mock('../../services/packetBrandChrome.service.js', () => ({ brandedIntakeSummarySpec: async spec => spec }));
vi.mock('../../services/intakeSummaryPdf.service.js', async importOriginal => ({ ...await importOriginal(), generateIntakeSummaryPdf: m.render }));
import { downloadPublicIntakeSummaryPdf, listPublicIntakeSignedRois } from '../intakeSummaryPdf.controller.js';
beforeEach(() => {
  vi.clearAllMocks(); m.signed.mockResolvedValue([]); m.url.mockImplementation(async path=>`https://example.test/${path}`); m.parent.mockResolvedValue(450); m.agency.mockResolvedValue({id:450,name:'QA Parent Agency'});
  m.school.mockImplementation(async (link,{agencyId}) => ({...link,intake_steps:agencyId===450?[{type:'questions',fields:Array.from({length:17},(_,i)=>({key:`psc_${i+1}`,label:`Screening item ${i+1}`,type:'radio',options:[{value:'1',label:'Never'},{value:'2',label:'Sometimes'},{value:'3',label:'Often'}]}))}]:[]}));
  m.submission.mockResolvedValue({id:10,intake_link_id:4,status:'submitted',intake_data:{clients:[{firstName:'Alex',lastName:'Example'}],responses:{submission:{},clients:[Object.fromEntries(Array.from({length:17},(_,i)=>[`psc_${i+1}`,'1']))]}}});
  m.render.mockResolvedValue(Buffer.from('%PDF-synthetic'));
});
it('uses the school’s parent agency master so all 17 single-child Never answers remain Never',async()=>{
 const req={params:{publicKey:'school',submissionId:10},body:{sessionToken:'synthetic'},query:{},get:()=>''};const res={setHeader:vi.fn(),send:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await downloadPublicIntakeSummaryPdf(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(m.agency).toHaveBeenCalledWith(450);
 const rows=m.render.mock.calls[0][0].sections.flatMap(section=>section.rows||[]).filter(row=>row.label.startsWith('Screening item'));
 expect(rows).toHaveLength(17);expect(rows.every(row=>row.value==='Never')).toBe(true);
});

it('returns only signed ROI documents for an authorized session and never a template or sibling packet',async()=>{
 m.signed.mockResolvedValue([{id:7,client_id:41,signed_pdf_path:'child41-roi',audit_trail:{smartSchoolRoi:true,roiResponse:{clientFullName:'QA Child 41'}}},{id:8,client_id:42,signed_pdf_path:'child42-roi',audit_trail:{smartSchoolRoi:true,roiResponse:{clientFullName:'QA Child 42'}}},{id:9,signed_pdf_path:'other-document',audit_trail:{}}]);
 const req={params:{publicKey:'school',submissionId:10},body:{},query:{sessionToken:'synthetic'},get:()=>''};
 const res={set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await listPublicIntakeSignedRois(req,res,next);expect(next).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith({documents:[{id:7,clientId:41,clientName:'QA Child 41',url:'https://example.test/child41-roi'},{id:8,clientId:42,clientName:'QA Child 42',url:'https://example.test/child42-roi'}]});
 for(const changed of [{...req,query:{}},{...req,params:{...req.params,submissionId:11}}]){
  m.signed.mockClear();next.mockClear();await listPublicIntakeSignedRois(changed,res,next);expect(next).toHaveBeenCalled();expect(m.signed).not.toHaveBeenCalled();
 }
});
