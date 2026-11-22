import { describe, it, expect } from 'vitest';
import { applyScreenerReference } from '../safetyPlans/guideReference.js';
import { getOutcomeMeasure, outcomeMeasures, measureRights } from '../../data/outcomeMeasures.js';
import { scoreOutcomeMeasure, measureItemVisible } from '../outcomeMeasureScoring.js';
const score = (id, answers) => scoreOutcomeMeasure(getOutcomeMeasure(id), answers);
const repeated = (count, value) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`q${i+1}`, String(value)]));
describe('reviewed instrument catalog', () => {
  it('enables exactly the reviewed instruments, with attributed versioned sources', () => {
    expect(measureRights).toHaveLength(44); expect(outcomeMeasures).toHaveLength(24);
    expect(new Set(outcomeMeasures.map(m => m.id)).size).toBe(24);
    expect(outcomeMeasures.map(m => m.id).sort()).toEqual(['phq-9','phq-a','gad-7','pcl-5','lec-5','des-b','aware','cage-aid','ftnd','taps','scared','scared-parent','nichq-vanderbilt-assessment-scale-parent-informant-vadrs','vanderbilt-parent-follow-up','asrs','rses','phq','phq-2','phq-4','phq-8','gad-2','phq-9-parent','phq-9-modified-teens','phq-9-adolescent'].sort());
    for (const m of outcomeMeasures) { expect(m.rights.status).toBe('enabled'); expect(m.rights.rightsUrl).toMatch(/^https:/); expect(m.version).toMatch(/^[a-f0-9]{20}$/); expect(new Set(m.items.map(i => i.key)).size).toBe(m.items.length); }
  });
  it.each(['itsco','nlu','isi'])('links both SCARED reports in the %s guide', agency => {
    const guide = applyScreenerReference({ sections: [
      { slug: 'appendix-a', body_html: '<p>Outcome measures in the app</p>' },
      { slug: 'measure-scared', body_html: '<p>Commercial digital reuse needs clarification</p>' },
      { slug: 'measure-c-ssrs', body_html: '<p>Previous screener reference</p>' }
    ] }, agency);
    expect(guide.sections.find(s => s.slug === 'appendix-a').body_html).toContain('the two 41-item SCARED reports');
    expect(guide.sections.find(s => s.slug === 'measure-scared').body_html).toContain('/outcome-measures?measure=scared-parent');
    expect(guide.sections.find(s => s.slug === 'measure-scared').body_html).toContain('/outcome-measures?measure=scared"');
    expect(guide.sections.find(s => s.slug === 'measure-c-ssrs').body_html).toContain(`/${agency}/clinical-forms?form=cssrs-screener`);
  });
});
describe('symptom scoring and missing answers', () => {
  it.each([['phq-9',9,3,27],['gad-7',7,3,21],['pcl-5',20,4,80],['des-b',8,4,32],['cage-aid',4,1,4]])('%s scores complete lower and upper bounds', (id,n,max,total) => {
    expect(score(id,repeated(n,0)).result).toMatchObject({ total:0,complete:true });
    expect(score(id,repeated(n,max)).result).toMatchObject({ total,complete:true });
  });
  it.each(['scared', 'scared-parent'])('scores %s totals and domains and requires all 41 answers', id => {
    expect(score(id, repeated(41, 0)).result).toMatchObject({ total: 0, complete: true, flags: [] });
    expect(score(id, repeated(41, 2)).result).toMatchObject({ total: 82, complete: true,
      domains: { 'Panic / somatic symptoms': 26, 'Generalized anxiety': 18, 'Separation anxiety': 16, 'Social anxiety': 14, 'School avoidance': 8 } });
    expect(score(id, repeated(40, 0)).result).toMatchObject({ total: null, complete: false, missing: ['q41'], domains: {} });
    expect(getOutcomeMeasure(id).rights.attribution).toContain('University of Pittsburgh');
    const answers = { ...repeated(41, 0), q2: '2', q36: '1' };
    expect(score(id, answers).result.flags).toEqual([expect.objectContaining({ key: 'School avoidance', urgent: false })]);
    const threshold = { ...repeated(41, 0), ...repeated(12, 2), q13: '1' };
    expect(score(id, threshold).result.interpretation).toContain('Total reached the screening threshold of 25.');
    expect(score(id, { ...threshold, q13: '0' }).result.interpretation).toContain('Total is below');
  });
  it.each([[4,'Minimal'],[5,'Mild'],[9,'Mild'],[10,'Moderate'],[14,'Moderate'],[15,'Moderately severe'],[19,'Moderately severe'],[20,'Severe']])('PHQ-9 total %i is %s', (total,band) => {
    const answers = repeated(9,0); let left=total; for(let i=1;i<=9;i++){ answers[`q${i}`]=String(Math.min(left,3)); left=Math.max(0,left-3); }
    expect(score('phq-9',answers).result.band).toBe(band);
  });
  it('GAD-7 reaches severe at 15 and does not score its optional difficulty item', () => {
    expect(score('gad-7',{...repeated(7,0),...repeated(5,3),difficulty:'3'}).result).toMatchObject({total:15,band:'Severe'});
  });
  it('never replaces missing symptoms with zeros, including the safety item', () => {
    expect(score('phq-9',repeated(8,0)).result).toMatchObject({total:null,complete:false,missing:['q9']});
    expect(score('phq-9',{}).result.flags[0].key).toBe('safety_unanswered');
    expect(score('phq-9',{q9:'1'}).result).toMatchObject({total:null,flags:[expect.objectContaining({urgent:true,key:'safety_follow_up'})]});
    expect(score('phq-9',{...repeated(9,0),q9:'1'}).result).toMatchObject({total:1,band:'Minimal',flags:[expect.objectContaining({urgent:true})]});
  });
  it('scores PTSD clusters without declaring a diagnosis', () => {
    const r=score('pcl-5',repeated(20,4)).result;
    expect(r.domains).toEqual({Intrusion:20,Avoidance:8,'Mood and cognition':28,'Arousal and reactivity':24}); expect(r.band).toBeUndefined();
  });
  it('applies only the published DES-B missing-item rule', () => {
    expect(score('des-b',repeated(6,1)).result).toMatchObject({total:8,average:1,prorated:true,complete:false});
    expect(score('des-b',{...repeated(7,1),q1:'2'}).result).toMatchObject({total:9,average:1.125,prorated:true});
    expect(score('des-b',repeated(5,4)).result.total).toBeNull();
  });
  it('reverse scores all five AWARE items and refuses incomplete totals', () => {
    const low = repeated(28,1), high = repeated(28,7); for (const i of [8,14,20,24,26]) { low[`q${i}`]='7'; high[`q${i}`]='1'; }
    expect(score('aware',low).result.total).toBe(28); expect(score('aware',high).result.total).toBe(196);
    delete low.q28; expect(score('aware',low).result.total).toBeNull();
  });
  it('LEC records multiple event exposure types but never fabricates a total', () => {
    const a=Object.fromEntries(Array.from({length:17},(_,i)=>[`q${i+1}`,['5']])); a.q1=['0','1','3'];
    expect(score('lec-5',a).result).toMatchObject({complete:true,total:null});
    expect(()=>score('lec-5',{q1:['0','5']})).toThrow('cannot be combined');
  });
  it('FTND gates current cigarette smoking and preserves item weights', () => {
    expect(score('ftnd',{current_smoking:'0',...repeated(6,0)})).toMatchObject({answers:{current_smoking:'0'},result:{complete:true,total:null}});
    expect(score('ftnd',{current_smoking:'1',q1:'3',q2:'1',q3:'1',q4:'3',q5:'1',q6:'1'}).result.total).toBe(10);
    expect(score('ftnd',{current_smoking:'1',...repeated(6,0)}).result.total).toBe(0);
    expect(score('ftnd',{}).result).toMatchObject({complete:false,total:null});
  });
  it.each([{q1:4},{q1:true},{q1:'99'},{unknown:'1'},{q1:['0','0']}])('rejects invalid responses %j', answers => { expect(()=>score('phq-9',answers)).toThrow(); });
  it('bounds free text and rejects malformed payloads', () => { expect(()=>score('pcl-5',{worst_event:'x'.repeat(1501)})).toThrow(); expect(()=>score('pcl-5',[])).toThrow(); });
});
describe('TAPS branch-sensitive scoring', () => {
  const negative = {alcohol_branch:'female',alcohol_female:'0',tobacco:'0',drugs:'0',prescription:'0'};
  it('scores legitimate negative screens but not missing screens as zero', () => {
    expect(score('taps',negative).result).toMatchObject({complete:true,total:null,domains:{tobacco:0,alcohol:0,marijuana:0,opioids:0}});
    expect(score('taps',{}).result).toMatchObject({complete:false,domains:{alcohol:null,tobacco:null,heroin:null}});
  });
  it('scores all positive branches independently and captures other substances without a SUD threshold', () => {
    const a={alcohol_branch:'male',tobacco:'4',alcohol_male:'4',drugs:'4',prescription:'4'};
    for(const i of getOutcomeMeasure('taps').items) if(i.section?.startsWith('Part 2') && measureItemVisible(i,a)) a[i.key]=i.type==='text'?'Synthetic test substance':'1';
    expect(score('taps',a).result).toMatchObject({complete:true,total:null,domains:{tobacco:3,alcohol:4,marijuana:3,stimulants:3,heroin:3,opioids:3,sedatives:3,adhd:3,other:1}});
  });
  it('clears stale follow-ups and the unselected alcohol question set', () => {
    const {answers,result}=score('taps',{...negative,tobacco_0:'1',tobacco_1:'1',alcohol_male:'4',alcohol_binge_male:'1'});
    expect(answers).toEqual(negative); expect(result.domains.tobacco).toBe(0);
  });
  it('requires follow-up for positive parent screens and treats recent non-use as zero', () => {
    expect(score('taps',{...negative,tobacco:'1'}).result).toMatchObject({complete:false,domains:{tobacco:null}});
    expect(score('taps',{...negative,tobacco:'1',tobacco_0:'0'}).result).toMatchObject({complete:true,domains:{tobacco:0}});
  });
});
