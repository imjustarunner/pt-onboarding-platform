import {describe,it,expect} from 'vitest';
import {contractRoleLabel,jobContractExpectations,expectationsToTokens,renderAdditionalExpectations} from '../../utils/contractExpectations.js';
import {employmentStarterClauses} from '../employmentStarter.service.js';
import {sanitizePrehireConfig} from '../../utils/prehireConfigSanitize.js';
describe('posting defaults and individual terms',()=>{
 it('keeps short contract roles separate from recruiting titles',()=>{
  expect(contractRoleLabel({jobTitle:'School Mental Health Provider - Denver',roleType:'provider',credential:'BA'})).toBe('Facilitator');
  expect(contractRoleLabel({jobTitle:'Associate Therapist II - North region',credential:'LPCC'})).toBe('Provider');
  expect(contractRoleLabel({jobTitle:'Mental Health Internship'})).toBe('Student');
 });
 it('round trips posting defaults without losing reference documents',()=>{
  const config=sanitizePrehireConfig({documents:[{title:'Reference authorization',id:'release'}],contractDefaults:{expectedHours:'20–25',directHours:'10',roleLabel:'Facilitator',additionalDuties:[{description:'Case management',payBasis:'hcode'}]}});
  const job={schedule_text:'Weekdays',prehire_config_json:JSON.stringify(config)};
  const defaults=jobContractExpectations(job);
  expect(defaults.schedule).toBe('Weekdays');expect(config.documents).toHaveLength(1);
  const override={...defaults,expectedHours:'16'};
  expect(expectationsToTokens(override)).toMatchObject({EXPECTED_HOURS:'16',MIN_HOURS:'10',ROLE_LABEL:'Facilitator'});
  expect(jobContractExpectations(job).expectedHours).toBe('20–25');
 });
 it('resolves the selected H-code rate and escapes custom duties',()=>{
  const html=renderAdditionalExpectations({additionalDuties:[{description:'Case management <script>',payBasis:'hcode'}]},{paySystem:{hcodeRate:40,creditRate:55}});
  expect(html).toContain('$40.00 per hour');expect(html).not.toContain('$55.00');expect(html).toContain('&lt;script&gt;');
 });
 it('requires actual configured rates instead of guessing from direct pay',()=>{
  expect(()=>renderAdditionalExpectations({additionalDuties:[{description:'Case management',payBasis:'hcode'}]},{direct_rate:50})).toThrow('positive hcode rate');
  expect(()=>renderAdditionalExpectations({additionalDuties:[{description:'Case management',payBasis:'service_code',serviceCode:'T1017'}]},{})).toThrow('T1017');
 });
 it('retains unit, probation and indirect pay for a configured service',()=>{
  const html=renderAdditionalExpectations({additionalDuties:[{description:'Case management',payBasis:'service_code',serviceCode:'T1017'}]}, {},[{code:'T1017',rate:'$10.00',unit:'per unit',reduced:'$9.00',additionalIndirect:'$2.00 additional indirect pay'}]);
  expect(html).toContain('$10.00 per unit');expect(html).toContain('$9.00');expect(html).toContain('$2.00');
 });
 it('supports explicit individual duty pay without changing the agency rate row',()=>{
  const row={direct_rate:40};expect(renderAdditionalExpectations({additionalDuties:[{description:'Team mentoring',payBasis:'custom',customRate:'52.50',rateUnit:'per_hour'}]},row)).toContain('$52.50 per hour');expect(row.direct_rate).toBe(40);
 });
 it('provides full configurable agency starters without named people or ITSCO affiliations',()=>{
  for(const mode of ['hourly','ffs']){
   const clauses=employmentStarterClauses(mode);expect(clauses.length).toBeGreaterThanOrEqual(14);
   const html=clauses.map(c=>c.body_html).join('');expect(html).toContain('{{ROLE_LABEL}}');expect(html).toContain('{{INSERT_PAY_TABLE}}');expect(html).not.toMatch(/Paige|Haley|Rosas|Mental Range|ITSCO|<em>NAME/);
  }
  expect(employmentStarterClauses('ffs').find(c=>c.clause_key.endsWith('COMPENSATION')).body_html).toContain('fee-for-service');
 });
});
