import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { trainingDefinitionsFor, requiredTrainingKeys, trainingMatchesEdition, gradeDocumentQuiz } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'crisis-response-guide';
const book = slug => { const s = referenceSource({slug},key); return {metadata:referenceMetadata(s),sections:s.sections,version:{id:90,version_number:1,is_draft:0}}; };
describe('crisis guide integration and response boundaries',()=>{
  it.each(['itsco','nlu','tisi'])('%s has a complete linked edition and source-matched quiz',slug=>{
    const b=book(slug), d=trainingDefinitionsFor({slug}).find(d=>d.documentKey===key);
    expect(b.metadata).toMatchObject({documentKey:key,learningPurpose:'orientation',crisis:{jurisdiction:'Colorado'}});
    expect(b.sections).toHaveLength(20);
    expect(referenceCatalogFor({slug}).filter(d=>d.key===key)).toHaveLength(1);
    expect(trainingDefinitionsFor({slug}).filter(d=>d.documentKey===key)).toHaveLength(1);
    expect(trainingMatchesEdition(d,b)).toBe(true);expect(d.questions).toHaveLength(8);
    expect(gradeDocumentQuiz(d,d.questions.map(q=>q.correctAnswer))).toMatchObject({passed:true,score:100});
    for(const s of b.sections)for(const m of s.body_html.matchAll(/href="#crisis-response-guide-([^"]+)"/g))expect(b.sections.some(s=>s.slug===m[1])).toBe(true);
    const changed=structuredClone(b);changed.sections.find(s=>s.slug==='company-response-context').body_html+='<p>Changed setting.</p>';
    expect(trainingMatchesEdition(d,changed)).toBe(false);
    expect(JSON.stringify(b.sections)).not.toMatch(/Thriveworks|TherapyNotes|Patrick|\bSara\b|google drive/i);
  });
  it.each(['provider','facilitator','intern','staff','support','admin','supervisor'])('includes %s in assigned onboarding orientation',role=>{
    expect(requiredTrainingKeys({slug:'itsco'},{role,sees_clients:false},false)).toContain(key);
  });
  it.each(['client','guardian','school_staff'])('does not assign staff response orientation to %s',role=>expect(requiredTrainingKeys({slug:'itsco'},{role})).not.toContain(key));
  it('keeps school/Denver context in ITSCO and excludes unknown tenants',()=>{
    expect(book('itsco').sections.find(s=>s.slug==='company-response-context').body_html).toContain('school emergency');
    for(const slug of ['nlu','tisi'])expect(JSON.stringify(book(slug).sections)).not.toMatch(/school-based|school emergency|Denver/);
    expect(referenceSource({slug:'other',name:'ITSCO'},key,{packageAssigned:true})).toBeNull();
  });
  it('replaces unsafe legacy decision gates and preserves reporting exceptions',()=>{
    const sections=Object.fromEntries(book('itsco').sections.map(s=>[s.slug,s.body_html]));
    expect(sections['safety-planning']).toContain('not a substitute for assessment');
    expect(sections['suicide-risk']).toContain('does not establish safety');
    expect(sections['reporting-children']).toContain('no later than 24 hours');
    expect(sections['reporting-children']).toContain('existing referral number');
    expect(sections['reporting-adults']).toContain('APS-only referral is not a substitute');
    expect(sections['reporting-adults']).toContain('exception when the reporter knows');
    expect(sections['evaluation-and-transport']).toContain('does not itself satisfy');
    expect(sections['billing-and-work-time']).toContain('Do not automatically convert');
    expect(sections['remote-emergency']).toContain('current physical location');
    expect(sections['remote-emergency']).toContain('Do not let');
  });
});
describe('crisis guide Q&A (synthetic sources only)',()=>{
  const result=data=>({text:JSON.stringify(data),finishReason:'STOP'});
  it('reserves immediate response, scope and planning context even for a narrow routed question',async()=>{
    const model=vi.fn().mockResolvedValueOnce(result({slugs:['documentation']})).mockResolvedValueOnce(result({status:'answered',paragraphs:[{text:'Document the clinical assessment, actions, handoff and follow-up in the authorized client record.',citations:[{slug:'documentation',passageId:'p1'}]}]})).mockResolvedValueOnce(result({supported:true}));
    const answer=await answerFromHandbook({handbook:book('itsco'),question:'What must we document after a response?'},{model});
    const call=model.mock.calls[1][0];
    expect(call.systemInstruction).toContain('not a clinical triage service');
    expect(call.systemInstruction).toContain('Never assess a particular person');
    expect(call.systemInstruction).toContain('do not request identifying client details');
    expect(JSON.parse(call.prompt).sources.map(s=>s.slug)).toEqual(expect.arrayContaining(['immediate-response','preparation-and-roles','company-response-context','safety-planning']));
    expect(answer.paragraphs[0].citations[0].slug).toBe('documentation');
  });
  it('does not suggest People Operations or unsupported instructions when no policy is found',async()=>{
    const model=vi.fn().mockResolvedValue(result({slugs:[]}));
    const answer=await answerFromHandbook({handbook:book('nlu'),question:'What is the current hospital occupancy?'},{model});
    expect(answer.status).toBe('not_found');expect(answer.message).toContain('clinical lead');expect(answer.message).not.toContain('People Operations');
  });
});

describe('safety-plan workflow integration',()=>{
 it.each(['itsco','nlu','tisi'])('links %s to protected blank forms and keeps SAFE-T in clinician guidance',slug=>{const b=book(slug),plan=b.sections.find(s=>s.slug==='safety-planning'),assessment=b.sections.find(s=>s.slug==='suicide-risk');expect(plan.body_html).toContain('/clinical-forms?form=safety-plan');expect(plan.body_html).toContain('unlinked private draft');expect(plan.body_html).toContain('earlier signatures remain');expect(assessment.body_html).toContain('samhsa.gov');expect(assessment.body_html).toContain('does not expand anyone’s scope');expect(plan.body_html).not.toContain('clientId=');});
});
