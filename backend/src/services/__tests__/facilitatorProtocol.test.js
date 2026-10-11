import { describe, it, expect, vi } from 'vitest';
import { referenceSource, referenceMetadata, referenceCatalogFor } from '../companyReferenceContent.js';
import { needsFacilitatorProtocol, requiredTrainingKeys, trainingDefinitionsFor, trainingMatchesEdition, gradeDocumentQuiz } from '../documentTrainingContent.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
const key = 'facilitator-coding-protocol';
const book = slug => { const s=referenceSource({slug},key); return {metadata:referenceMetadata(s),sections:s.sections,version:{id:99,version_number:1,is_draft:0}}; };
describe('facilitator protocol audience',()=>{
  it.each([
    {role:'facilitator'}, {role:'provider',credential:'BA'}, {role:'provider_plus',credential:'B.S.'},
    {role:'provider',credential:'Unlicensed bachelor’s level'}, {role:'staff',sees_clients:1,credential:'Bachelor of Psychology'},
    {role:'provider',title:'Mental Health Facilitator'}, {role:'admin',agency_role:'facilitator'},
    {role:'provider',agency_position:'Facilitator'}
  ])('requires it for the assigned bachelor/facilitator profile %j',user=>{
    expect(needsFacilitatorProtocol(user)).toBe(true);
    for(const slug of ['itsco','nlu','tisi'])expect(requiredTrainingKeys({slug},user,false)).toContain(key);
  });
  it.each([
    {role:'provider',credential:'LPC, BA'}, {role:'provider',credential:'B.S., MSW'},
    {role:'provider',credential:'Unlicensed Master’s'}, {role:'intern',credential:'BA'},
    {role:'provider',credential:'QBHA'}, {role:'provider'}, {role:'staff',sees_clients:0,credential:'BA'},
    {role:'client',title:'Facilitator'}, {role:'facilitator',agency_role:'tutor',credential:'BA'},
    {role:'facilitator',agency_role:'staff',agency_position:'Operations',sees_clients:0},
    {role:'admin',credential:'BA'}, {role:'provider',agency_role:'intern_plus',credential:'BA'}
  ])('does not require it for a different or unclassified profile %j',user=>expect(needsFacilitatorProtocol(user)).toBe(false));
});
describe('distinct protocol and company editions',()=>{
  it.each(['itsco','nlu','tisi'])('%s has one registered book and a source-matched quiz',slug=>{
    const b=book(slug), d=trainingDefinitionsFor({slug}).find(d=>d.documentKey===key);
    expect(b.sections).toHaveLength(16);expect(d.onboardingAudience).toBe('facilitator');
    expect(referenceCatalogFor({slug}).filter(d=>d.key===key)).toHaveLength(1);
    expect(trainingMatchesEdition(d,b)).toBe(true);
    expect(gradeDocumentQuiz(d,d.questions.map(q=>q.correctAnswer))).toMatchObject({passed:true,score:100});
    const changed=structuredClone(b);changed.sections.find(s=>s.slug==='company-service-boundaries').body_html+='<p>Different program.</p>';
    expect(trainingMatchesEdition(d,changed)).toBe(false);
    for(const s of b.sections)for(const m of s.body_html.matchAll(/href="#facilitator-coding-protocol-([^"]+)"/g))expect(b.sections.some(s=>s.slug===m[1])).toBe(true);
    const provider=referenceSource({slug},'provider-guide');
    expect(provider.sections.find(s=>s.slug==='6-relationship-to-other-documents').body_html).toContain(`companyDocument=${key}`);
    const providerBodies=new Set(provider.sections.map(s=>s.body_html));
    expect(b.sections.filter(s=>providerBodies.has(s.body_html))).toEqual([]);
    expect(JSON.stringify(b.sections)).not.toMatch(/TherapyNotes|Google Form|No prior authorization needed|75% of the applicable hourly rate/);
  });
  it('preserves current pay, scope and company boundaries',()=>{
    const sections=Object.fromEntries(book('itsco').sections.map(s=>[s.slug,s.body_html]));
    expect(sections['compensation-and-work-time']).toContain('does not erase compensation for compensable work');
    expect(sections['indirect-and-assigned-work']).toContain('unless the Compensation Schedule specifies another allowance');
    expect(sections['shared-services']).toContain('no automatic 75% pay default');
    expect(sections['code-reference']).toContain('Not permitted for the agency’s bachelor’s-level facilitator pathway');
    expect(sections['company-service-boundaries']).toContain('moratorium');
    const nlu=book('nlu').sections.find(s=>s.slug==='company-service-boundaries').body_html;
    expect(nlu).toContain('two or more attending');expect(nlu).toContain('nonoverlapping');expect(nlu).toContain('or reschedule');
    expect(book('tisi').sections.find(s=>s.slug==='company-service-boundaries').body_html).toContain('counseling-only');
    expect(referenceSource({slug:'unknown',name:'ITSCO'},key,{packageAssigned:true})).toBeNull();
  });
});
describe('facilitator Q&A context and source links (local model fixtures)',()=>{
  const result=data=>({text:JSON.stringify(data),finishReason:'STOP'});
  it('includes role, company and compensation exceptions even when the router selects only a code',async()=>{
    const model=vi.fn().mockResolvedValueOnce(result({slugs:['h0004']})).mockResolvedValueOnce(result({status:'answered',paragraphs:[{text:'H0004 is tied to assessed needs and an approved plan; its availability does not confer independent psychotherapy authority.',citations:[{slug:'h0004',passageId:'p1'}]}]})).mockResolvedValueOnce(result({supported:true}));
    const answer=await answerFromHandbook({handbook:book('nlu'),question:'May a facilitator use H0004?'},{model});
    const call=model.mock.calls[1][0];
    expect(call.systemInstruction).toContain('never approve an individual claim');
    expect(JSON.parse(call.prompt).sources.map(s=>s.slug)).toEqual(expect.arrayContaining(['facilitator-scope','company-service-boundaries','before-the-service','compensation-and-work-time','indirect-and-assigned-work']));
    expect(answer.paragraphs[0].citations[0]).toMatchObject({slug:'h0004',quote:expect.stringContaining('H0004')});
  });
  it('does not answer personal claim questions from general code references',async()=>{
    const model=vi.fn().mockResolvedValue(result({slugs:[],reason:'personal_record'}));
    const answer=await answerFromHandbook({handbook:book('itsco'),question:'Is my claim payable?'},{model});
    expect(answer.status).toBe('not_found');expect(answer.message).toContain('billing or payroll team');
  });
});
