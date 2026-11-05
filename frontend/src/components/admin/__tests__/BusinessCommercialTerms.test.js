// Synthetic catalog selections exercise company pricing without live identities.
import { beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Terms from '../BusinessCommercialTerms.vue';
import Catalog from '../ManagementServiceCatalog.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
const included=['organization-platform','bookkeeping','marketing-management'];
const service=(id,name,amountCents,includedInManagement=false)=>({id,name,amountCents,category:'management',cadence:'monthly',rateBps:0,discountEligible:true,includedInManagement,businessTypes:['coaching'],notes:''});
const catalog=()=>({managedDiscountBps:2000,services:[
  service('organization-platform','Organization Platform',8000,true),service('bookkeeping','Bookkeeping',12000,true),
  service('marketing-management','Marketing management',15000,true),service('full-management','Full management package',20000),
  service('website-marketing-hub','Optional website support',6000)
]});
const saved=(id,amountCents=1000)=>({id,name:`Sample ${id}`,amountCents,cadence:'monthly',month:'',separateFromManagement:id.startsWith('website-')});
const state=(services=[])=>reactive({agreements:[{startMonth:'2026-01',endMonth:'',status:'draft',signedOn:'',contractReference:'',revenueBasis:'Sample collected revenue',mode:'a_la_carte',revenueShareBps:1000,thresholdCents:0,platformIncluded:false,services}],revenue:[]});
const button=(wrapper,text)=>wrapper.findAll('button').find(item=>item.text()===text);
async function open(modelValue){const wrapper=mount(Terms,{props:{modelValue,canEdit:true}});await flushPromises();return wrapper;}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{catalog:catalog(),categories:[{key:'management',label:'Management services'}],revision:1,canEdit:false}});});
it('uses the selected Organization Platform price while marking the existing platform base as included',async()=>{
  const model=state(),wrapper=await open(model);await button(wrapper,'Add Organization Platform to this agreement').trigger('click');
  expect(model.agreements[0].platformIncluded).toBe(true);
  expect(model.agreements[0].services).toHaveLength(1);expect(model.agreements[0].services[0]).toMatchObject({name:'Organization Platform',amountCents:6400});
  expect(api.put).not.toHaveBeenCalled();wrapper.unmount();
});
it('replaces previously selected included services with full management while preserving the optional website',async()=>{
  const website=saved('website-marketing-hub-existing',4800);
  const model=state([saved('organization-platform'),saved('bookkeeping-existing'),saved('marketing-management'),website]);
  const wrapper=await open(model);await button(wrapper,'Add Full management package to this agreement').trigger('click');
  expect(model.agreements[0]).toMatchObject({platformIncluded:true,mode:'higher_of',revenueShareBps:1000});
  expect(model.agreements[0].services).toHaveLength(2);expect(model.agreements[0].services).toContainEqual(website);
  expect(model.agreements[0].services.find(item=>item.id.startsWith('full-management-'))).toMatchObject({amountCents:16000});
  for(const id of included)expect(model.agreements[0].services.some(item=>item.id===id||item.id.startsWith(`${id}-`))).toBe(false);
  wrapper.unmount();
});
it('replaces an existing exact-ID management service instead of stacking a second package',async()=>{
  const website=saved('website-marketing-hub-existing',4800),model=state([saved('full-management',16000),website]);
  const wrapper=await open(model);await button(wrapper,'Add Full management package to this agreement').trigger('click');
  expect(model.agreements[0].services.filter(item=>item.id==='full-management'||item.id.startsWith('full-management-'))).toHaveLength(1);
  expect(model.agreements[0].services).toHaveLength(2);expect(model.agreements[0].services).toContainEqual(website);wrapper.unmount();
});
it('rejects a stale included-service selection after management is selected and still accepts an optional website',async()=>{
  const model=state([saved('full-management',16000)]),wrapper=await open(model),child=wrapper.findComponent(Catalog);
  expect(child.props('managementSelected')).toBe(true);
  child.vm.$emit('select',{...saved('bookkeeping-stale',9600),catalogServiceId:'bookkeeping',catalogIncludedInManagement:true,includedCatalogIds:[]});await flushPromises();
  expect(model.agreements[0].services).toHaveLength(1);
  await button(wrapper,'Add Optional website support to this agreement').trigger('click');
  expect(model.agreements[0].services).toHaveLength(2);expect(model.agreements[0].services[1]).toMatchObject({name:'Optional website support',amountCents:4800,separateFromManagement:true});wrapper.unmount();
});
it.each([
  ['Organization Platform','organization-platform',false,6400],
  ['Optional website support','website-marketing-hub',true,4800]
])('replaces a repeated %s selection instead of adding its price twice',async(name,id,withManagement,amountCents)=>{
  const model=state(withManagement?[saved('full-management',16000)]:[]),wrapper=await open(model);
  await button(wrapper,`Add ${name} to this agreement`).trigger('click');
  await button(wrapper,`Add ${name} to this agreement`).trigger('click');
  const matching=model.agreements[0].services.filter(item=>item.id===id||item.id.startsWith(`${id}-`));
  expect(matching).toHaveLength(1);expect(matching[0].amountCents).toBe(amountCents);
  expect(model.agreements[0].services).toHaveLength(withManagement?2:1);wrapper.unmount();
});
