import {describe,it,expect} from 'vitest';
import {CONTRACT_SERVICE_ROLES,inferContractServiceRoles,inferNluContractCategory,contractServiceRolePlan,applyContractServiceRoleClauses} from '../../content/contractServiceRoles.js';
import {jobContractExpectations,expectationsToTokens,expectationsFromTokens} from '../../utils/contractExpectations.js';
import {sanitizePrehireConfig} from '../../utils/prehireConfigSanitize.js';

describe('applied-job service clauses',()=>{
  it('selects childcare and testing from the applied job without granting psychotherapy',()=>{
    expect(inferContractServiceRoles({job:{title:'Childcare / Daycare Provider'},credential:'BA'}).roles).toEqual(['childcare']);
    expect(inferContractServiceRoles({job:{title:'Psychological Testing Technician'},credential:'BA'}).roles).toEqual(['psychological_testing']);
    expect(inferContractServiceRoles({job:{title:'Academic Tutor'},credential:'MA'}).roles).toEqual(['tutoring']);
  });
  it('differentiates bachelor support and master psychotherapy without using a pay category',()=>{
    expect(inferContractServiceRoles({job:{title:'School-Based Counselor'},credential:'BA'}).roles).toEqual(['bachelors_counseling']);
    expect(inferContractServiceRoles({job:{title:'School-Based Counselor'},credential:'MA, Unlicensed'}).roles).toEqual(['psychotherapy']);
    expect(inferContractServiceRoles({job:{title:'School-Based Counselor'},credential:''}).roles).toEqual([]);
    expect(inferContractServiceRoles({job:{title:'Therapy Plus Tutoring Facilitator'},credential:'BA'}).roles).toEqual(['tutoring','bachelors_counseling']);
  });
  it('preserves explicit posting choices, including intentionally selecting no role',()=>{
    const job={title:'Psychotherapist',prehire_config_json:{contractDefaults:{serviceRoles:['tutoring','childcare']}}};
    expect(inferContractServiceRoles({job,credential:'LPC'})).toEqual({roles:['tutoring','childcare'],source:'Posting contract defaults'});
    job.prehire_config_json.contractDefaults.serviceRoles=[];
    expect(inferContractServiceRoles({job,credential:'LPC'}).roles).toEqual([]);
  });
  it('round trips posting and individual roles and service terms through generation tokens',()=>{
    const defaults={serviceRoles:['childcare'],serviceRoleDetails:{childcare:{compensationTerms:'Approved level 3, $24–$32/hour.'}},schedule:'Weekdays'};
    const config=sanitizePrehireConfig({contractDefaults:defaults});
    const actual=jobContractExpectations({prehire_config_json:JSON.stringify(config)});
    expect(actual).toMatchObject(defaults);
    const tokens=expectationsToTokens(actual);
    expect(expectationsFromTokens(tokens)).toMatchObject({serviceRoles:['childcare'],serviceRoleDetails:defaults.serviceRoleDetails});
    expect(defaults.serviceRoles).toEqual(['childcare']);
  });
  it('retains the approved individual agreement basis and written-offer reference in tokens',()=>{
    const value={individualCompensationBasis:'approved_individual_agreement',priorAgreementReference:'Approved offer 2026-11-12',serviceRoles:['tutoring'],serviceRoleDetails:{tutoring:{compensationTerms:'Approved $31.25/hour.'}}};
    expect(expectationsFromTokens(expectationsToTokens(value))).toMatchObject(value);
  });
  it('rejects unknown service roles instead of silently omitting an assigned clause',()=>{
    expect(()=>contractServiceRolePlan({selected:['unrestricted_testing']})).toThrow('valid contract service roles');
    expect(()=>contractServiceRolePlan({selected:'childcare'})).toThrow('list of selected roles');
  });
  it('requires individual childcare pay terms and testing pay plus direct-supervision approval',()=>{
    expect(contractServiceRolePlan({selected:['childcare','psychological_testing']}).missingFields).toEqual(['CHILDCARE_COMPENSATION_TERMS','CHILDCARE_PAY_LEVEL','PSYCHOLOGICAL_TESTING_COMPENSATION_TERMS','PSYCHOLOGICAL_TESTING_AUTHORIZATION_TERMS']);
    const plan=contractServiceRolePlan({selected:['psychological_testing'],details:{psychological_testing:{compensationTerms:'Administration $32/hour; evaluation $44/hour; indirect $22/hour.',authorizationTerms:'Approved instrument list A; qualified licensee B provides direct supervision.'}}});
    expect(plan.missingFields).toEqual([]);
    expect(plan.clauses[0].body_html).toContain('$44/hour');
    expect(plan.clauses[0].body_html).toContain('C.R.S. § 12-245-232(3)');
    expect(plan.clauses[0].body_html).toContain('direct supervision');
  });
  it('escapes individual terms and inserts only selected roles before signatures',()=>{
    const plan=contractServiceRolePlan({selected:['childcare'],details:{childcare:{compensationTerms:'$24 <script>alert(1)</script>'}}});
    const clauses=[{clause_key:'INTRO'},{clause_key:'JOB_DESC_LPC'},{clause_key:'SIG_BLOCK'}];
    const result=applyContractServiceRoleClauses(clauses,plan,{replaceFallbackClinicalDuties:true});
    expect(result.map(c=>c.clause_key)).toEqual(['INTRO','ROLE_CHILDCARE','SIG_BLOCK']);
    expect(result[1].body_html).toContain('&lt;script&gt;');
    expect(result[1].body_html).not.toContain('<script>');
    expect(clauses).toHaveLength(3);
    expect(plan.manifest.filter(r=>r.included).map(r=>r.key)).toEqual(['ROLE_CHILDCARE']);
  });
  it('leaves unrelated documents untouched when service roles are disabled',()=>{
    const clauses=[{clause_key:'JOB_DESC_LPC'}];
    const plan=contractServiceRolePlan({selected:['childcare'],enabled:false});
    expect(applyContractServiceRoleClauses(clauses,plan)).toBe(clauses);
    expect(plan.missingFields).toEqual([]);
  });
  it('adapts only the generic starter clinical-supervision sentence for nonclinical duties',()=>{
    const body='<p>Individual job description remains here.</p><p>Clinical supervision and approvals must be in place before providing services; a job assignment or training completion does not expand professional scope.</p>';
    const clauses=[{clause_key:'STARTER_V1_DUTIES_HOURLY',body_html:body}];
    const result=applyContractServiceRoleClauses(clauses,contractServiceRolePlan({selected:['tutoring']}),{replaceFallbackClinicalDuties:true});
    expect(result[0].body_html).toContain('Role-appropriate oversight and required approvals');
    expect(result[0].body_html).toContain('Individual job description remains here.');
    expect(result[0].body_html).not.toContain('Clinical supervision and approvals');
    expect(clauses[0].body_html).toBe(body);
  });
  it('uses reviewed agency clause text and honors an explicitly inactive role clause',()=>{
    const libraryClauses=[{clause_key:'ROLE_TUTORING',title:'Agency tutoring duties',body_html:'<p>Reviewed agency-specific tutoring terms.</p>',is_active:1}];
    expect(contractServiceRolePlan({selected:['tutoring'],libraryClauses}).clauses[0]).toMatchObject({title:'Agency tutoring duties',body_html:'<p>Reviewed agency-specific tutoring terms.</p>'});
    libraryClauses[0].is_active=0;
    expect(()=>contractServiceRolePlan({selected:['tutoring'],libraryClauses})).toThrow('inactive or empty');
  });
  it('requires a structured childcare level rather than inferring it from freeform pay text',()=>{
    const details={childcare:{compensationTerms:'Childcare level 3, $24–$32/hour.'}};
    expect(contractServiceRolePlan({selected:['childcare'],details}).missingFields).toEqual(['CHILDCARE_PAY_LEVEL']);
    details.childcare.payLevel='3';
    details.childcare.hourlyRate='25.50';
    const plan=contractServiceRolePlan({selected:['childcare'],details});
    expect(plan.missingFields).toEqual([]);
    expect(plan.clauses[0].body_html).toContain('pay level:</strong> 3');
    expect(plan.clauses[0].body_html).toContain('$25.50');
    details.childcare.payLevel=6;
    expect(()=>contractServiceRolePlan({selected:['childcare'],details})).toThrow('pay level from 1 through 5');
  });
  it('keeps bachelor and psychotherapy scope limitations in the rendered duties',()=>{
    expect(CONTRACT_SERVICE_ROLES.find(r=>r.id==='bachelors_counseling').body_html).toContain('distinct from master’s-level psychotherapy');
    expect(CONTRACT_SERVICE_ROLES.find(r=>r.id==='psychotherapy').body_html).toContain('does not represent independent licensure');
  });
  it('suggests NLU placements without requiring a license for master’s-level Category 3',()=>{
    expect(inferNluContractCategory({credential:'GED',jobTitle:'Childcare Provider'})).toBe(1);
    expect(inferNluContractCategory({credential:'BA',jobTitle:'Counselor'})).toBe(2);
    expect(inferNluContractCategory({credential:'MA, Unlicensed',jobTitle:'Counselor'})).toBe(3);
    expect(inferNluContractCategory({credential:'LPCC',jobTitle:'Counselor'})).toBe(3);
    expect(inferNluContractCategory({credential:'LPC-A',jobTitle:'Counselor'})).toBe(3);
    expect(inferNluContractCategory({credential:'MA, LPC',jobTitle:'Counselor'})).toBe(4);
    expect(inferNluContractCategory({credential:'PsyD',jobTitle:'Testing Provider'})).toBe(3);
    expect(inferNluContractCategory({credential:'Intern',jobTitle:'Clinical Intern'})).toBeNull();
  });
});
