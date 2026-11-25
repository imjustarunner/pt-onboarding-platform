import { describe, expect, it, vi } from 'vitest';
vi.mock('../clientChartArtifacts.service.js',()=>({loadIntakeSubmissionsForClient:vi.fn()}));
vi.mock('../../models/IntakeLink.model.js',()=>({default:{findById:vi.fn()}}));
import { buildClinicalIntakeSourceContext, intakeAssessmentResponses } from '../noteAidIntakeSources.service.js';
import { intakeAgeInstruction, applyIntakeIdentifyingAge } from '../noteAidAge.service.js';
vi.mock('../../models/ClientIntakeNoteDraft.model.js',()=>({default:{listForClient:vi.fn()}}));
import ClientIntakeNoteDraft from '../../models/ClientIntakeNoteDraft.model.js';
import { loadIntakeSubmissionsForClient } from '../clientChartArtifacts.service.js';
import { clinicalRowsFromCompletedIntake } from '../intakeClinicalSourcePresentation.js';
const phq = values=>Object.fromEntries(values.map((value,index)=>[`phq9_${index+1}`,value]));
describe('enrollment and assessment source context',()=>{
 it('calculates PHQ-9 from nine validated items and ignores supplied totals, IDs and free text',()=>{
  const result=intakeAssessmentResponses({clinicalResponses:{...phq([0,1,2,1,0,1,1,0,0]),phq9_total:99,phq9_comment:'Patient name',phq9_id:123}})[0];
  expect(result).toMatchObject({instrumentKey:'phq9',total:6,complete:true,selfHarmItem:0});expect(result.items).toHaveLength(9);expect(result.text).not.toContain('Patient name');
 });
 it('does not zero-fill missing, blank, invalid or declined answers',()=>{
  const result=intakeAssessmentResponses({clinicalResponses:phq([1,2,'',false,8,null])})[0];
  expect(result).toMatchObject({complete:false,total:null,selfHarmItem:null});
  expect(result.text).toContain('2 of 9 items answered');
  expect(intakeAssessmentResponses({clinicalResponses:{...phq(Array(9).fill(0)),skip_phq9:true}})).toEqual([]);
 });
 it('preserves positive item 9 independently of the total',()=>{
  const result=intakeAssessmentResponses({responses:{clients:[{clinicalResponses:phq([0,0,0,0,0,0,0,0,1])}]}})[0];
  expect(result).toMatchObject({total:1,selfHarmItem:1});
 });
 it('uses completed same-workspace records, readable form labels and the latest complete source without mixing administrations',async()=>{
  const loadSubmissions=vi.fn(async()=>[
   {id:3,status:'started',intake_link_id:3,intake_data:{}},
   {id:2,status:'submitted',intake_link_id:2,intake_data:{clinicalResponses:phq([1,1])}},
   {id:1,status:'submitted',intake_link_id:1,intake_data:{clinicalResponses:phq(Array(9).fill(3))}}
  ]);
  const result=await buildClinicalIntakeSourceContext({agencyId:2,clientId:10},{loadSubmissions,findLink:async()=>({organization_id:2}),buildRecord:({submission})=>({sections:[{title:'Clinical interview',rows:[{label:'Presenting concerns',value:`Reported history ${submission.id}`},{label:'Full name of client',value:'Do not transmit this identity'}]}]})});
  expect(loadSubmissions).toHaveBeenCalledWith(10,{agencyId:2,completedOnly:true});
  expect(result.instruments[0]).toMatchObject({total:null,complete:false,sourceRef:'intake:2'});
  expect(result.contextText).toContain('Reported history 2');expect(result.contextText).not.toContain('Do not transmit this identity');expect(result.contextText).toContain('Reported history 1');expect(result.manualSections['Presenting Problem']).toContain('Earlier enrollment 2');
  expect(result.sources.map(source=>source.submissionId)).toEqual([2,1]);
 });
 it('uses the latest finalized imported intake as the historical source when enrollment is absent',async()=>{
  const record=(id,status,text)=>({id,status,finalized_at:`2026-11-${String(id).padStart(2,'0')}`,
    session_context_enc:JSON.stringify({source:'client_records_import'}),
    note_sections_json_enc:JSON.stringify([{label:'Legal History',body:text}])});
  ClientIntakeNoteDraft.listForClient.mockResolvedValue([record(24,'draft','Unreviewed working content'),record(21,'final','Most recent verified history.'),record(18,'final','Superseded history')]);
  loadIntakeSubmissionsForClient.mockResolvedValue([]);
  const result=await buildClinicalIntakeSourceContext({agencyId:2,clientId:10});
  expect(ClientIntakeNoteDraft.listForClient).toHaveBeenCalledWith({agencyId:2,clientId:10});
  expect(result.manualSections['Legal History']).toBe('Most recent verified history.');
  expect(result.contextText).toContain('Prior finalized imported clinical assessment');
  expect(result.contextText).not.toMatch(/Unreviewed working content|Superseded history/);
 });
 it('rejects an enrollment link from another agency and includes no unreviewed draft',async()=>{
  const result=await buildClinicalIntakeSourceContext({agencyId:2,clientId:10},{loadSubmissions:async()=>[{id:1,status:'submitted',intake_link_id:1,intake_data:{}}],findLink:async()=>({organization_id:99}),buildRecord:()=>{throw Error('Must not read foreign source');}});
  expect(result.sources).toEqual([]);expect(result.contextText).toContain('No completed enrollment');
 });
 it('retains clinical answers while removing administrative sections and identity fields',()=>{
  expect(clinicalRowsFromCompletedIntake({sections:[{title:'Who this packet is for',rows:[{label:'Name',value:'Secret'}]},{title:'History',rows:[{label:'Current medication name',value:'Source medication'},{label:'Phone',value:'555-0100'}]}]})).toEqual([{section:'History',question:'Current medication name',answer:'Source medication'}]);
 });
 it('normalizes only the explicitly defined legacy PSC scale before calculating a total',()=>{
  const responses=Object.fromEntries(Array.from({length:17},(_,index)=>[`psc_${index+1}`,1]));
  const result=intakeAssessmentResponses({clinicalResponses:responses},{intake_fields:[{key:'psc_1',options:[{value:'1',label:'Never'},{value:'2',label:'Sometimes'},{value:'3',label:'Often'}]}]})[0];
  expect(result).toMatchObject({complete:true,total:0});
 });

 it('keeps exact advanced ages local while using a 90-or-older age band in the model instruction',()=>{
  expect(intakeAgeInstruction(94)).toContain('90 or older');expect(intakeAgeInstruction(94)).not.toContain('94 years');
  expect(applyIntakeIdentifyingAge({Identification:'Client presented for evaluation.'},94).Identification).toContain('94 years');
 });

 it('carries a completed enrollment interview and screener through the real question renderer',async()=>{
  const responses={presenting_concern:'Synthetic difficulty completing schoolwork.',family_history:'Synthetic caregiver reports ongoing behavioral concerns.',client_first:'IDENTITY_EXCLUDED'};
  for(let item=1;item<=9;item++)responses['phq9_'+item]=item===9?0:1;
  const link={organization_id:2,intake_steps:[{type:'clinical_questions',label:'Clinical interview',fields:[
    {key:'presenting_concern',label:'Presenting concern',type:'text'},
    {key:'family_history',label:'Family history',type:'text'},
    {key:'client_first',label:'First name',type:'text'},
    ...Array.from({length:9},(_,i)=>({key:'phq9_'+(i+1),label:'PHQ-9 item '+(i+1),type:'select',instrument:'phq9'}))
  ]}]};
  const result=await buildClinicalIntakeSourceContext({agencyId:2,clientId:10},{
    loadSubmissions:async()=>[{id:7,status:'submitted',intake_link_id:6,intake_data:{responses:{submission:{clinicalResponses:responses}}}}],
    findLink:async()=>link
  });
  expect(result.contextText).toContain(responses.presenting_concern);
  expect(result.contextText).toContain(responses.family_history);
  expect(result.contextText).not.toContain('IDENTITY_EXCLUDED');
  expect(result.sources[0].questionCount).toBeGreaterThanOrEqual(2);
  expect(result.instruments[0]).toMatchObject({instrumentKey:'phq9',complete:true,total:8});
 });

});
