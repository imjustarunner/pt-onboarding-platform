import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { effectScope, ref } from 'vue';
import NarrivaModeChooser from '../NarrivaModeChooser.vue';
import NarrivaCompliancePanel from '../NarrivaCompliancePanel.vue';
import { NARRIVA_CHECKS } from '../../../config/narrivaBrand.js';
import { useNarrivaReview } from '../../../composables/useNarrivaReview.js';
import { createEmptyCsNoteBuildState, serializeCsNoteBuildForGenerate } from '../../../utils/csNoteBuild.js';

const passed = () => ({ id:24,status:'passed',quickSignEligible:true,scoring:{score:82,threshold:70,passed:true,qualityPassed:true,mandatoryPassed:true,criteria:[]},checks:NARRIVA_CHECKS.map(check => ({...check,status:'passed',findings:[]})) });
afterEach(() => vi.useRealTimers());

describe('Narriva writer choices and evidence', () => {
  it('offers the three methods, respects manual permissions and saves only an explicit default choice', async () => {
    const w=mount(NarrivaModeChooser,{props:{modelValue:'manual',defaultMode:'manual'}});
    expect(w.findAll('.narriva-modes__options button').map(b=>b.find('strong').text())).toEqual(['Manual writer','Narriva','Smart Notes']);
    expect(w.findAll('.narriva-modes__options button')[0].attributes('aria-pressed')).toBe('true');
    await w.findAll('.narriva-modes__options button')[1].trigger('click');
    expect(w.emitted('update:modelValue')[0]).toEqual(['narriva']);
    expect(w.emitted('save-default')).toBeUndefined();
    await w.setProps({modelValue:'narriva'});await w.find('.narriva-modes__footer button').trigger('click');
    expect(w.emitted('save-default')[0]).toEqual(['narriva']);
    await w.setProps({allowManual:false});expect(w.findAll('.narriva-modes__options button')[0].element.disabled).toBe(true);w.unmount();
  });
  it('shows all five checks in the corrected order and grants no local verification', () => {
    const w=mount(NarrivaCompliancePanel,{props:{busy:true}});
    expect(w.findAll('.narriva-check__title strong').map(n=>n.text())).toEqual(NARRIVA_CHECKS.map((c,i)=>`${i+1}. ${c.label}`));
    expect(w.findAll('.spinning')).toHaveLength(1);
    expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);
    expect(w.find('[alt="Not verified"]').exists()).toBe(true);w.unmount();
  });
  it('requires all server check results before displaying verification and Quick Sign eligibility', async () => {
    const w=mount(NarrivaCompliancePanel,{props:{review:passed()}});
    expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(true);
    const incomplete=passed();incomplete.checks[0].status='action_required';
    await w.setProps({review:incomplete});expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);
    expect(w.find('[alt="Not verified"]').exists()).toBe(true);w.unmount();
  });
  it('shows the returned quality score, evidence and excluded criteria without deriving another percentage', () => {
    const review=passed();review.scoring={...review.scoring,score:70,earned:7,possible:10,criteria:[{id:'interventions',label:'Specific interventions',earned:3,possible:5,status:'missing',message:'Describe the intervention used.',evidence:['<img src=x onerror=alert(1)>']},{id:'assessment',label:'Assessment integration',earned:0,possible:0,status:'not_applicable'}]};
    const w=mount(NarrivaCompliancePanel,{props:{review}});
    expect(w.get('.narriva-score__summary').text()).toContain('70%');expect(w.text()).toContain('Required score: 70%');expect(w.get('.narriva-score__summary').text()).toContain('Pass');expect(w.text()).toContain('3 / 5 points · Missing');expect(w.text()).toContain('Not applicable · excluded');expect(w.get('blockquote').text()).toContain('<img');expect(w.find('blockquote img').exists()).toBe(false);w.unmount();
  });
  it('blocks a high score when a required service check failed', () => {
    const review=passed();review.status='action_required';review.scoring.score=96;review.scoring.passed=false;review.scoring.mandatoryPassed=false;review.checks[1].status='action_required';
    const w=mount(NarrivaCompliancePanel,{props:{review}});expect(w.get('.narriva-score__summary').text()).toContain('96%');expect(w.get('.narriva-score__summary').text()).toContain('Blocked');expect(w.get('.narriva-score__blockers').text()).toContain('Service Code & Documentation');expect(w.find('.narriva-score--passed').exists()).toBe(false);expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);w.unmount();
  });
  it('records an explicit low-score bypass without converting the score into approval', async () => {
    const review=passed();review.status='action_required';review.scoring={...review.scoring,score:69,passed:false,qualityPassed:false,findings:[{id:'scoring:threshold',message:'Improve the missing documentation.',action:'edit_note',canBypass:true}]};
    const w=mount(NarrivaCompliancePanel,{props:{review}});expect(w.get('.narriva-score__summary').text()).toContain('Does not pass');await w.findAll('.narriva-score button').find(b=>b.text()==='Keep my note as it is').trigger('click');expect(w.get('.narriva-score button[type="submit"]').element.disabled).toBe(true);await w.get('.narriva-score textarea').setValue('I reviewed the documented encounter and am keeping this version.');await w.get('.narriva-score form').trigger('submit');expect(w.emitted('resolve')[0][0]).toMatchObject({findingId:'scoring:threshold',action:'bypass'});
    await w.setProps({review:{...review,status:'bypassed'}});expect(w.get('.narriva-score__summary').text()).toContain('69%');expect(w.get('.narriva-score__summary').text()).toContain('not approved');expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);w.unmount();
  });
  it.each([null,{score:'100',threshold:70,passed:true,mandatoryPassed:true},{score:101,threshold:70,passed:true,mandatoryPassed:true},{score:100,threshold:50,passed:true,mandatoryPassed:true}])('does not manufacture a percentage or verification for an invalid/missing score', scoring => {
    const w=mount(NarrivaCompliancePanel,{props:{review:{...passed(),scoring}}});expect(w.text()).toContain('Score unavailable');expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);expect(w.find('[alt="Not verified"]').exists()).toBe(true);w.unmount();
  });
  it.each(['stale','bypassed','unavailable','running'])('never displays a green pass from a %s review even if its prior score passed', status => {
    const w=mount(NarrivaCompliancePanel,{props:{review:{...passed(),status}}});expect(w.find('.narriva-score--passed').exists()).toBe(false);expect(w.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);w.unmount();
  });
  it('allows only server-authorized bypasses, requires a reason, and exposes mandatory risk state', async () => {
    const result=passed();result.status='action_required';result.quickSignEligible=false;result.riskAssessmentRequired=true;
    result.checks[0]={...result.checks[0],status:'action_required',findings:[{id:'risk-missing',message:'Document the indicated safety assessment.',action:'risk_assessment',canBypass:false}]};
    result.checks[2]={...result.checks[2],status:'action_required',findings:[{id:'consent-review',message:'Review encounter consent.',canBypass:true}]};
    const w=mount(NarrivaCompliancePanel,{props:{review:result},slots:{risk:'<template #default="slotProps"><span>{{slotProps.required ? "Risk required" : "Optional risk"}}</span></template>'}});
    expect(w.text()).toContain('Risk required');
    const keep=w.findAll('button').filter(b=>b.text()==='Keep my note as it is');expect(keep).toHaveLength(1);
    await keep[0].trigger('click');expect(w.find('button[type="submit"]').element.disabled).toBe(true);
    await w.get('textarea').setValue('Consent was explicitly documented in the encounter.');await w.get('form').trigger('submit');
    expect(w.emitted('resolve')[0]).toEqual([{findingId:'consent-review',action:'bypass',reason:'Consent was explicitly documented in the encounter.'}]);w.unmount();
  });
  it('does not assert normal mental status or low risk for a new guided note', () => {
    const state=createEmptyCsNoteBuildState();
    expect(state.riskLevel).toBe('');expect(Object.values(state.mse).every(value=>value==='')).toBe(true);
    const text=serializeCsNoteBuildForGenerate(state,{clientInitials:'SECRET-ID'});
    expect(text).not.toContain('SECRET-ID');expect(text).not.toContain('Low Risk');expect(text).not.toContain('Within normal limits');
  });
});

describe('Narriva review request lifecycle', () => {
  it('polls server evidence, then discards it immediately after a local change', async () => {
    vi.useFakeTimers();const client={post:vi.fn().mockResolvedValue({data:{review:{id:24,status:'running'}}}),get:vi.fn().mockResolvedValue({data:{review:passed()}}),patch:vi.fn()};
    const scope=effectScope();const state=scope.run(()=>useNarrivaReview({agencyId:ref(7),apiClient:client}));
    const pending=state.runReview({draftId:41});await flushPromises();expect(state.busy.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);await pending;
    expect(client.post).toHaveBeenCalledWith('/narriva/reviews',{agencyId:7,draftId:41},{skipGlobalLoading:true});
    expect(state.review.value.quickSignEligible).toBe(true);state.invalidate();expect(state.review.value).toBeNull();scope.stop();
  });
  it('ignores a late response after switching note and does not expose provider errors', async () => {
    let respond;const client={post:vi.fn(()=>new Promise(resolve=>{respond=resolve;})),get:vi.fn(),patch:vi.fn()};
    const scope=effectScope();const state=scope.run(()=>useNarrivaReview({agencyId:ref(7),apiClient:client}));
    const pending=state.runReview({noteId:41});state.invalidate();respond({data:{review:passed()}});await pending;expect(state.review.value).toBeNull();
    client.post.mockRejectedValue(new Error('private provider response'));await state.runReview({noteId:42});expect(state.review.value).toBeNull();expect(state.error.value).not.toContain('private provider response');scope.stop();
  });
});

it('observes an in-progress submission review through read-only polling and stops after completion',async()=>{
 vi.useFakeTimers();const api={get:vi.fn(async()=>({data:{review:passed()}})),post:vi.fn()};const scope=effectScope();const state=scope.run(()=>useNarrivaReview({agencyId:ref(2),apiClient:api,pollMs:20}));
 const done=state.observeReview({id:24,status:'running',checks:[]});expect(state.busy.value).toBe(true);await vi.advanceTimersByTimeAsync(20);await done;expect(state.review.value.status).toBe('passed');expect(state.busy.value).toBe(false);expect(api.post).not.toHaveBeenCalled();expect(api.get).toHaveBeenCalledWith('/narriva/reviews/24',expect.objectContaining({params:{agencyId:2}}));scope.stop();
});
