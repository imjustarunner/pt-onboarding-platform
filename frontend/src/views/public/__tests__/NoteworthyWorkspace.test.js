import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Workspace from '../../NoteworthyWorkspaceView.vue';

const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),put:vi.fn(),setCurrentAgency:vi.fn(),logout:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get,post:mocks.post,patch:mocks.patch,put:mocks.put}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,logout:mocks.logout})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({setCurrentAgency:mocks.setCurrentAgency})}));
const wrappers=[];
const owner={agencyId:71,name:'Example Therapy',slug:'example-therapy',role:'owner'};
const employee={agencyId:72,name:'Another Practice',slug:'another-practice',role:'employee'};
let fixture;
const clone=data=>({data:structuredClone(data)});
function respondGet(path){
  if(path==='/noteworthy/workspace')return Promise.resolve(clone({practices:fixture.practices}));
  if(path.endsWith('/activation'))return Promise.resolve(clone(fixture.activation));
  if(path.endsWith('/roster'))return Promise.resolve(clone({employees:fixture.employees}));
  if(path.endsWith('/rate-defaults'))return Promise.resolve(clone({defaults:[]}));
  if(path==='/payroll/periods')return Promise.resolve(clone(fixture.periods));
  if(path.endsWith('/me/paystubs'))return Promise.resolve(clone({paystubs:fixture.paystubs}));
  throw new Error(`Unexpected mocked GET ${path}`);
}
async function render(path='/fundthred/noteworthy/app/71'){
  const router=createRouter({history:createMemoryHistory(),routes:[
    {path:'/fundthred/noteworthy/app/:agencyId?',name:'NoteworthyWorkspace',component:Workspace},
    {path:'/fundthred/noteworthy/app/:agencyId/agreements',name:'NoteworthyAgreements',component:Workspace},
    {path:'/fundthred/noteworthy/app/:agencyId/payroll/:periodId?',name:'NoteworthyPayroll',component:Workspace},
    {path:'/:pathMatch(.*)*',component:{template:'<div/>'}}
  ]});
  await router.push(path);await router.isReady();
  const wrapper=mount(Workspace,{global:{plugins:[router],stubs:{PayrollWizardView:true,OrganizationAgreementsView:true}}});wrappers.push(wrapper);
  await flushPromises();return {wrapper,router};
}
beforeEach(()=>{
  for(const mock of Object.values(mocks))mock.mockReset();
  fixture={practices:[owner,employee],activation:{canImport:false,requirements:[{id:'baa',label:'Execute your practice BAA'}]},employees:[{userId:101,firstName:'Alex',lastName:'Example',credential:'LPC',email:'alex@example.test',missingServiceCodes:['90837'],portalActive:false}],periods:[{id:801,period_start:'2026-11-01',period_end:'2026-11-14',status:'draft'}],paystubs:[{id:901,periodStart:'2026-10-24',periodEnd:'2026-11-06',postedAt:'2026-11-11',totalAmount:624,subtotalAmount:624,adjustmentsAmount:0,lines:[{serviceCode:'90837',units:12,rateAmount:52,amount:624}]}]};
  mocks.get.mockImplementation(respondGet);mocks.post.mockResolvedValue({data:{}});mocks.patch.mockResolvedValue({data:{}});mocks.put.mockResolvedValue({data:{}});
});
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();vi.restoreAllMocks();});

describe('NoteWorthy protected practice workspace',()=>{
  it('shows setup and legal activation requirements before any real report import',async()=>{
    const {wrapper}=await render();
    expect(wrapper.text()).toContain('Example Therapy');
    expect(wrapper.text()).toContain('Setup in progress');
    expect(wrapper.text()).toContain('Execute your practice BAA');
    expect(wrapper.find('payroll-wizard-view-stub').exists()).toBe(false);
    expect(wrapper.find('input[type=file]').exists()).toBe(false);
    expect(mocks.setCurrentAgency).toHaveBeenCalledWith(expect.objectContaining({id:71,has_payroll_access:true}));
  });
  it('keeps the payroll wizard blocked even if an unactivated owner opens its direct route',async()=>{
    const {wrapper}=await render('/fundthred/noteworthy/app/71/payroll/801');
    expect(wrapper.find('payroll-wizard-view-stub').exists()).toBe(false);
    expect(wrapper.text()).toContain('Secure data activation');
  });
  it('records an activation request only for the selected authorized practice',async()=>{
    mocks.post.mockResolvedValue({data:{canImport:false,requestedAt:'2026-11-11'}});
    const {wrapper}=await render();
    const form=wrapper.get('form');
    await form.get('input[autocomplete=organization]').setValue('Example Therapy LLC');
    await form.get('textarea[autocomplete=street-address]').setValue('123 Example Street, Denver, CO 80201');
    await form.trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/noteworthy/practices/71/activation-request',{legalName:'Example Therapy LLC',legalAddress:'123 Example Street, Denver, CO 80201'},expect.objectContaining({headers:{'X-Noteworthy-Request':'1'},skipGlobalLoading:true}));
    expect(wrapper.text()).toContain('Your activation review request is saved.');
    expect(wrapper.findAll('button').some(button=>button.text()==='Request activation review')).toBe(false);
  });
  it('refreshes activation when the review becomes active',async()=>{
    const {wrapper}=await render();fixture.activation.canImport=true;
    await wrapper.findAll('button').find(button=>button.text()==='Refresh activation status').trigger('click');await flushPromises();
    expect(wrapper.text()).toContain('Data access active');
  });
  it('saves employee details with an explicit dated rate and keeps invitation separate',async()=>{
    const {wrapper}=await render('/fundthred/noteworthy/app/71?tab=team');
    await wrapper.findAll('button').find(button=>button.text()==='Edit & review').trigger('click');
    const form=wrapper.get('form.nw-rate-editor');
    await form.get('input[type=email]').setValue('alex.updated@example.test');
    await form.get('input[aria-label="Rate 1"]').setValue('52');
    await form.get('input[aria-label="Effective date 1"]').setValue('2026-11-01');
    await form.trigger('submit');await flushPromises();
    expect(mocks.patch).toHaveBeenCalledWith('/noteworthy/practices/71/roster/101',expect.objectContaining({email:'alex.updated@example.test',credential:'LPC',rates:[expect.objectContaining({serviceCode:'90837',rateAmount:'52',rateUnit:'per_unit',effectiveStart:'2026-11-01'})]}),expect.any(Object));
    expect(mocks.post).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Existing pay history is retained.');
  });
  it('sends an employee invitation only from its explicit action',async()=>{
    mocks.post.mockResolvedValue({data:{invitationSent:true}});
    const {wrapper}=await render('/fundthred/noteworthy/app/71?tab=team');
    await wrapper.findAll('button').find(button=>button.text()==='Edit & review').trigger('click');
    expect(mocks.post).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button=>button.text()==='Send portal invitation').trigger('click');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/noteworthy/practices/71/roster/101/invite',{confirm:true},expect.any(Object));
    expect(wrapper.text()).toContain('Portal invitation sent.');
  });
  it('shows the most recent saved rate per code with its dated history before editing',async()=>{
    fixture.employees[0].missingServiceCodes=['H0031'];
    fixture.employees[0].rates=[
      {serviceCode:'90837',rateAmount:52,rateUnit:'per_unit',effectiveStart:'2026-11-01T00:00:00.000Z'},
      {serviceCode:'90837',rateAmount:48,rateUnit:'per_unit',effectiveStart:'2026-10-01T00:00:00.000Z'}
    ];
    const {wrapper}=await render('/fundthred/noteworthy/app/71?tab=team');
    await wrapper.findAll('button').find(button=>button.text()==='Edit & review').trigger('click');
    expect(wrapper.get('input[aria-label="Service code 1"]').element.value).toBe('90837');
    expect(wrapper.get('input[aria-label="Rate 1"]').element.value).toBe('52');
    expect(wrapper.get('input[aria-label="Effective date 1"]').element.value).toBe('2026-11-01');
    expect(wrapper.get('input[aria-label="Service code 2"]').element.value).toBe('H0031');
    expect(wrapper.findAll('input[aria-label^="Rate "]')).toHaveLength(2);
  });
  it('limits an employee to their own posted statements and skips all administrative data calls',async()=>{
    const {wrapper}=await render('/fundthred/noteworthy/app/72');
    expect(wrapper.text()).toContain('Your posted statements');expect(wrapper.text()).toContain('$624.00');
    expect(wrapper.text()).toContain('90837');expect(wrapper.find('nav').exists()).toBe(false);
    expect(mocks.get.mock.calls.map(call=>call[0])).toEqual(['/noteworthy/workspace','/noteworthy/practices/72/me/paystubs']);
    expect(mocks.setCurrentAgency).toHaveBeenCalledWith(expect.objectContaining({id:72,has_payroll_access:false}));
  });
  it('rejects a practice outside the authorized list without falling back to another practice',async()=>{
    const {wrapper}=await render('/fundthred/noteworthy/app/999');
    expect(wrapper.get('[role=alert]').text()).toContain('not available to your account');
    expect(mocks.get.mock.calls.map(call=>call[0])).toEqual(['/noteworthy/workspace','/noteworthy/practices/999/lifecycle']);
    expect(mocks.setCurrentAgency).not.toHaveBeenCalled();
  });
  it('does not display late owner data after switching to a different employee practice',async()=>{
    let resolve;mocks.get.mockImplementation(path=>path==='/noteworthy/practices/71/activation'?new Promise(done=>{resolve=done;}):respondGet(path));
    const {wrapper,router}=await render();
    await router.push('/fundthred/noteworthy/app/72');await flushPromises();
    expect(wrapper.text()).toContain('Your posted statements');
    resolve({data:{canImport:true}});await flushPromises();
    expect(wrapper.text()).toContain('Another Practice');
    expect(wrapper.find('nav').exists()).toBe(false);expect(wrapper.text()).not.toContain('Data access active');
  });
});
