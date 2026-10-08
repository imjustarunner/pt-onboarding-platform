import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import BusinessCardsDialog from '../BusinessCardsDialog.vue';
import { businessCardsPdf, downloadCardFile } from '../../../utils/businessCardsExport';
import { nextTick } from 'vue';
const api=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../utils/businessCardFonts',()=>({loadBusinessCardFonts:vi.fn(async()=>({}))}));
vi.mock('../../../utils/businessCardsExport',()=>({embedCardLogo:vi.fn(async()=>''),businessCardsPdf:vi.fn(),downloadCardFile:vi.fn()}));
const wrappers=[];
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=vi.fn();api.get.mockImplementation(async path=>({data:{agency:{id:Number(path.split('/')[2]),name:'Only agency'},people:[],canManage:false}}));});
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());document.body.innerHTML='';});
describe('affiliated agency selection',()=>{
 it('automatically chooses the sole affiliation and hides the selector, even with an unrelated initial ID',async()=>{
  const wrapper=mount(BusinessCardsDialog,{props:{agencies:[{id:6,name:'Next Level Up'}],initialAgencyId:999,selfOnly:true},attachTo:document.body});wrappers.push(wrapper);await flushPromises();
  expect(document.querySelector('select[aria-label="Organization"]')).toBeNull();
  expect(document.querySelector('.card-organization').textContent).toContain('Next Level Up');
  expect(api.get.mock.calls[0][0]).toBe('/agencies/6/business-cards');
 });
 it('offers only the returned affiliations for someone with multiple agencies',async()=>{
  const wrapper=mount(BusinessCardsDialog,{props:{agencies:[{id:2,name:'ITSCO'},{id:6,name:'Next Level Up'}],initialAgencyId:2,selfOnly:true},attachTo:document.body});wrappers.push(wrapper);await flushPromises();
  const select=document.querySelector('select[aria-label="Organization"]');expect([...select.options].map(o=>o.value)).toEqual(['','2','6']);
 });
});

describe('group and department cards',()=>{
 const setup=async()=>{
  api.get.mockImplementation(async path=>path.includes('/people/')?{data:{user:{id:7,first_name:'Sam',last_name:'Jones'},offices:[],contact:{email:'sam@tenant.example'}}}:{data:{agency:{id:2,name:'Tenant',phone_number:'555-0100',website_url:'tenant.example'},canManage:true,
   people:[{id:7,first_name:'Sam',role:'staff',status:'ACTIVE',agency_ids:'2'}],
   groups:[{id:'group:7',kind:'group',name:'People Operations',email:'po@tenant.example'},{id:'group:8',kind:'group',name:'Technology Support',email:'tech@tenant.example'},{id:'department:7',kind:'department',name:'Development',email:''}]}});
  const w=mount(BusinessCardsDialog,{props:{agencies:[{id:2,name:'Tenant'}]},attachTo:document.body});wrappers.push(w);await flushPromises();return w;
 };
 const change=async(selector,value)=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));await nextTick();};
 const clickButton=async text=>{[...document.querySelectorAll('button')].find(el=>el.textContent.includes(text)).click();await flushPromises();};
 it('prints selected group and general cards alongside employees without borrowing employee details',async()=>{
  await setup();document.querySelector('.person-row input').click();await nextTick();
  await change('[aria-label="Card type"]','groups');
  expect([...document.querySelectorAll('.person-row strong')].map(el=>el.textContent)).toEqual(['Development','People Operations','Technology Support','Tenant']);
  await clickButton('People Operations');
  expect(document.querySelector('.card-editor').textContent).not.toContain('credentials');
  expect(document.querySelector('.card-editor').textContent).not.toContain('No enabled work number');
  for(const row of document.querySelectorAll('.person-row'))if(['People Operations','Technology Support','Tenant'].includes(row.querySelector('strong').textContent))row.querySelector('input').click();
  await nextTick();await clickButton('Download PDF');
  expect(businessCardsPdf).toHaveBeenCalledOnce();
  const cards=businessCardsPdf.mock.calls[0][0];expect(cards).toHaveLength(4);
  expect(cards.find(c=>c.id==='group:7')).toMatchObject({name:'People Operations',email:'po@tenant.example',phone:'555-0100',credentials:'',extension:'',workLine:null});
  expect(cards.find(c=>c.id==='organization')).toMatchObject({name:'Tenant',email:''});
  expect(cards.find(c=>c.id==='7')).toMatchObject({name:'Sam Jones',email:'sam@tenant.example'});
 });
 it('saves and restores group selections and edited public email in drafts',async()=>{
  await setup();await change('[aria-label="Card type"]','groups');await clickButton('People Operations');
  const row=[...document.querySelectorAll('.person-row')].find(el=>el.textContent.includes('People Operations'));row.querySelector('input').click();
  const label=[...document.querySelectorAll('.card-editor label')].find(el=>el.textContent.includes('Public work email'));
  const input=label.querySelector('input');input.value='people@tenant.example';input.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();
  await clickButton('Save editable draft');const draft=downloadCardFile.mock.calls[0][0];
  await clickButton('Reload from records');
  const fileInput=document.querySelector('.file-label input');Object.defineProperty(fileInput,'files',{configurable:true,value:[{size:draft.length,text:async()=>draft}]});fileInput.dispatchEvent(new Event('change',{bubbles:true}));await flushPromises();
  expect(document.querySelector('[aria-label="Card type"]').value).toBe('groups');
  await clickButton('Download PDF');expect(businessCardsPdf.mock.calls[0][0]).toHaveLength(1);expect(businessCardsPdf.mock.calls[0][0][0]).toMatchObject({id:'group:7',email:'people@tenant.example'});
 });
 it('keeps groups out of the self-service picker',async()=>{
  const w=mount(BusinessCardsDialog,{props:{agencies:[{id:2,name:'Tenant'}],selfOnly:true},attachTo:document.body});wrappers.push(w);await flushPromises();
  expect(document.querySelector('[aria-label="Card type"]')).toBeNull();
 });
});
