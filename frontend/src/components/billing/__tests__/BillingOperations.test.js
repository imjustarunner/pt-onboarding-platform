import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import ClaimSubmissionSnapshot from '../ClaimSubmissionSnapshot.vue';
import ClaimWorkTable from '../ClaimWorkTable.vue';
import RemittanceWorkspace from '../RemittanceWorkspace.vue';
import api from '../../../services/api';
import {groupBillingPayers} from '../../../utils/billingPayerConnections.js';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();});

describe('claim visibility',()=>{
  it('shows one organization/payer across offices and NPIs and includes saved routes without enrollment',()=>{
    const organization={id:2,payers:[{payerId:'ROUTE',payerName:'Colorado Access'},{payerId:'OTHER',payerName:'Other payer'}],billingOffices:[{id:8,name:'Windchime'},{id:9,street_address:'123 Example Street'}],enrollments:[{officeId:8,providerNpi:'1111111111',payerId:'ROUTE',type:'1500',status:'started'},{officeId:9,providerNpi:'2222222222',payerId:'ROUTE',type:'1500',status:'requested'},{officeId:8,providerNpi:'1111111111',payerId:'ROUTE',type:'era',status:'started'}]};
    const rows=groupBillingPayers([organization]),row=rows.find(row=>row.payerId==='ROUTE');expect(rows).toHaveLength(2);expect(row).toMatchObject({payerName:'Colorado Access',npiCount:2,officeNames:['Windchime','123 Example Street'],claims:'Varies by billing NPI — manage to review'});expect(rows.find(row=>row.payerId==='OTHER').claims).toBe('Not configured');
  });
  it('offers a sortable submitted date, Provider label and visible date mismatch',async()=>{
    const w=mount(ClaimWorkTable,{props:{items:[{id:1,agency_id:2,client_id:3,date_of_service:'2026-11-17',claimmd_submitted_at:'2026-11-16T20:00:00Z',service_date_mismatch:true,encounter_date_of_service:'2026-11-16'}]}});
    const labels=w.findAll('.column-picker label');expect(labels.map(l=>l.text())).toContain('Provider');expect(labels.map(l=>l.text())).not.toContain('Clinician');
    await labels.find(l=>l.text()==='Submitted date').find('input').setValue(true);
    expect(w.text()).toContain('11/16/2026, 1:00 PM MST');expect(w.text()).toContain('Date needs review · encounter Nov 16, 2026');
    await w.findAll('th button').find(b=>b.text().startsWith('Submitted date')).trigger('click');expect(w.emitted('sort')).toEqual([['claimmd_submitted_at']]);w.unmount();
  });
  it('preserves provider roles, modifiers, facility and all approved fields in a read-only snapshot',()=>{
    const payload={pat_name_f:'DEMO',pat_name_l:'Patient',prov_name_f:'Overseeing',prov_name_l:'Provider',prov_npi:'1234567893',bill_name:'Synthetic practice',bill_npi:'1215615711',facility_name:'Submitted facility',diag_1:'R69',custom_field:'Extra submitted value',charge:[{proc_code:'H0002',mod1:'U9',from_date:'2026-11-16',units:1,place_of_service:'10',charge:'30.00',chg_supv_prov_npi:'1234567893'}]};
    const w=mount(ClaimSubmissionSnapshot,{props:{payload,supervision:{serviceProvider:{firstName:'Treating',lastName:'Provider'}}}});
    expect(w.text()).toContain('Treating Provider');expect(w.text()).toContain('Overseeing Provider');expect(w.text()).toContain('U9');expect(w.text()).toContain('Submitted facility');expect(w.text()).toContain('Extra submitted value');expect(w.findAll('input,button,form')).toHaveLength(0);w.unmount();
  });
});

describe('ERA workspace',()=>{
  const rows=[{id:1,eraId:'101',payerName:'Synthetic payer',paymentType:'eft',trace:'PAY-101',paidDate:'2026-11-12',receivedDate:'2026-11-13',importedAt:'2026-11-14T01:00:00Z',paidCents:8000,claimCount:75,status:'review'}];
  const data=()=>({rows,total:75,page:1,pageSize:50,totals:{paidCents:0,adjustmentCents:0},pendingBalances:0,options:{statuses:['review'],paymentTypes:['eft']}});
  it('sends search, type and sort to the server and paginates with the same filters',async()=>{
    api.get.mockResolvedValue({data:data()});const w=mount(RemittanceWorkspace,{props:{agencyId:2,agencyName:'Synthetic practice'}});await flushPromises();
    expect(w.text()).toContain('EFT');expect(w.text()).toContain('Nov 12, 2026');expect(w.text()).toContain('Nov 13, 2026');expect(w.text()).toContain('11/13/2026, 6:00 PM MST');
    await w.find('input[type=search]').setValue('CLAIM-42');await w.find('select').setValue('eft');await w.find('form.era-filters').trigger('submit');await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/medical-billing/claimmd/remittances',{params:expect.objectContaining({agencyId:2,search:'CLAIM-42',paymentType:'eft',page:1})});
    await w.findAll('th button').find(b=>b.text().startsWith('Amount')).trigger('click');await flushPromises();
    expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({search:'CLAIM-42',sortBy:'paidCents',direction:'asc',page:1});
    await w.findAll('button').find(b=>b.text()==='Next').trigger('click');await flushPromises();expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({page:2,search:'CLAIM-42',sortBy:'paidCents'});w.unmount();
  });
  it('clears prior agency results and ignores a late response after the agency changes',async()=>{
    let resolveFirst;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;})).mockResolvedValue({data:{...data(),rows:[],total:0}});
    const w=mount(RemittanceWorkspace,{props:{agencyId:2,agencyName:'First practice'}});await w.setProps({agencyId:3,agencyName:'Second practice'});await flushPromises();resolveFirst({data:data()});await flushPromises();expect(w.text()).not.toContain('PAY-101');expect(w.text()).toContain('Payments for Second practice');w.unmount();
  });
});
