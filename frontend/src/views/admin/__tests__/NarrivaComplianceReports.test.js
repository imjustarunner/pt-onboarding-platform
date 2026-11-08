import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Reports from '../NarrivaComplianceReportsView.vue';
import api from '../../../services/api';

const state=reactive({currentAgency:{id:10,name:'Synthetic Clinic'}});
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>state}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
const settings=()=>({enabled:false,cadence:'quarterly',intervalDays:90,sampleSize:10,notesPerClient:5,nextRunAt:null});
const configuration=()=>({settings:settings(),billing:{priceCents:10000,currency:'USD',available:true,canRun:true},standard:{title:'CCHA',edition:'SFY25–26',groups:[]}});
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
beforeEach(()=>{
  vi.clearAllMocks();state.currentAgency={id:10,name:'Synthetic Clinic'};
  api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?configuration():path.endsWith('/runs')?{runs:[]}:{run:{id:1,status:'completed',summary:{sampledClients:10},samples:[]}}}));
  api.patch.mockResolvedValue({data:{}});api.post.mockResolvedValue({data:{run:{id:1}}});
});
describe('Narriva paid report administration',()=>{
  it('shows the price per run and default cohorts, without activating or running on load',async()=>{
    const w=mount(Reports);await flushPromises();
    expect(w.text()).toContain('$100.00');expect(w.text()).toContain('5 consecutive-note reviews and 5 random-note reviews');
    expect(w.text()).toContain('Scheduling is off until you enable it.');
    expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('requires explicit price acceptance and preserves an idempotency key after failure',async()=>{
    api.post.mockRejectedValueOnce({response:{data:{error:{message:'Temporary outage'}}}});
    const w=mount(Reports);await flushPromises();await w.findAll('form')[0].trigger('submit');await flushPromises();
    expect(button(w,'Run report').attributes('disabled')).toBeDefined();
    await w.find('.confirm input[type="checkbox"]').setValue(true);await button(w,'Run report').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);const first=api.post.mock.calls[0][1];
    expect(first).toMatchObject({agencyId:10,confirmCharge:true,acceptedPriceCents:10000});expect(first.idempotencyKey).toBeTruthy();
    await button(w,'Run report').trigger('click');await flushPromises();
    expect(api.post.mock.calls[1][1].idempotencyKey).toBe(first.idempotencyKey);w.unmount();
  });
  it('does not run without server eligibility',async()=>{
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?{...configuration(),billing:{priceCents:10000,canRun:false}}:{runs:[]}}));
    const w=mount(Reports);await flushPromises();expect(button(w,'Review run').attributes('disabled')).toBeDefined();
    await w.findAll('form')[0].trigger('submit');expect(w.find('.confirm').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('does not turn cadence changes into consent to charge',async()=>{
    const w=mount(Reports);await flushPromises();await w.find('.ncr-controls input[type="checkbox"]').setValue(true);
    await w.findAll('form')[1].trigger('submit');await flushPromises();expect(button(w,'Save settings').attributes('disabled')).toBeDefined();
    await w.find('.confirm input[type="checkbox"]').setValue(true);await button(w,'Save settings').trigger('click');await flushPromises();
    expect(api.patch.mock.calls[0][1]).toMatchObject({agencyId:10,enabled:true,cadence:'quarterly',sampleSize:10,confirmCharge:true,acceptedPriceCents:10000});w.unmount();
  });
  it('requires explicit no-charge acceptance before enabling scheduled reports with a zero waiver',async()=>{
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?{...configuration(),billing:{priceCents:0,feeWaived:true,currency:'USD',available:true,canRun:false}}:{runs:[]}}));
    const w=mount(Reports);await flushPromises();
    expect(w.get('.price').text()).toBe('No charge');expect(w.text()).toContain('$0.00 per completed report');
    expect(w.text()).not.toContain('Billed once for a completed report');expect(w.text()).toContain('This waiver does not authorize future charges.');
    expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
    await w.find('.ncr-controls input[type="checkbox"]').setValue(true);await w.findAll('form')[1].trigger('submit');await flushPromises();
    expect(w.get('.confirm').text()).toContain('I enable reports at no charge');expect(button(w,'Save settings').attributes('disabled')).toBeDefined();
    await w.find('.confirm input[type="checkbox"]').setValue(true);await button(w,'Save settings').trigger('click');await flushPromises();
    expect(api.patch.mock.calls[0][1]).toMatchObject({agencyId:10,enabled:true,cadence:'quarterly',confirmCharge:true,acceptedPriceCents:0});w.unmount();
  });
  it('runs a no-charge manual report only after confirmation and shows its saved zero fee',async()=>{
    const run={id:17,status:'completed',billing:{unitCents:0,billable:false,invoiceId:null},samples:[]};
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?{...configuration(),settings:{...settings(),enabled:true,cadence:'manual',acceptedPriceCents:0},billing:{priceCents:0,feeWaived:true,currency:'USD',available:true,canRun:true}}:path.endsWith('/runs')?{runs:[run]}:{run}}));
    api.post.mockResolvedValue({data:{run}});
    const w=mount(Reports);await flushPromises();expect(w.text()).toContain('enabled for manual runs');
    expect(button(w,'Review run').text()).toContain('No charge');await w.findAll('form')[0].trigger('submit');await flushPromises();
    expect(w.get('.confirm').text()).toContain('I authorize this report at no charge');expect(button(w,'Run report').attributes('disabled')).toBeDefined();
    expect(api.post).not.toHaveBeenCalled();await w.find('.confirm input[type="checkbox"]').setValue(true);await button(w,'Run report').trigger('click');await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({agencyId:10,confirmCharge:true,acceptedPriceCents:0});
    expect(w.get('.report .run-fee').text()).toBe('No charge · $0.00');w.unmount();
  });
  it('requires new explicit $100 acceptance when a zero waiver ends and retains no-charge report history',async()=>{
    const run={id:18,status:'completed',billing:{unitCents:0,billable:false,invoiceId:null},samples:[]};
    let priceCents=0;
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?{...configuration(),settings:{...settings(),enabled:true,acceptedPriceCents:0},billing:{priceCents,currency:'USD',available:true,canRun:priceCents===0,priceAccepted:priceCents===0}}:path.endsWith('/runs')?{runs:[run]}:{run}}));
    const w=mount(Reports);await flushPromises();await w.findAll('form')[1].trigger('submit');await flushPromises();await w.find('.confirm input[type="checkbox"]').setValue(true);await button(w,'Save settings').trigger('click');await flushPromises();
    expect(api.patch.mock.calls[0][1].acceptedPriceCents).toBe(0);
    priceCents=10000;await button(w,'Refresh').trigger('click');await flushPromises();
    expect(w.get('.price').text()).toBe('$100.00');expect(w.get('.run-open').text()).toContain('No charge · $0.00');
    expect(button(w,'Review run').attributes('disabled')).toBeDefined();expect(api.patch).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();
    await w.findAll('form')[1].trigger('submit');await flushPromises();
    expect(w.get('.confirm').text()).toContain('I authorize $100.00 per completed run');expect(w.get('.confirm input[type="checkbox"]').element.checked).toBe(false);expect(button(w,'Save settings').attributes('disabled')).toBeDefined();
    await w.find('.confirm input[type="checkbox"]').setValue(true);await button(w,'Save settings').trigger('click');await flushPromises();
    expect(api.patch.mock.calls[1][1]).toMatchObject({confirmCharge:true,acceptedPriceCents:10000});w.unmount();
  });
  it('does not present an unset price as a free waiver',async()=>{
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?{...configuration(),billing:{priceCents:null,currency:'USD',available:false,canRun:false}}:{runs:[]}}));
    const w=mount(Reports);await flushPromises();expect(w.get('.price').text()).toBe('Price not configured');expect(w.text()).not.toContain('fee is currently waived');expect(button(w,'Review run').attributes('disabled')).toBeDefined();w.unmount();
  });
  it('clears reports and ignores delayed results when the agency changes',async()=>{
    let oldResolve;api.get.mockImplementation(path=>path.endsWith('/settings')?new Promise(resolve=>{oldResolve=resolve;}):Promise.resolve({data:{runs:[]}}));
    const w=mount(Reports);await flushPromises();api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?{...configuration(),settings:{...settings(),sampleSize:6}}:{runs:[]}}));
    state.currentAgency={id:11,name:'Second Clinic'};await flushPromises();oldResolve({data:configuration()});await flushPromises();
    expect(w.text()).toContain('Second Clinic');expect(w.text()).toContain('6 clients');expect(w.text()).not.toContain('10 clients');w.unmount();
  });
  it('clears protected content when report authorization fails',async()=>{
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?configuration():{runs:[{id:9,status:'completed',periodStart:'2026-07-01',periodEnd:'2026-09-30'}]}}));
    const w=mount(Reports);await flushPromises();api.get.mockRejectedValueOnce({response:{data:{error:{message:'Access denied'}}}});
    await w.find('.run-open').trigger('click');await flushPromises();expect(w.find('.report').text()).toContain('Access denied');expect(w.find('.report-note').exists()).toBe(false);w.unmount();
  });
  it('shows original bypass reasons and incomplete audit evidence without a payer pass claim',async()=>{
    const run={id:'synthetic-report',status:'completed',periodStart:'2026-07-01',periodEnd:'2026-09-30',summary:{sampledClients:1,selectedNotes:1,evaluatedNotes:1},samples:[{clientRef:'Client #42',cohort:'random',notes:[{noteRef:'Note 1',status:'evaluated',priorApproval:{status:'bypassed',findings:[{message:'Service rationale was missing.',reason:'Clinician requested ordinary review.'}]},audit:{status:'incomplete',checks:[{id:'general.signature',label:'Signature evidence',status:'not_assessed',detail:'Required evidence has not been verified.'}]},narrative:'The client practiced the recorded coping strategy.'}]}]};
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?configuration():path.endsWith('/runs')?{runs:[run]}:{run}}));
    const w=mount(Reports);await flushPromises();await w.find('.run-open').trigger('click');await flushPromises();
    const report=w.find('.report').text();expect(report).toContain('Client #42');expect(report).toContain('Kept-as-is reason: Clinician requested ordinary review.');expect(report).toContain('Incomplete evidence');expect(report).toContain('Signature evidence — Not assessed');expect(report).not.toContain('Audit passed');w.unmount();
  });
  it('reauthorizes exports and removes loaded content when access has been revoked',async()=>{
    const run={id:'synthetic-report',status:'completed',periodStart:'2026-07-01',periodEnd:'2026-09-30',samples:[{clientRef:'Client #42',cohort:'random',notes:[{noteRef:'Note 1',narrative:'Synthetic protected content.'}]}]};
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/settings')?configuration():path.endsWith('/runs')?{runs:[run]}:{run}}));
    const w=mount(Reports);await flushPromises();await w.find('.run-open').trigger('click');await flushPromises();expect(w.text()).toContain('Synthetic protected content.');
    api.get.mockRejectedValueOnce({response:{status:403,data:{error:{message:'Access was revoked.'}}}});
    await button(w,'Download').trigger('click');await flushPromises();expect(w.text()).toContain('Access was revoked.');expect(w.text()).not.toContain('Synthetic protected content.');w.unmount();
  });
});
