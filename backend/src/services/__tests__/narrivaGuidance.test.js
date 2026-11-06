import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),custom:vi.fn(),access:vi.fn(),knowledge:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/NoteAidAgencyCatalog.model.js',()=>({default:{findCustomAid:m.custom,userCanAccessCustomAid:m.access,parseKbFolders:value=>Array.isArray(value)?value:[]}}));
vi.mock('../clinicalKnowledgeBase.service.js',()=>({getKnowledgeBaseContext:m.knowledge,getKnowledgeBaseEvidence:m.knowledge,noteAidKnowledgeBaseOptions:value=>value}));
import {loadNarrivaGuidanceContext,narrivaServiceReferenceContext} from '../narrivaGuidance.service.js';
import {getNoteAidToolById} from '../../config/noteAidTools.js';
import {resolveClinicalToolId} from '../../config/clinicalNoteToolRouting.js';

const source=()=>({agencyId:2,source:{user_id:7},meta:{toolId:'clinical_h0004_note'},service:{code:'H0004'}});
beforeEach(()=>{vi.clearAllMocks();m.agency.mockResolvedValue({feature_flags:{noteAidKbExtraFolders:['owner_guides']}});m.knowledge.mockResolvedValue({text:'Authored training instructions. Approved example shows specific actual interventions and participant response.',complete:true,documents:[{id:'opaque-guide',contentHash:'guide-v1',role:'authored_training'}],coverage:{complete:true}});m.access.mockResolvedValue(true);});

describe('exact selected-service and owner-authored Narriva guidance',()=>{
 it('uses the same service routing for generation and manual review, including program-specific skills notes',()=>{
  for(const [code,tool] of [['H0004','clinical_h0004_note'],['H2011','clinical_h2011_note'],['90837','clinical_psychotherapy_note'],['90834','clinical_psychotherapy_note'],['90832','clinical_psychotherapy_note'],['90839','clinical_psychotherapy_note'],['90846','clinical_family_note'],['90847','clinical_family_note'],['H0031','clinical_h0031_intake'],['H0032','clinical_h0032_plan_development'],['H0002','clinical_screening_review'],['90791','clinical_90791_intake_plan'],['H0023','clinical_h0023_full_packet'],['unknown','clinical_code_decider']])expect(resolveClinicalToolId({serviceCode:code})).toBe(tool);
  expect(resolveClinicalToolId({serviceCode:'H2014',programId:9})).toBe('clinical_h2014_group');expect(resolveClinicalToolId({serviceCode:'H2014'})).toBe('clinical_h2014_individual');
 });
 it('includes psychotherapy owner examples for a fresh manual note with no saved tool id',async()=>{
  const result=await loadNarrivaGuidanceContext({...source(),meta:{writerMode:'manual'},service:{code:'90837'}});
  expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({query:'90837',folders:expect.arrayContaining(['shared','psychotherapy','owner_guides'])}));
  expect(result.guidance).toContain(getNoteAidToolById('clinical_psychotherapy_note').systemPrompt);
  expect(result.guidance).toContain('Approved example');
 });
 it('retains psychotherapy service examples with Smart Notes instead of falling back to generic code-decider support',async()=>{
  const result=await loadNarrivaGuidanceContext({...source(),meta:{writerMode:'smart_notes',toolId:'clinical_cs_note_build'},service:{code:'90837'}});
  expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({folders:expect.arrayContaining(['shared','psychotherapy','owner_guides'])}));
  expect(result.guidance).toContain(getNoteAidToolById('clinical_cs_note_build').systemPrompt);
  expect(result.guidance).toContain('Service-specific authored reference (clinical_psychotherapy_note)');
  expect(result.guidance).toContain("retain the selected writer's section format");
 });
 it('adds the actual service folders to a guided H-code note without discarding the selected writer support',async()=>{
  await loadNarrivaGuidanceContext({...source(),meta:{writerMode:'smart_notes',toolId:'clinical_cs_note_build'},service:{code:'H0004'}});
  expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({folders:expect.arrayContaining(['shared','psychotherapy','H0004_note','owner_guides'])}));
 });
 it('routes pro bono guidance by its explicit clinical service when no tool metadata exists',async()=>{
  const result=await loadNarrivaGuidanceContext({...source(),meta:{writerMode:'manual',underlyingServiceCode:'H0004'},service:{code:'PRO-BONO SERVICE'}});
  expect(result.documentationCode).toBe('H0004');expect(result.reference.policyKind).toBe('funding');
  expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({query:'H0004',folders:expect.arrayContaining(['shared','H0004_note'])}));
  expect(result.guidance).toContain(getNoteAidToolById('clinical_h0004_note').systemPrompt);
 });
 it('applies selected and service-default overrides independently while preserving shared, custom and extra support',async()=>{
  m.agency.mockResolvedValue({feature_flags:{noteAidKbFolderOverrides:{clinical_cs_note_build:['shared','tenant_builder'],clinical_psychotherapy_note:['tenant_therapy']},noteAidKbExtraFolders:['owner_extra']}});
  m.custom.mockResolvedValue({enabled:1,kbFolders:['custom_examples']});
  await loadNarrivaGuidanceContext({...source(),meta:{toolId:'clinical_cs_note_build',aidId:'custom_9'},service:{code:'90837'}});
  const {folders}=m.knowledge.mock.calls[0][0];
  expect(folders).toEqual(expect.arrayContaining(['shared','tenant_builder','tenant_therapy','custom_examples','owner_extra']));
  expect(folders).not.toContain('psychotherapy');expect(new Set(folders).size).toBe(folders.length);
 });
 it('honors tenant-only overrides for both tools without forcing an unconfigured shared corpus',async()=>{
  m.agency.mockResolvedValue({feature_flags:{noteAidKbFolderOverrides:{clinical_cs_note_build:['tenant_builder'],clinical_psychotherapy_note:['tenant_therapy']},noteAidKbExtraFolders:['owner_extra']}});
  m.custom.mockResolvedValue({enabled:1,kbFolders:['custom_examples']});
  await loadNarrivaGuidanceContext({...source(),meta:{toolId:'clinical_cs_note_build',aidId:'custom_9'},service:{code:'90837'}});
  const {folders}=m.knowledge.mock.calls[0][0];
  expect(folders).toEqual(['tenant_builder','tenant_therapy','owner_extra','custom_examples']);
  expect(folders).not.toContain('shared');expect(folders).not.toContain('psychotherapy');
 });
 it('injects the actual manual definition, documentation and source page instead of only a code label',async()=>{
  const result=await loadNarrivaGuidanceContext({...source(),service:{code:'90837'}});
  expect(result.requiredReferenceComplete).toBe(true);expect(result.reference.source.pages).toEqual([16]);
  expect(result.guidance).toContain(result.reference.serviceDescription);expect(result.guidance).toContain(result.reference.documentation);
  expect(result.guidance).toContain('Manual introduction, page 4');expect(result.guidance).toContain('Approved example');
  expect(result.supportCoverageComplete).toBe(true);expect(result.guidanceHash).toMatch(/^[a-f0-9]{64}$/);
 });
 it('preserves all configured service/shared/custom training and uses no patient narrative as a retrieval query',async()=>{
  m.custom.mockResolvedValue({enabled:1,system_prompt:'Owner custom system instructions',training_notes:'Owner training details',guidance:'Owner guided examples',kbFolders:['custom_examples']});
  const input=source();input.meta.aidId='custom_9';input.narrative='IDENTIFIER_CANARY';
  const result=await loadNarrivaGuidanceContext(input);
  expect(m.access).toHaveBeenCalledWith(2,7,9);
  expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({query:'H0004',folders:expect.arrayContaining(['shared','H0004_note','owner_guides','custom_examples'])}));
  expect(result.guidance).toContain('Owner custom system instructions');expect(result.guidance).toContain('Owner training details');expect(result.guidance).toContain('Owner guided examples');
  expect(result.guidance).not.toContain('IDENTIFIER_CANARY');
 });
 it('changes the evidence hash when approved examples or instructions change',async()=>{
  const before=await loadNarrivaGuidanceContext(source());m.knowledge.mockResolvedValue({text:'Updated approved owner example.',complete:true,documents:[{id:'opaque-guide',contentHash:'guide-v2'}],coverage:{complete:true}});
  expect((await loadNarrivaGuidanceContext(source())).guidanceHash).not.toBe(before.guidanceHash);
 });
 it.each([null,{text:'Partial guide',complete:false,coverage:{unreadable:1}},{text:'',complete:true}])('rejects unavailable or incomplete required supporting evidence before review (%j)',async value=>{
  m.knowledge.mockResolvedValue(value);await expect(loadNarrivaGuidanceContext(source())).rejects.toMatchObject({status:503,code:'NARRIVA_GUIDANCE_UNAVAILABLE'});
 });
 it('does not invent a manual definition for a code missing from the supplied PDF',async()=>{
  await expect(loadNarrivaGuidanceContext({...source(),service:{code:'97535'}})).rejects.toMatchObject({status:503,code:'NARRIVA_GUIDANCE_UNAVAILABLE'});expect(m.knowledge).not.toHaveBeenCalled();
 });
 it('uses a separately labeled owner timing policy for99051 without presenting it as a PDF page',()=>{
  const result=narrivaServiceReferenceContext({serviceCode:'99051'});expect(result.requiredReferenceComplete).toBe(true);
  expect(result.reference.source.kind).toBe('user_agency_policy');expect(result.reference.source.pages).toEqual([]);expect(result.prompt).toContain('not a manual entry');
 });
 it('checks the actual underlying pro bono clinical definition and keeps funding separate',async()=>{
  const result=await loadNarrivaGuidanceContext({...source(),service:{code:'PRO-BONO SERVICE'},meta:{toolId:'clinical_h0004_note',underlyingServiceCode:'H0004'}});
  expect(result.documentationCode).toBe('H0004');expect(result.reference.policyKind).toBe('funding');expect(result.clinicalReference.code).toBe('H0004');
  expect(result.guidance).toContain('no charge to the client');expect(result.guidance).toContain(result.clinicalReference.serviceDescription);
 });
 it('does not infer pro bono clinical service from duration or authoring-tool name',async()=>{
  await expect(loadNarrivaGuidanceContext({...source(),service:{code:'PRO-BONO SERVICE'},encounter:{durationMinutes:60}})).rejects.toMatchObject({code:'NARRIVA_GUIDANCE_UNAVAILABLE'});
 });
 it('rejects a removed/unauthorized custom training source instead of silently using base defaults',async()=>{
  const input=source();input.meta.aidId='custom_9';m.custom.mockResolvedValue({enabled:1});m.access.mockResolvedValue(false);
  await expect(loadNarrivaGuidanceContext(input)).rejects.toMatchObject({status:503});expect(m.knowledge).not.toHaveBeenCalled();
 });
});
