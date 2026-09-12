import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Shell from '../FamilyPortalShell.vue';
import Plan from '../../guardian/GuardianPlanProgressPanel.vue';
import Home from '../FamilyPortalHome.vue';
import Ledger from '../../billing/FamilyLedgerPanel.vue';
import { portalTheme } from '../../../utils/familyPortalTheme';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const response = name => ({ data: { hasActivePlan: true, plan: {title:name,status:'active'}, goals: [{id:1,goalIndex:1,goalText:'Build coping skills',objectives:[{id:2,objectiveIndex:1,objectiveText:'Practice skills',scaleCurrent:4,scaleTarget:8,scaleDirection:'increase'}]}], ratings:[] } });
describe('tenant family portal', () => {
  it('uses tenant identity, accessible navigation and a real support destination', async () => {
    const w=mount(Shell,{props:{brandName:'Inner Strength Institute',primaryColor:'#247849',title:'Welcome, Sam!',userName:'Sam Parent',active:'dashboard',navigation:[{key:'dashboard',label:'Dashboard'},{key:'messages',label:'Messages'}]}});
    expect(w.text()).toContain('Inner Strength Institute');expect(w.find('[aria-current="page"]').text()).toBe('Dashboard');
    await w.find('.portal-menu').trigger('click');expect(w.find('.portal-menu').attributes('aria-expanded')).toBe('true');
    await w.find('.portal-support button').trigger('click');expect(w.emitted('navigate').at(-1)).toEqual(['messages']);expect(w.find('.portal-menu').attributes('aria-expanded')).toBe('false');w.unmount();
  });
  it('rejects CSS injection and darkens light tenant colors for white text', () => {
    expect(portalTheme('red;display:none')['--portal-accent']).toBe('#2459ad');
    const t=portalTheme('#ffff00');expect(t['--portal-accent']).not.toBe('#ffff00');expect(t['--portal-on-accent']).toBe('#ffffff');
    expect(portalTheme('#2459ad')['--portal-accent']).not.toBe(portalTheme('#247849')['--portal-accent']);
  });
  it('loads permitted plan progress and shows actual current/target scales',async()=>{
    api.get.mockResolvedValue(response('My plan'));const w=mount(Plan,{props:{clientId:101,agencyId:1,visible:true}});await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/guardian-portal/dependents/101/plan-progress',expect.objectContaining({params:{agencyId:1}}));expect(w.text()).toContain('My plan');expect(w.findAll('.gpp-scale .current')).toHaveLength(1);expect(w.text()).not.toContain('68%');w.unmount();
  });
  it('clears a plan on client change and ignores late responses from another client',async()=>{
    let old;api.get.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve;})).mockResolvedValueOnce(response('New client plan'));
    const w=mount(Plan,{props:{clientId:101,agencyId:1}});await w.setProps({clientId:102});await flushPromises();old(response('Private old plan'));await flushPromises();expect(w.text()).toContain('New client plan');expect(w.text()).not.toContain('Private old plan');await w.setProps({visible:false});expect(w.text()).toBe('');w.unmount();
  });
  it('never requests clinical plans without a grant or payment tasks in preview',async()=>{
    const w=mount(Home,{props:{agencyId:1,clientId:101,showPlan:false,preview:true},global:{stubs:{RouterLink:true}}});await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.text()).toContain('permission to view');w.unmount();
  });
  it('filters real receipts without making payments or showing another method',async()=>{
    api.get.mockImplementation(async url=>({data:url.endsWith('/balances')?{balances:[]}:url.endsWith('/receipts')?{receipts:[{paymentId:1,receiptNumber:'R-001',payerName:'Parent One',amountCents:2500,receivedAt:'2026-09-01'},{paymentId:2,receiptNumber:'R-002',payerName:'Parent Two',amountCents:3000,receivedAt:'2026-09-02'}]}:url.endsWith('/tasks')?{tasks:[]}:url.endsWith('/splits')?{requests:[]}:{payers:{}}}));
    const w=mount(Ledger,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();await w.find('input[type=search]').setValue('R-002');expect(w.find('tbody').text()).toContain('Parent Two');expect(w.find('tbody').text()).not.toContain('Parent One');expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
});
