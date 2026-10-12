import {describe,it,expect,vi} from 'vitest';
vi.mock('../../models/PayrollCompensationLevel.model.js',()=>({default:{listForAgency:vi.fn(async()=>[{category:2,level:1,direct_rate:24,indirect_rate:18}]),getLevelRatesForAgency:vi.fn(async()=>({}))}}));
vi.mock('../../models/PayrollPaySystemRate.model.js',()=>({default:{listForAgency:vi.fn(async()=>[profile,{...profile,id:4,level:2}])}}));
vi.mock('../../config/database.js',()=>({default:{}}));
import {employmentCategoryLevelTerms,applyEmploymentPayTerms} from '../../content/employmentCategoryLevelTerms.js';
import {contractCompensationLevels} from '../contractCompensation.service.js';
import {employmentStarterClauses} from '../employmentStarter.service.js';
const profile={id:3,category:2,level:1,creditRate:55,creditRateProbation:45,hcodeRate:32,hcodeRateProbation:28,indirectRate:20,supportActivityRate:19,autoIndirectMinutesPerHour:10,tierBonus:{3:4}};
const terms=(role='Provider',name='ITSCO')=>employmentCategoryLevelTerms({row:{category:2,level:1,paySystem:profile},tokens:{ROLE_LABEL:role,JOB_TITLE:'School provider'},agencyName:name});
describe('current employment pay schedule',()=>{
 it('selects saved profiles even without a legacy level and supersedes obsolete amounts',async()=>{const rows=await contractCompensationLevels(1);expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({direct_rate:55,indirect_rate:20});expect(rows[1].paySystem.id).toBe(4);});
 it('replaces legacy pay and benefits once with the selected category and level',()=>{
  const rendered=applyEmploymentPayTerms([{clause_key:'COMP_HOURLY',body_html:'$$24.00'},{clause_key:'FFS_TABLE',body_html:'old table'},{clause_key:'BENEFITS',body_html:'old benefits'},{clause_key:'LEGALESE',body_html:'recoup unpaid claims'}],terms());
  const html=rendered.map(c=>c.body_html).join('');expect(html).toContain('Category 2, Level 1');expect(html).toContain('$55.00');expect(html).toContain('$32.00');expect(html).toContain('10 minutes');expect(html).not.toContain('$$');expect(html).not.toContain('$24.00');expect(html).toContain('does not erase earned wages');expect(html).toContain('no probationary waiting period');expect(rendered[1].body_html).toBe('');
 });
 it('supports starter copies and includes no clinical rate for facilitators',()=>{const result=applyEmploymentPayTerms(employmentStarterClauses(),terms('Facilitator'));const comp=result.find(c=>c.clause_key==='STARTER_V1_COMPENSATION');expect(comp.body_html).not.toContain('Clinical Session Rate');expect(comp.body_html).toContain('Direct Care Rate');expect(result.find(c=>c.clause_key==='STARTER_V1_BENEFITS').body_html).toContain('protected leave');});
 it('requires real current rates and preserves the source profile',()=>{const before=structuredClone(profile);terms();expect(profile).toEqual(before);expect(()=>employmentCategoryLevelTerms({row:{}})).toThrow('Configure');expect(()=>employmentCategoryLevelTerms({row:{category:2,level:1,paySystem:{...profile,hcodeRate:null}}})).toThrow('hcodeRate');});
});
