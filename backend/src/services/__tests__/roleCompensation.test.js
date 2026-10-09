import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({policyError:(status,message)=>Object.assign(new Error(message),{status})}));
import {roleCompensationTerms} from '../../content/roleCompensationTerms.js';
import {roleCompensationRate} from '../roleCompensationRate.js';
import {activeReviewSeconds,assertOtherProviderNote} from '../cosignReviewActivity.service.js';
import {isCompensationAmendmentExempt,isCompensationUpdatePlan} from '../compensationAmendmentExemption.service.js';
it('describes actual co-sign review time, not an automatic supervision allowance or own notes',()=>{
 const html=roleCompensationTerms({supervisor:{hourlyRate:65}});expect(html).toContain('$97.50');expect(html).toContain('$32.50 per actual review hour');expect(html).toContain('$16.25');expect(html).toContain('does not apply to writing, reviewing or signing your own notes');expect(html).toContain('no automatic allowance');expect(html).not.toContain('CPA');expect(html).toContain('supervisor-duty rates in this section do not determine your sick-leave payment rate');
});
it('shows role rates only to the assigned mentor or CPA and keeps them separate from clinical pay',()=>{
 expect(roleCompensationTerms()).toBe('');const html=roleCompensationTerms({cpa:{meetingRate:28,adminRate:23}});expect(html).toContain('$28.00');expect(html).toContain('$23.00');expect(html).not.toMatch(/supervision compensation|mentor|bonus|conditional addition/i);
 expect(roleCompensationRate({supervisor:{hourlyRate:65}},'Admin Time',{categoryGroup:'supervision_note'})).toBe(32.5);expect(roleCompensationRate({supervisor:{hourlyRate:65}},'99416')).toBe(97.5);expect(roleCompensationRate({cpa:{meetingRate:28,adminRate:23}},'Individual Meeting')).toBe(28);
});
it('counts only bounded active heartbeats and never time spent disconnected, hidden or closed',()=>{
 const now=new Date('2026-10-09T18:00:15Z'),row={last_heartbeat_at:new Date('2026-10-09T18:00:00Z'),is_active:1};expect(activeReviewSeconds(row,true,now)).toBe(15);expect(activeReviewSeconds(row,false,now)).toBe(0);expect(activeReviewSeconds({...row,is_active:0},true,now)).toBe(0);expect(activeReviewSeconds(row,true,new Date('2026-10-09T18:05:00Z'))).toBe(0);expect(activeReviewSeconds({...row,ended_at:now},true,now)).toBe(0);
});
it('rejects self-authored notes, unauthorized reviewers, and unsigned notes',()=>{
 const args={actorId:1,providerId:2,canAttest:true,note:{created_by_user_id:2,provider_signed_by_user_id:2,provider_signed_at:'2026-10-09'}};expect(()=>assertOtherProviderNote(args)).not.toThrow();for(const changed of [{providerId:1},{canAttest:false},{note:{...args.note,created_by_user_id:1}},{note:{...args.note,provider_signed_by_user_id:1}},{note:{...args.note,provider_signed_at:null}}])expect(()=>assertOtherProviderNote({...args,...changed})).toThrow();
});
it('recognizes a saved salary exemption without excluding separate job-description updates',async()=>{const db={execute:vi.fn().mockResolvedValue([[{id:41}]])};expect(await isCompensationAmendmentExempt(2,496,db)).toBe(true);expect(db.execute.mock.calls[0][1]).toEqual([2,496,'provider_update_compensation_exempt']);expect(isCompensationUpdatePlan(null)).toBe(true);expect(isCompensationUpdatePlan({mode:'compensation'})).toBe(true);expect(isCompensationUpdatePlan({mode:'job_description'})).toBe(false);});

import {computeLineAmount} from '../paySystem.service.js';
it('preserves signed role rates in imported payroll lines instead of applying the general indirect rate',()=>{const rateProfile={indirectRate:22,indirectRateProbation:22,supportActivityRate:18,roleCompensation:{supervisor:{hourlyRate:65}}},status={useReducedRates:true};expect(computeLineAmount({rateProfile,status,serviceCode:'99415',quantity:60}).amount).toBe(65);expect(computeLineAmount({rateProfile,status,serviceCode:'99416',quantity:60}).amount).toBe(97.5);expect(computeLineAmount({rateProfile,status,serviceCode:'Admin Time',quantity:30}).amount).toBe(16.25);expect(computeLineAmount({rateProfile:{...rateProfile,roleCompensation:{cpa:{meetingRate:28,adminRate:23}}},status,serviceCode:'Individual Meeting',quantity:60}).amount).toBe(28);});
