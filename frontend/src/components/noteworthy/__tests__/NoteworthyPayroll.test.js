import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Demo from '../../../views/public/NoteworthyPayrollDemo.vue';
import Website from '../../../views/public/NoteworthyPayrollWebsite.vue';
import { createDemoState, demoBlocker, demoCsv, demoLines, demoSteps, demoTotal, providerTotal } from '../../../content/noteworthyPayroll';

async function render(component, path='/fundthred/noteworthy/demo', props={}) {
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});
  await router.push(path);await router.isReady();
  return mount(component,{props,global:{plugins:[router]}});
}
const readyState=()=>({...createDemoState(),loaded:true,priorDecision:'payable',lateAdded:true,draftDecision:'payable',assessmentReviewed:true,claimsApproved:true});

describe('fictional NoteWorthy payroll calculations',()=>{
  it('adds eligible catch-up once and preserves its original service date',()=>{
    const state=createDemoState();state.loaded=true;
    const original=demoTotal(state);state.lateAdded=true;
    expect(demoTotal(state)).toBe(original+52);
    expect(demoLines(state,'jordan').find(line=>line.late)).toMatchObject({date:'2026-10-22',code:'90837',amount:52});
    state.lateAdded=true;expect(demoTotal(state)).toBe(original+52);
  });
  it('keeps pro bono at zero and combines changed rates with approved administrative time',()=>{
    const state=readyState();
    expect(providerTotal(state,'jordan')).toBe(871);
    state.rates.jordan=60;
    expect(providerTotal(state,'jordan')).toBe(1005);
    state.rates.morgan=120;
    expect(demoLines(state,'morgan').find(line=>line.code==='PRO BONO')).toMatchObject({rate:0,amount:0});
  });
  it('keeps unpaid drafts out and requires recalculation after a rate change',()=>{
    const state=readyState();const before=demoTotal(state);state.draftDecision='unpaid';
    expect(demoTotal(state)).toBe(before-38);
    expect(demoBlocker('preview',state)).toContain('Return to Calculate');
    expect(demoBlocker('post',state)).toContain('Return to Calculate');
    state.calculated=true;expect(demoBlocker('preview',state)).toBe('');
  });
  it('preserves the original paid rate on a separate correction line',()=>{const state=readyState();const original=providerTotal(state,'morgan');state.correctionApplied=true;state.rates.morgan=75;const correction=demoLines(state,'morgan').find(line=>line.correction);expect(correction).toMatchObject({date:'2026-10-21',rate:38,amount:-38});expect(original).toBe(418);});
  it('exports fictional line-level records, including zero-pay work and original dates',()=>{
    const csv=demoCsv(readyState());
    expect(csv).toContain('DEMO ONLY');expect(csv).toContain('"2026-10-22","90837"');
    expect(csv).toContain('"PRO BONO"');expect(csv).toContain('"0.00","0.00"');
    expect(csv).not.toMatch(/client|patient|@/i);
  });
});

describe('public payroll walkthrough',()=>{
  beforeEach(()=>vi.restoreAllMocks());
  it('requires a fictional report and a draft decision before continuing',async()=>{
    const wrapper=await render(Demo);
    expect(wrapper.get('[data-test=continue]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('input[type=file]').exists()).toBe(false);
    await wrapper.get('[data-test=load-sample]').trigger('click');
    expect(wrapper.text()).toContain('4 providers found');
    await wrapper.get('[data-test=continue]').trigger('click');
    expect(wrapper.get('[data-test=continue]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-test=draft-unpaid]').trigger('click');
    expect(wrapper.text()).toContain('The draft stays unpaid');
    expect(wrapper.get('[data-test=continue]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('walks through all 17 steps, changes compensation, previews the original late note, and simulates posting',async()=>{
    const wrapper=await render(Demo);
    await wrapper.get('[data-test=load-sample]').trigger('click');
    for(const step of demoSteps){
      expect(wrapper.get('.nw-demo-step-heading h2').text()).toBe(step.title);
      if(['prior','draft'].includes(step.id))await wrapper.get('[data-test=draft-payable]').trigger('click');
      if(step.id==='late'){await wrapper.get('[data-test=add-late]').trigger('click');await wrapper.get('[data-test=review-correction]').trigger('click');expect(wrapper.text()).toContain('paid $38.00');await wrapper.get('[data-test=apply-correction]').trigger('click');}
      if(step.id==='h0031')await wrapper.get('[data-test=confirm-assessment]').trigger('click');
      if(step.id==='claims')await wrapper.get('[data-test=approve-claims]').trigger('click');
      if(step.id==='stage')await wrapper.get('input[aria-label="Jordan Reyes sample rate"]').setValue('60');
      if(step.id==='run'){
        expect(wrapper.get('[data-test=continue]').attributes('disabled')).toBeDefined();
        await wrapper.get('[data-test=calculate]').trigger('click');
      }
      if(step.id==='preview'){
        await wrapper.findAll('.nw-demo-step-body button')[0].trigger('click');
        expect(wrapper.get('[data-test=provider-total]').text()).toBe('$1,005.00');
        expect(wrapper.text()).toContain('2026-10-22');
        const back=wrapper.findAll('button').find(button=>button.text().includes('Back to the wizard'));
        await back.trigger('click');
        expect(wrapper.get('.nw-demo-step-heading h2').text()).toBe(step.title);
      }
      if(step.id==='post'){
        await wrapper.get('[data-test=post-demo]').trigger('click');
        expect(wrapper.text()).toContain('Demo payroll posted');
        expect(wrapper.find('[data-test=post-demo]').exists()).toBe(false);
        expect(wrapper.get('[data-test=download-csv]').text()).toContain('Download sample CSV');
      }else{
        expect(wrapper.get('[data-test=continue]').attributes('disabled')).toBeUndefined();
        await wrapper.get('[data-test=continue]').trigger('click');
      }
    }
    wrapper.unmount();
  });
  it('opens a standalone provider preview without requiring or sending a real report',async()=>{
    const wrapper=await render(Demo,'/fundthred/noteworthy/demo?view=provider');
    expect(wrapper.text()).toContain('Your pay, explained.');
    expect(wrapper.get('[data-test=provider-total]').text()).toBe('$871.00');
    await wrapper.get('#nw-demo-provider').setValue('morgan');
    expect(wrapper.text()).toContain('Pro bono · no compensation');
    expect(wrapper.text()).toContain('$0.00');
    wrapper.unmount();
  });
  it('shows approved pricing, working signup destinations, and the payroll processing boundary',async()=>{
    const wrapper=await render(Website,'/fundthred/noteworthy');
    expect(wrapper.findAll('.nw-pricing article')).toHaveLength(3);
    expect(wrapper.text()).toContain('$79');expect(wrapper.text()).toContain('$149');expect(wrapper.text()).toContain('$299');
    expect(wrapper.findAll('a[href^="/fundthred/noteworthy/start"]').length).toBeGreaterThan(3);
    expect(wrapper.text()).toContain('payments, tax withholding, and filings');
    const tabs=wrapper.findAll('.nw-preview-tabs button');await tabs[1].trigger('click');
    expect(wrapper.text()).toContain('A late note. A clear next step.');
    wrapper.unmount();
  });
});
