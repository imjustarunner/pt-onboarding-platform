import { describe, expect, it } from 'vitest';
import { screeningResponseBags, screeningSourceFields, screeningSourceKind } from '../h0002SourceEvidence.js';
import { parsePscScore, scorePsc17, validateScreeningReview } from '../h0002ScreeningRules.js';
import { applyScreeningTranscription } from '../h0002ReviewDetails.js';

describe('screening source evidence', () => {
  it('recovers all office dependent answers from questionnaire definitions hydrated by the public form', () => {
    const link = { scope_type: 'agency', form_type: 'intake', intake_steps: [{type:'clinical_questions',fields:[]}] };
    const fields = screeningSourceFields(link);
    const byKey = new Map(fields.map(f => [f.key,f]));
    const answers = Object.fromEntries(Array.from({length:17},(_,i)=>[`psc_${i+1}`,String(i%3)]));
    const bag = screeningResponseBags({responses:{clients:[answers]}})[0];
    const score = scorePsc17(Object.keys(answers).map(key=>({key,score:parsePscScore(bag[key],byKey.get(key))})),byKey);
    expect(score).toMatchObject({complete:true,answered:17});
    expect(Object.values(score.subscales).every(s=>s.score!==null)).toBe(true);
  });
  it('preserves custom 1/2/3 school encoding instead of overwriting it with office defaults', () => {
    const fields = screeningSourceFields({scope_type:'school',intake_steps:[{fields:[{key:'psc_1',label:'Fidgety',options:[{value:'1',label:'Never'},{value:'2',label:'Sometimes'},{value:'3',label:'Often'}]}]}]});
    expect(parsePscScore('1',fields[0])).toBe(0);
    expect(parsePscScore('1')).toBeNull();
  });
  it('keeps client answers scoped and reads legacy flat submission bags', () => {
    const bags=screeningResponseBags({submission:{clinicalResponses:{reason:'Seeking help'}},clients:[{psc_1:'Often'},{psc_1:'Never'}]},1);
    expect(bags[0].psc_1).toBe('Never');expect(bags[3].reason).toBe('Seeking help');
  });
  it('excludes an ROI on an ordinary intake link even with privacy and safety acknowledgements', () => {
    const source=screeningSourceKind({form_type:'intake'},{smartSchoolRoi:{signed:true},responses:{submission:{hipaa_safety_ack:'yes'}}});
    expect(source).toEqual({roiOnly:true,hasClinicalResponses:false});
    expect(()=>validateScreeningReview({}, {...source,psc:{complete:true,subscales:{}}})).toThrow('Release of Information');
  });
  it('retains a full packet that includes both ROI and screening answers', () => {
    expect(screeningSourceKind({form_type:'intake'},{smartSchoolRoi:{signed:true},responses:{clients:[{psc_1:'0'}]}})).toEqual({roiOnly:false,hasClinicalResponses:true});
    expect(screeningSourceKind({form_type:'intake'},{responses:{submission:{hipaa_notice:true}}}).hasClinicalResponses).toBe(false);
  });
  it('calculates paper scores from actual entries and keeps omitted answers blank', () => {
    const fields=screeningSourceFields({scope_type:'agency',intake_steps:[]}).filter(f=>/^psc_/.test(f.key));
    const source={sourceHash:'v1',pscItems:fields,clinicalFields:[]};
    const input={sourceHash:'v1',paperTranscription:true,paperResponses:Object.fromEntries(fields.slice(0,16).map(f=>[f.key,0]))};
    expect(applyScreeningTranscription(source,input).psc).toMatchObject({answered:16,complete:false,total:null});
  });
});
