import { describe, expect, it } from 'vitest';
import {
  NARRIVA_CHECKS, NARRIVA_QUALITY_CRITERIA, deriveNarrivaScoring,
  pendingNarrivaScoring, bypassNarrivaFinding
} from '../narrivaReviewPolicy.service.js';

const quotes={
 intervention_specificity:'Provider modeled paced breathing and practiced two rounds with Client.',
 clinical_rationale:'Paced breathing addressed the panic symptoms interfering with school attendance.',
 response_specificity:'Client reported less tension after practicing the breathing exercise.',
 progress_detail:'Client completed the second round without prompts after needing three prompts initially.',
 goal_linkage:'This practiced the existing coping goal of using one skill during school transitions.',
 follow_up_specificity:'Client will practice the same breathing skill before the next school transition.',
 assessment_integration:'The documented assessment showed increased avoidance, which informed the coping practice.'
};
const narrative=Object.values(quotes).join(' ');
const checks=()=>NARRIVA_CHECKS.map(([id,label])=>({id,label,status:'passed',findings:[]}));
const evidence=()=>Object.fromEntries(NARRIVA_QUALITY_CRITERIA.map(c=>[c.id,{supported:true,evidence:[quotes[c.id]]}]));
const score=(input={})=>deriveNarrivaScoring({qualityEvidence:evidence(),assessmentMentioned:true,narrative,checks:checks(),reviewStatus:'passed',...input});

describe('server-computed evidence quality scoring',()=>{
 it('scores distinct clinical quality evidence independently from the five mandatory checks',()=>{
  const result=score();
  expect(result).toMatchObject({score:100,threshold:70,passed:true,qualityPassed:true,mandatoryPassed:true,earned:100,possible:100});
  expect(result.criteria).toHaveLength(7);expect(result.criteria.every(c=>c.status==='met'&&c.evidence.length===1)).toBe(true);
  expect(result.explanation).toContain('100 of 100');expect(result.disclaimer).toMatch(/not a guarantee.*payer approval/);
 });
 it('passes exactly 70 applicable points while reporting the remaining missing quality details',()=>{
  const qualityEvidence=evidence();qualityEvidence.goal_linkage.supported=null;qualityEvidence.follow_up_specificity.supported=false;
  const result=score({qualityEvidence});
  expect(result).toMatchObject({score:70,earned:70,possible:100,qualityPassed:true,passed:true});
  expect(result.missingCriteria).toEqual(['goal_linkage','follow_up_specificity']);
 });
 it('requires 70 percent rather than rounding a lower applicable ratio upward',()=>{
  const qualityEvidence=evidence();qualityEvidence.goal_linkage.supported=false;qualityEvidence.follow_up_specificity.supported=false;
  const result=score({qualityEvidence,assessmentMentioned:false});
  expect(result).toMatchObject({earned:65,possible:95,score:68,qualityPassed:false,passed:false});
  expect(result.criteria.find(c=>c.id==='assessment_integration')).toMatchObject({earned:0,possible:0,status:'not_applicable'});
  expect(result.findings).toEqual([expect.objectContaining({id:'scoring:threshold',canBypass:true})]);
 });
 it('excludes only an explicitly unreferenced assessment without awarding free points',()=>{
  const qualityEvidence=evidence();qualityEvidence.assessment_integration={supported:null,evidence:[]};
  expect(score({qualityEvidence,assessmentMentioned:false})).toMatchObject({earned:95,possible:95,score:100});
  for(const assessmentMentioned of [null,undefined,true])expect(score({qualityEvidence,assessmentMentioned})).toMatchObject({earned:95,possible:100,score:95});
  expect(score({assessmentMentioned:null})).toMatchObject({earned:95,possible:100,score:95});
 });
 it('does not accept a model or client raw score, weights or unknown criteria',()=>{
  const qualityEvidence={score:100,threshold:0,earned:999,possible:1,custom:{supported:true,evidence:[narrative]}};
  const result=score({qualityEvidence,score:100,threshold:0});
  expect(result).toMatchObject({score:0,threshold:70,earned:0,possible:100,passed:false});
  expect(result.criteria.every(c=>c.status==='missing')).toBe(true);
 });
 it.each([null,false,'true',1])('does not earn evidence for a non-true supported flag (%s)',supported=>{
  const qualityEvidence=Object.fromEntries(Object.entries(evidence()).map(([id,item])=>[id,{...item,supported}]));
  expect(score({qualityEvidence})).toMatchObject({score:0,earned:0,passed:false});
 });
 it.each([
  'This authored example is not in the saved note.',
  'Only Session Narrative input contains this detail.',
  quotes.intervention_specificity.toUpperCase(),
  quotes.intervention_specificity.replace('paced breathing','paced  breathing'),
  'Client'
 ])('rejects unsupported, altered or insufficient quote evidence (%s)',quote=>{
  const qualityEvidence=Object.fromEntries(NARRIVA_QUALITY_CRITERIA.map(c=>[c.id,{supported:true,evidence:[quote]}]));
  expect(score({qualityEvidence})).toMatchObject({score:0,earned:0,passed:false});
 });
 it('does not award extra points for duplicate evidence or forged possible weights',()=>{
  const qualityEvidence=evidence();qualityEvidence.intervention_specificity.evidence=[quotes.intervention_specificity,quotes.intervention_specificity];qualityEvidence.intervention_specificity.points=1000;
  const result=score({qualityEvidence});
  expect(result.criteria[0]).toMatchObject({earned:20,possible:20,evidence:[quotes.intervention_specificity]});expect(result.score).toBe(100);
 });
 it.each(['risk_safety','service_code','encounter_consent','necessity_interventions','participation_plan'])('never lets 100 percent compensate for mandatory %s',id=>{
  const mandatory=checks();mandatory.find(c=>c.id===id).status='action_required';mandatory.find(c=>c.id===id).findings=[{id:id+':required'}];
  expect(score({checks:mandatory,reviewStatus:'action_required'})).toMatchObject({score:100,qualityPassed:true,mandatoryPassed:false,passed:false});
 });
 it.each(['bypassed','stale','unavailable','running'])('never verifies an overall %s review even with all quality evidence',reviewStatus=>{
  expect(score({reviewStatus})).toMatchObject({score:100,qualityPassed:true,passed:false});
 });
 it('requires every mandatory check exactly once rather than counting five passed rows',()=>{
  const mandatory=checks();mandatory[4]={...mandatory[0]};
  expect(score({checks:mandatory})).toMatchObject({mandatoryPassed:false,passed:false});
 });
 it('keeps a quality bypass explicit without raising its score or granting verification',()=>{
  const qualityEvidence=evidence();qualityEvidence.goal_linkage.supported=false;qualityEvidence.follow_up_specificity.supported=false;qualityEvidence.assessment_integration.supported=false;
  const scoring=score({qualityEvidence});
  const result=bypassNarrivaFinding({checks:checks(),status:'action_required',scoring,quickSignEligible:true},'scoring:threshold','Reviewed the authored note and kept its wording.',9);
  expect(result).toMatchObject({status:'bypassed',quickSignEligible:false,scoring:{score:65,passed:false},qualityBypass:{bypassedBy:9}});
  expect(result.scoring.findings[0]).toMatchObject({bypassed:true,bypassedBy:9});
  expect(score({qualityEvidence,qualityBypass:result.qualityBypass,reviewStatus:result.status}).passed).toBe(false);
 });
 it('starts with no numerical score and no quality bypass action before evidence is inspected',()=>{
  expect(pendingNarrivaScoring()).toMatchObject({score:null,passed:false,mandatoryPassed:false,findings:[]});
 });
});
