import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
const m=vi.hoisted(()=>({files:vi.fn(),extract:vi.fn()}));
vi.mock('../storage.service.js',()=>({default:{getGCSStorage:async()=>({bucket:()=>({getFiles:m.files})})}}));
vi.mock('../resumeTextExtraction.service.js',()=>({extractResumeTextFromUpload:m.extract}));
import {buildKnowledgeBaseEvidenceFromDocs,getKnowledgeBaseEvidence,resetClinicalKnowledgeBaseCache} from '../clinicalKnowledgeBase.service.js';
const file=(name,content,{type='application/pdf',version='1',fail=false}={})=>({name,getMetadata:async()=>[{size:String(Buffer.byteLength(content)),contentType:type,generation:version}],download:async()=>{if(fail)throw Error('PRIVATE_IDENTIFIER_CANARY');return [Buffer.from(content)];}});
beforeEach(()=>{vi.clearAllMocks();resetClinicalKnowledgeBaseCache();vi.stubEnv('CLINICAL_KB_BUCKET','synthetic-reference-bucket');vi.stubEnv('CLINICAL_KB_MAX_DOCS','100');m.files.mockResolvedValue([[],null]);m.extract.mockImplementation(async({buffer})=>({status:'completed',text:buffer.toString()}));});
afterEach(()=>vi.unstubAllEnvs());
describe('complete supporting documentation and authored-example evidence',()=>{
 it('keeps differently authored examples sharing a basename and all introductory instructions',()=>{
  const result=buildKnowledgeBaseEvidenceFromDocs([{name:'shared/Approved Examples.pdf',text:'Owner instructions before examples. Subjective: First approved example.'},{name:'psychotherapy/Approved Examples.pdf',text:'Different approved example with detailed intervention response.'}]);
  expect(result.complete).toBe(true);expect(result.documents).toHaveLength(2);expect(result.text).toContain('Owner instructions before examples');expect(result.text).toContain('Different approved example');
  expect(result.text).not.toContain('shared/Approved Examples.pdf');expect(result.text).not.toContain('psychotherapy/Approved Examples.pdf');
 });
 it('deduplicates identical content while retaining every distinct approved example',()=>{
  const result=buildKnowledgeBaseEvidenceFromDocs([{name:'shared/Guide.pdf',text:'Same approved content'},{name:'therapy/Guide.pdf',text:'Same approved content'},{name:'therapy/Example.pdf',text:'Distinct approved example'}]);
  expect(result.documents).toHaveLength(2);expect(result.complete).toBe(true);
 });
 it('reports insufficient context capacity instead of silently clipping a required document',()=>{
  const result=buildKnowledgeBaseEvidenceFromDocs([{name:'Approved Examples.pdf',text:'Required example beginning. END_OF_REQUIRED_EXAMPLE'}],{maxChars:20});
  expect(result.complete).toBe(false);expect(result.documents[0].included).toBe(false);expect(result.text).toBe('');
 });
 it('does not treat a clipped extraction as complete support',()=>{
  const result=buildKnowledgeBaseEvidenceFromDocs([{name:'Required guide.pdf',text:'Only part of source',truncated:true}]);expect(result.complete).toBe(false);
 });
 it('loads every selected folder and word/text examples with opaque prompt labels',async()=>{
  m.files.mockImplementation(async({prefix})=>[[file(`${prefix}PERSON_NAME_CANARY.docx`,'Owner word example',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),file(`${prefix}Instructions.md`,`${prefix}Markdown training`,{type:'text/markdown'})],null]);
  const result=await getKnowledgeBaseEvidence({folders:['shared','service_examples']});
  expect(m.files).toHaveBeenCalledTimes(2);expect(result.complete).toBe(true);expect(result.text).toContain('Owner word example');expect(result.text).toContain('Markdown training');
  expect(result.text).not.toContain('PERSON_NAME_CANARY.docx');expect(JSON.stringify(result.documents)).not.toContain('PERSON_NAME_CANARY');
 });
 it('detects a source listing beyond the configured processing limit',async()=>{
  vi.stubEnv('CLINICAL_KB_MAX_DOCS','1');m.files.mockResolvedValue([[file('shared/one.pdf','First guide'),file('shared/two.pdf','Second guide')],null]);
  const result=await getKnowledgeBaseEvidence({folders:['shared']});expect(result.complete).toBe(false);expect(result.coverage.listingLimited).toBe(true);expect(m.files).toHaveBeenCalledWith(expect.objectContaining({maxResults:2,autoPaginate:false}));
 });
 it('does not hide an empty required service folder behind a populated shared folder',async()=>{
  m.files.mockImplementation(async({prefix})=>[prefix==='shared/'?[file('shared/Instructions.pdf','Shared owner instructions')]:[],null]);
  const result=await getKnowledgeBaseEvidence({folders:['shared','required_service_examples']});
  expect(result.text).toContain('Shared owner instructions');expect(result.complete).toBe(false);expect(result.coverage.emptyFolders).toBe(1);
 });
 it('fails coverage for unreadable required sources without exposing source errors',async()=>{
  m.files.mockResolvedValue([[file('shared/Required guide.pdf','Guide',{fail:true})],null]);const result=await getKnowledgeBaseEvidence({folders:['shared']});
  expect(result.complete).toBe(false);expect(result.coverage.unreadable).toBe(1);expect(JSON.stringify(result)).not.toContain('PRIVATE_IDENTIFIER_CANARY');
 });
 it('substitutes the exact selected-service/manual-introduction pack only for the exact approved PDF bytes',async()=>{
  const content='M'.repeat(200000),binaryHash=createHash('sha256').update(content).digest('hex');m.files.mockResolvedValue([[file('shared/SBHS Billing Manual.pdf',content)],null]);
  const selected='Exact90837 manual entry and verified introduction pages.';
  const result=await getKnowledgeBaseEvidence({folders:['shared'],referenceReplacements:[{binaryHash,text:selected}]});
  expect(result.complete).toBe(true);expect(result.text).toContain(selected);expect(result.documents[0]).toMatchObject({scopedReference:true,role:'official_service_reference',binaryHash});
  resetClinicalKnowledgeBaseCache();const wrong=await getKnowledgeBaseEvidence({folders:['shared'],referenceReplacements:[{binaryHash:'wrong-version',text:selected}]});expect(wrong.complete).toBe(false);expect(wrong.text).not.toContain(selected);
 });
 it('retains cloud-object versions for future exact-guidance revalidation',async()=>{
  m.files.mockResolvedValue([[file('shared/Guide.pdf','Guide text',{version:'42'})],null]);const result=await getKnowledgeBaseEvidence({folders:['shared']});expect(result.documents[0].version).toBe('42');
 });
});
