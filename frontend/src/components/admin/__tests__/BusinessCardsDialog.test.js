import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import BusinessCardsDialog from '../BusinessCardsDialog.vue';
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
