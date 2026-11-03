import { reactive } from 'vue';
import { mount, shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingWorkspaceView from '../BillingWorkspaceView.vue';
import api from '../../../services/api';
import { billingTotals } from '../../../utils/billingWorkspace';
import { canAccessBillingWorkspace } from '../../../config/medicalBillingAccess';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 1, name: 'Management Agency' } }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 5, role: 'support', first_name: 'Test', last_name: 'Biller' } }) }));
const mockRoute = vi.hoisted(() => ({query:{},meta:{}}));
const router=vi.hoisted(()=>({replace:vi.fn(),push:vi.fn()}));
vi.mock('vue-router', () => ({ useRoute: () => mockRoute, useRouter: () => router }));
vi.mock('../../../components/billing/BillingFeeSchedule.vue',()=>({default:{name:'BillingFeeSchedule',props:['agencyId','agencyName','serviceCodesPath','initialMode','initialScope','initialProviderId','initialPayerId','initialCategoryKey'],emits:['context-change'],template:'<section data-testid="fee-schedules">Fee schedules for {{ agencyName }}</section>'}}));
vi.mock('../../../components/admin/ClaimMdWorkspace.vue', () => ({ default: { props: ['agencyId'], template: '<div data-testid="claim-tools">Claim tools for {{ agencyId }}</div>', methods: { showHistory: vi.fn(), editClaim: vi.fn(), reviewClaim: vi.fn() } } }));
vi.mock('../../../components/admin/MedicalBillingReportsPanel.vue', () => ({ default: { template: '<div>Company reports</div>' } }));
vi.mock('../MedicalBillingView.vue', () => ({ default: { template: '<div>Company settings</div>' } }));
vi.mock('../../../components/billing/RemittanceWorkspace.vue', () => ({default:{props:['agencyId','agencyName'],template:'<div data-testid="remittances">Payments for {{ agencyName }}</div>'}}));
vi.mock('../../../components/admin/CallBillingQueue.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/admin/PlannedBillingServices.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/billing/ClientPendingTasks.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/billing/PayerEftPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/billing/BankFeedPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/billing/InsuranceVerificationQueue.vue',()=>({default:{props:['agencyId','clientId'],template:'<div data-testid="insurance-verification">Coverage tasks for {{ agencyId }} client {{ clientId }}</div>'}}));
vi.mock('../../../components/billing/InsuranceCardTasks.vue',()=>({default:{props:['agencyId'],template:'<div data-testid="insurance-followup">Insurance follow-up for {{ agencyId }}</div>'}}));
const data = () => ({ organizations: [{ id: 1, name: 'Company One', colors: { primary: '#23564f' }, counts: { ready: 4, submitted: 2 }, connection: { configured: true, mode: 'disabled' }, enrollments: [] }, { id: 3, name: 'Company Three', counts: { rejected: 2 }, connection: { configured: false }, enrollments: [] }], claims: [{ id: 8, agency_id: 1, client_id: 12, clinical_note_id: 10, claim_lifecycle: 'submitted', amount_cents: 10000 }], total: 1, capabilities: { claims: true, enrollments: true, paymentPosting: false }, updatedAt: '2026-09-24T12:00:00Z' });
const button = (w, text) => w.findAll('button').find(b => b.text() === text);
beforeEach(() => { mockRoute.query={}; mockRoute.meta={}; vi.clearAllMocks(); localStorage.clear(); api.get.mockResolvedValue({ data: data() }); });
describe('billing workspace', () => {
  it('mounts the canonical fee schedule from a provider deep link with the correct practice and payer',async()=>{
    mockRoute.query={billingSection:'fee-schedules',billingScope:'3',feeMode:'self_pay',feeScope:'provider',feeProviderId:'22',feePayerId:'SAVED',feeCategory:'licensed'};
    const payload=data();payload.organizations[1].slug='practice-three';api.get.mockResolvedValue({data:payload});
    const w=mount(BillingWorkspaceView);await flushPromises();const fees=w.findComponent({name:'BillingFeeSchedule'});
    expect(fees.props()).toMatchObject({agencyId:3,agencyName:'Company Three',initialMode:'self_pay',initialScope:'provider',initialProviderId:22,initialPayerId:'SAVED',initialCategoryKey:'licensed',serviceCodesPath:'/practice-three/admin/settings?agencyId=3&category=general&item=service-codes'});
    expect(api.get.mock.calls.filter(([path])=>path==='/medical-billing/workspace')[0][1].params.agencyId).toBe('3');
    fees.vm.$emit('context-change',{mode:'insurance',scope:'payer',payerId:'COCHA',providerUserId:0,categoryKey:''});await flushPromises();
    expect(router.replace).toHaveBeenLastCalledWith({query:expect.objectContaining({billingSection:'fee-schedules',billingScope:'3',feeMode:'insurance',feeScope:'payer',feePayerId:'COCHA',feeProviderId:undefined,feeCategory:undefined})});w.unmount();
  });
  it('requires a practice before mounting rates and resets the mounted fee schedule when practice changes',async()=>{
    mockRoute.query={billingSection:'fee-schedules'};const w=mount(BillingWorkspaceView);await flushPromises();expect(w.findComponent({name:'BillingFeeSchedule'}).exists()).toBe(false);expect(w.text()).toContain('Select a practice');
    await w.find('[data-testid="organization-scope"]').setValue('1');await flushPromises();const original=w.findComponent({name:'BillingFeeSchedule'});expect(original.props('agencyId')).toBe(1);
    await w.find('[data-testid="organization-scope"]').setValue('3');await flushPromises();const changed=w.findComponent({name:'BillingFeeSchedule'});expect(changed.props('agencyId')).toBe(3);expect(changed.vm).not.toBe(original.vm);w.unmount();
  });
  it('starts with all authorized companies and distinguishes accepted claims from payment', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    expect(api.get.mock.calls[0][1].params.agencyId).toBeUndefined();
    expect(w.text()).toContain('Cross-company work queue'); expect(w.text()).toContain('Company Three');
    expect(w.text()).toContain('Accepted does not mean paid'); expect(w.text()).not.toContain('Payments posted');
    expect(w.text()).toContain('Signed in as Test Biller'); w.unmount();
  });
  it('opens the sole authorized agency directly, even when it differs from the login agency', async () => {
    const payload = data(); payload.organizations = [payload.organizations[1]];
    payload.claims = [{ ...payload.claims[0], agency_id: 3 }];
    api.get.mockResolvedValue({ data: payload });
    const w = mount(BillingWorkspaceView); await flushPromises();
    expect(api.get.mock.calls.filter(([path]) => path === '/medical-billing/workspace').map(([, options]) => options.params.agencyId)).toEqual([undefined, '3']);
    expect(w.find('[data-testid="organization-scope"]').exists()).toBe(false);
    expect(w.find('.company-panel').exists()).toBe(false);
    expect(w.find('.scope-context').text()).toContain('Company Three');
    expect(w.find('.scope-context').text()).toContain('Signed in as Test Biller');
    expect(w.find('[data-testid="insurance-followup"]').text()).toContain('for 3');
    expect(w.text()).toContain('Claim work queue');
    expect(w.text()).not.toContain('Cross-company');
    expect(w.findAll('th').map(th => th.text())).not.toContain('Organization');
    await button(w, 'Claims').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="claim-tools"]').text()).toContain('Claim tools for 3');
    await button(w, 'Payments').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="remittances"]').text()).toContain('Company Three');
    w.unmount();
  });
  it('opens single-agency settings without another company chooser', async () => {
    const payload = data(); payload.organizations = [payload.organizations[0]];
    api.get.mockResolvedValue({ data: payload });
    mockRoute.query = { billingSection: 'settings', billingScope: 'all' };
    const w = shallowMount(BillingWorkspaceView); await flushPromises();
    expect(w.findAll('select')).toHaveLength(0);
    expect(w.find('medical-billing-view-stub').attributes('billing-agency-id')).toBe('1');
    expect(w.text()).not.toContain('Choose a company');
    w.unmount();
  });
  it('keeps an old all-company saved view scoped to the sole authorized agency', async () => {
    localStorage.setItem('billing-views:5', JSON.stringify([{ id: 1, name: 'Old all-company view', scope: 'all', status: 'all' }]));
    const payload = data(); payload.organizations = [payload.organizations[0]];
    api.get.mockResolvedValue({ data: payload });
    const w = mount(BillingWorkspaceView); await flushPromises();
    await button(w, 'Reports').trigger('click'); await flushPromises();
    api.get.mockClear();
    await button(w, 'Old all-company view').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="claim-tools"]').text()).toContain('Claim tools for 1');
    expect(api.get.mock.calls.filter(([path]) => path === '/medical-billing/workspace').every(([, options]) => options.params.agencyId === '1')).toBe(true);
    w.unmount();
  });
  it('clears the sole agency if its scoped refresh is denied', async () => {
    const payload = data(); payload.organizations = [payload.organizations[0]];
    api.get.mockResolvedValueOnce({ data: payload }).mockRejectedValue({ response: { data: { error: { message: 'Access denied' } } } });
    const w = mount(BillingWorkspaceView); await flushPromises();
    expect(w.text()).toContain('Access denied');
    expect(w.text()).not.toContain('Company One');
    expect(w.text()).not.toContain('Claim #8');
    expect(w.find('.scope-bar').exists()).toBe(false);
    w.unmount();
  });
  it('identifies the billing manager without changing the treating company or signed-in identity', async () => {
    const payload = data(); payload.organizations[0].billingManager = {id:17,name:'Plot Twist Co'};
    api.get.mockResolvedValue({data:payload});
    const w = mount(BillingWorkspaceView); await flushPromises();
    expect(w.text()).toContain('Billing managed by Plot Twist Co');
    expect(w.text()).toContain('Company One'); expect(w.text()).toContain('Signed in as Test Biller');
    expect(w.find('[data-testid="organization-scope"]').text()).toContain('All authorized companies'); w.unmount();
  });
  it('keeps company details in the cross-company context, then drills into a selected company', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    await w.find('[aria-label="View Company One billing details"]').trigger('click');
    expect(w.find('[aria-label="Company billing details"]').exists()).toBe(true);
    expect(w.find('[data-testid="organization-scope"]').element.value).toBe('all');
    await button(w, 'Work in Company One').trigger('click'); await flushPromises();
    expect(api.get.mock.calls.filter(([path])=>path==='/medical-billing/workspace').at(-1)[1].params.agencyId).toBe('1');
    expect(w.attributes('style')).toContain('--bw-brand: #1555b0'); expect(w.find('.brand-lockup').text()).toContain('AuricWell'); expect(w.find('.scope-context').text()).toContain('Company One'); w.unmount();
  });
  it('discards stale scope responses instead of replacing the current agency data', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    let resolveOld; api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await w.find('[data-testid="organization-scope"]').setValue('1'); await flushPromises();
    api.get.mockResolvedValue({ data: { ...data(), claims: [{ id: 99, agency_id: 3, client_id: 90, claim_lifecycle: 'draft' }] } });
    await w.find('[data-testid="organization-scope"]').setValue('3'); await flushPromises();
    resolveOld({ data: data() }); await flushPromises();
    expect(w.text()).toContain('Claim #99'); expect(w.text()).not.toContain('Claim #8'); w.unmount();
  });
  it('passes the selected practice to the shared remittance workspace', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    await w.find('[data-testid="organization-scope"]').setValue('1'); await flushPromises();
    await button(w, 'Payments').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="remittances"]').text()).toContain('Company One');
    expect(w.text()).not.toContain('Payments for Company Three'); w.unmount();
  });
  it('honors the hub link to the existing claims section and practice', async () => {
    mockRoute.query = { billingScope: '3', billingSection: 'claims' };
    const w = mount(BillingWorkspaceView); await flushPromises();
    expect(api.get.mock.calls.filter(([path]) => path === '/medical-billing/workspace')[0][1].params.agencyId).toBe('3');
    expect(w.find('h1').text()).toBe('Claims');
    expect(w.find('[data-testid="organization-scope"]').element.value).toBe('3');
    expect(w.find('.brand-lockup').text()).toContain('AuricWell');
    w.unmount();
  });
  it('locks AuricWell to the server-selected practice',async()=>{
    mockRoute.meta={auricwellPreview:true};mockRoute.query={billingScope:'3'};
    const w=mount(BillingWorkspaceView);await flushPromises();
    expect(api.get.mock.calls[0][1].params.agencyId).toBe('1');
    expect(w.find('[data-testid="organization-scope"]').exists()).toBe(false);
    w.unmount();
  });
  it('clears financial results after an authorization failure', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    api.get.mockRejectedValue({ response: { data: { error: { message: 'Access denied' } } } });
    await button(w, 'Refresh').trigger('click'); await flushPromises();
    expect(w.text()).toContain('Access denied'); expect(w.text()).not.toContain('Claim #8'); w.unmount();
  });
  it('unknown claim data stays unknown and submitted is never counted as paid', () => {
    expect(billingTotals([{ counts: null }])).toBeNull();
    expect(billingTotals(data().organizations)).toMatchObject({ paid: 0, progress: 2 });
  });
  it('allows a delegated management biller to enter without billing permission on the login organization', () => {
    expect(canAccessBillingWorkspace({ role: 'support', billingAgencyIds: [377] })).toBe(true);
    expect(canAccessBillingWorkspace({ role: 'support', billingAgencyIds: [] })).toBe(false);
    expect(canAccessBillingWorkspace({ role: 'admin', billingAgencyIds: [] })).toBe(false);
    expect(canAccessBillingWorkspace({ role: 'admin', billingAgencyIds: [2] })).toBe(true);
    expect(canAccessBillingWorkspace({ role: 'super_admin', billingAgencyIds: [] })).toBe(true);
    expect(canAccessBillingWorkspace({ role: 'provider', billingAgencyIds: [377] })).toBe(false);
    expect(canAccessBillingWorkspace({ role: 'provider_plus', billingAgencyIds: [377] })).toBe(false);
  });
});


describe('unified clinical and claim workflow', () => {
  it('shows every lifecycle filter and sends organization sorting to the whole result set', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    expect(api.get.mock.calls[0][1].params.status).toBe('all');
    const filters = w.findAll('.queue-tabs button').map(b=>b.text());
    expect(filters).toEqual(expect.arrayContaining(['All claims','Note needed','Draft','Pending review','Revisions needed','Ready to submit','Submitted','Processing','Paid','Denied','On hold','Closed']));
    await w.findAll('.claim-work-table th button').find(b=>b.text().startsWith('Organization')).trigger('click'); await flushPromises();
    expect(api.get.mock.calls.filter(([url])=>url==='/medical-billing/workspace').at(-1)[1].params).toMatchObject({sortBy:'organization',direction:'asc'});
    w.unmount();
  });
  it('opens an unsigned clinical draft in a visible read-only drawer', async () => {
    const payload=data();payload.claims=[{id:null,key:'draft:16',source:'draft',agency_id:1,client_id:12,client_name:'DEMO QA Client',draft_id:16,stage:'draft',readOnly:true,canReviewClaim:false}];
    api.get.mockResolvedValue({data:payload});const w=mount(BillingWorkspaceView);await flushPromises();
    await button(w,'Draft #16').trigger('click');await flushPromises();
    const drawer=w.find('[role="dialog"]');expect(drawer.exists()).toBe(true);expect(drawer.text()).toContain('The clinician’s note is in progress');
    expect(drawer.text()).not.toContain('Edit billing fields');expect(drawer.text()).not.toContain('Review for submission');expect(drawer.find('[data-testid="claim-tools"]').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
    w.unmount();
  });
  it('opens an approved note as a claim for review without transmitting it', async () => {
    const payload=data();payload.claims=[{id:null,key:'note:71',source:'note',agency_id:1,client_id:12,client_name:'DEMO QA Client',clinical_note_id:71,clinical_session_id:9,stage:'ready_to_submit',canPrepareClaim:true,readOnly:false}];
    api.get.mockResolvedValue({data:payload});api.post.mockResolvedValue({data:{claim:{id:25,claim_lifecycle:'draft'}}});const w=mount(BillingWorkspaceView);await flushPromises();
    await button(w,'Note #71').trigger('click');await flushPromises();await button(w,'Review ready claim').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claims',{agencyId:1,clientId:12,clinicalSessionId:9,clinicalNoteId:71},{skipGlobalLoading:true});expect(w.find('[role="dialog"]').text()).toContain('Claim #25');expect(api.post.mock.calls.some(([url])=>url.endsWith('/submit'))).toBe(false);
    w.unmount();
  });
  it('opens insurance verification directly in the selected billing scope', async () => {
    const w=mount(BillingWorkspaceView);await flushPromises();await w.find('[data-testid="organization-scope"]').setValue('3');await flushPromises();await button(w,'Insurance verification').trigger('click');await flushPromises();expect(w.find('[data-testid="insurance-verification"]').text()).toContain('for 3');w.unmount();
  });
});

it('follows a task deep link without remounting the billing workspace',async()=>{mockRoute.query=reactive({});const w=mount(BillingWorkspaceView);await flushPromises();Object.assign(mockRoute.query,{billingSection:'insurance',agencyId:'3',clientId:'22'});await flushPromises();expect(w.find('h1').text()).toBe('Insurance verification');expect(w.find('[data-testid=insurance-verification]').text()).toContain('for 3 client 22');expect(api.get.mock.calls.filter(([path])=>path==='/medical-billing/workspace').at(-1)[1].params).toEqual(expect.objectContaining({agencyId:'3',clientId:'22'}));w.unmount();});
