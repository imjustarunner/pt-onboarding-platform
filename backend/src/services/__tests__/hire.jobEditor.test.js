import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
const mocks = vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),readObject:vi.fn(),saveAdminDoc:vi.fn(),findById:vi.fn(),createVersion:vi.fn(),setPrimary:vi.fn(),listForJob:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.getConnection}}));
vi.mock('../storage.service.js',()=>({default:{readObject:mocks.readObject,saveAdminDoc:mocks.saveAdminDoc}}));
vi.mock('../../models/EmployeeEvaluationTemplate.model.js',()=>({default:{findById:mocks.findById,createVersion:mocks.createVersion}}));
vi.mock('../../models/HiringJobEvaluationTemplate.model.js',()=>({default:{setPrimary:mocks.setPrimary,listForJob:mocks.listForJob}}));
import { generateRubricFromJobDescription } from '../jobDescriptionEvaluationTemplate.service.js';
import { validateJobEvaluationRubric } from '../../utils/jobEvaluationRubric.js';
import { sanitizeJobDescriptionSections } from '../../utils/jobDescriptionSectionsSanitize.js';
import { sanitizePrehireConfig } from '../../utils/prehireConfigSanitize.js';
import { buildDocumentReceipt, savePrehireDocumentReceipt } from '../prehireSignedReceipt.service.js';
import { isEmployeeVisibleAdminDocType, isCandidateSubmissionAdminDoc } from '../../utils/employeeVisibleAdminDocs.js';
import { saveJobEvaluationRubric, attachTemplateToJob, listTemplatesForJob } from '../employeeEvaluation.service.js';
const db = {execute:mocks.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mocks.getConnection.mockResolvedValue(db);mocks.execute.mockResolvedValue([[{id:4,status:'PREHIRE_OPEN'}]]);mocks.listForJob.mockResolvedValue([]);});
describe('job editor content',()=>{
  it('preserves compensation independently, including compensation-only postings',()=>{
    expect(sanitizeJobDescriptionSections({compensation:[' $30–50 per hour '],benefits:['Health insurance']})).toMatchObject({compensation:['$30–50 per hour'],benefits:['Health insurance']});
    expect(sanitizeJobDescriptionSections({compensation:['$30/hour']})).not.toBeNull();
  });
  it('generates editable criteria from responsibility sets instead of generic fallback',()=>{
    const rubric = generateRubricFromJobDescription({title:'Counselor',description_sections_json:JSON.stringify({responsibilitySets:[{title:'Care',items:['Support clients','Chart visits']}]})});
    expect(rubric.sections[0].criteria.map(c=>c.label)).toEqual(['Support clients','Chart visits']);
    expect(validateJobEvaluationRubric(rubric).title).toContain('Counselor');
  });
  it('rejects missing rating definitions and duplicate keys',()=>{
    const rubric = generateRubricFromJobDescription({title:'Counselor'});
    rubric.sections[0].criteria[0].anchors[1]='';
    expect(()=>validateJobEvaluationRubric(rubric)).toThrow('Needs Improvement');
    rubric.sections[0].criteria[0].anchors[1]='Needs support';
    rubric.sections[0].criteria[1].key=rubric.sections[0].criteria[0].key;
    expect(()=>validateJobEvaluationRubric(rubric)).toThrow('unique key');
  });
  it('keeps receipt-only uploads separate from signature templates',()=>{
    expect(sanitizePrehireConfig({documents:[{id:'notice',kind:'receipt',title:'Notice',filePath:'notice.pdf',templateId:3}]}).documents[0]).toMatchObject({kind:'receipt',filePath:'notice.pdf',templateId:null});
    expect(isEmployeeVisibleAdminDocType('prehire_document_receipt')).toBe(true);
    expect(isCandidateSubmissionAdminDoc({doc_type:'prehire_document_receipt'},4)).toBe(true);
  });
});
describe('rubric ownership and versioning',()=>{
  it('saves a new version and attaches it without changing the original',async()=>{
    const rubric=generateRubricFromJobDescription({title:'Counselor'});
    mocks.findById.mockResolvedValue({id:2,agency_id:1,slug:'role',description:'Existing'});
    mocks.createVersion.mockResolvedValue({id:3});
    await saveJobEvaluationRubric({agencyId:1,jobDescriptionId:4,templateId:2,rubric,createdByUserId:8});
    expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({agencyId:1,slug:'role',rubricJson:rubric}));
    expect(mocks.setPrimary).toHaveBeenCalledWith({agencyId:1,jobDescriptionId:4,templateId:3});
  });
  it('blocks reading another agency’s job and attaching/editing another agency’s rubric',async()=>{
    mocks.execute.mockResolvedValueOnce([[]]);
    await expect(listTemplatesForJob({agencyId:1,jobDescriptionId:4})).rejects.toThrow('not found');
    mocks.findById.mockResolvedValue({id:2,agency_id:9,is_active:true});
    await expect(attachTemplateToJob({agencyId:1,jobDescriptionId:4,templateId:2})).rejects.toThrow('not found');
    await expect(saveJobEvaluationRubric({agencyId:1,jobDescriptionId:4,templateId:2,rubric:{}})).rejects.toThrow('not found');
    expect(mocks.setPrimary).not.toHaveBeenCalled();expect(mocks.createVersion).not.toHaveBeenCalled();
  });
});
describe('receipt retention',()=>{
  it('creates a printable receipt with the original attached, without requiring a signature',async()=>{
    const pdf=await PDFDocument.load(await buildDocumentReceipt({title:'Notice',recipientName:'Candidate',userId:4,source:Buffer.from('exact original'),sourceName:'notice.txt',acknowledgedAt:'2026-09-21T18:00:00Z'}));
    expect(pdf.getPageCount()).toBe(1);expect(pdf.catalog.has(pdf.context.obj('Names'))).toBe(true);
  });
  it('retains the source and receipt atomically and makes repeat submissions idempotent',async()=>{
    mocks.readObject.mockResolvedValue(Buffer.from('original'));mocks.saveAdminDoc.mockResolvedValue({relativePath:'stored/copy'});
    const args={userId:4,agencyId:1,doc:{id:'notice',title:'Notice',filePath:'source',fileName:'notice.pdf',mimeType:'application/pdf'},recipientName:'Candidate'};
    await savePrehireDocumentReceipt(args);
    expect(mocks.saveAdminDoc).toHaveBeenCalledTimes(2);expect(mocks.saveAdminDoc.mock.calls[0][0].toString()).toBe('original');
    expect(db.commit).toHaveBeenCalledTimes(1);
    mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT completed_on')?[[{completed_on:'2026-09-21'}]]:[[{status:'PREHIRE_OPEN'}]]);
    await savePrehireDocumentReceipt(args);
    expect(mocks.saveAdminDoc).toHaveBeenCalledTimes(2);
  });
  it('rechecks the open phase under the user lock before saving',async()=>{
    mocks.readObject.mockResolvedValue(Buffer.from('original'));
    mocks.execute.mockResolvedValue([[{status:'PREHIRE_REVIEW'}]]);
    await expect(savePrehireDocumentReceipt({userId:4,agencyId:1,doc:{id:'notice',title:'Notice',filePath:'source'},recipientName:'Candidate'})).rejects.toThrow('closed');
    expect(db.rollback).toHaveBeenCalled();expect(mocks.saveAdminDoc).not.toHaveBeenCalled();
  });
  it('does not mark a receipt complete when source retrieval fails',async()=>{
    mocks.readObject.mockRejectedValue(new Error('file unavailable'));
    await expect(savePrehireDocumentReceipt({userId:4,agencyId:1,doc:{filePath:'missing'}})).rejects.toThrow('file unavailable');
    expect(db.commit).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();
  });
});
