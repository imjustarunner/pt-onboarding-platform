import { describe, it, expect } from 'vitest';
import { payrollWizardBlocker, payrollReviewBlocker, payrollRawStepModes } from '../payrollWizardFlow';
describe('payroll wizard routing',()=>{
 it('routes each supported processing code to its actual review',()=>{for(const code of ['H0031','H0032','H2014','90853','H2032'])expect(payrollWizardBlocker({pendingProcessing:{sample:[{service_code:code}]}})).toEqual({step:code.toLowerCase()});});
 it('routes required hours, claims and To-Dos to their source controls',()=>{expect(payrollWizardBlocker({actualHoursReviewUserIds:[532,538]})).toEqual({step:'preview',userId:532});expect(payrollWizardBlocker({pendingTodos:{count:2}})).toEqual({step:'stage',tool:'todos'});expect(payrollWizardBlocker({pendingTime:{count:1}})).toEqual({step:'claims'});});
 it('fails closed while a review is unknown, loading, saving or errored',()=>{for(const state of [undefined,{loading:true},{saving:true},{error:'Could not load'}])expect(payrollReviewBlocker(state)).toBeTruthy();expect(payrollReviewBlocker({ready:true})).toBe('');expect(payrollReviewBlocker({ready:false,pendingCount:3})).toContain('3');});
 it('gives both prior reports separate audit stops before current data processing',()=>{expect(payrollRawStepModes.draft_audit_prior).toBe('draft_audit');expect(payrollRawStepModes.draft_audit_two_ago).toBe('draft_audit');});
});
