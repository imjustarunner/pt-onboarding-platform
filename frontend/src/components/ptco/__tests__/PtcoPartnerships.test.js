import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Partnerships from '../PtcoPartnerships.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
let wrapper;
const directory=[
 {slug:'ptco',name:'Plot Twist Co.',url:'https://plottwistco.com',relationship:null},
 {slug:'itsco',name:'ITSCO',url:'https://www.itsco.health',logoUrl:null,relationship:'associate'},
 {slug:'michael',name:'Michael V. Mendez Consulting',url:'https://plottwisthq.com/michael',logoUrl:'https://plottwisthq.com/assets/michael/monogram.svg',relationship:'associate'},
 {slug:'rmmentors',name:'Rocky Mountain Mentors',url:'https://rmmentors.com',logoUrl:null,comingSoon:true,relationship:'associate'},
 {slug:'other',name:'Other organization',url:'https://example.org',logoUrl:'/assets/other.png',relationship:'subsidiary'},
 {slug:'sstc',name:'Summit Stats Team Challenge',url:'https://summitstatstc.com',relationship:'subsidiary',comingSoon:true}
];
async function render(){wrapper=mount(Partnerships);await flushPromises();}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{partners:directory.map(p=>({...p}))}});});
afterEach(()=>wrapper?.unmount());
describe('Plot Twist Co. organization directory',()=>{
 it('omits the management company and the app listed in the product family',async()=>{
  await render();expect(wrapper.find('[data-partner="ptco"]').exists()).toBe(false);
  expect(wrapper.find('[data-partner="sstc"]').exists()).toBe(false);
  expect(wrapper.findAll('.partner-card')).toHaveLength(4);
  expect(wrapper.find('[data-partner="other"] .partner-relationship').text()).toBe('Subsidiary');
 });
 it('uses ITSCO’s real logo and Michael’s supplied wordmark without changing destinations',async()=>{
  await render();const itsco=wrapper.find('[data-partner="itsco"]'),michael=wrapper.find('[data-partner="michael"]');
  expect(itsco.find('img').attributes('src')).toBe('/assets/itsco/logo.png');
  expect(michael.find('img').attributes('src')).toBe('/assets/michael/logo-horizontal.png');
  expect(michael.find('.partner-logo-horizontal').exists()).toBe(true);
  expect(michael.find('a').attributes('href')).toBe('https://plottwisthq.com/michael');
  expect(directory[2].logoUrl).toContain('monogram.svg');
 });
 it('preserves coming-soon status and does not invent a link',async()=>{
  await render();const card=wrapper.find('[data-partner="rmmentors"]');
  expect(card.find('img').attributes('src')).toBe('/assets/rmmentors/logo.jpeg');
  expect(card.findAll('a')).toHaveLength(0);expect(card.text()).toContain('Coming soon');
 });
 it('falls back to readable text when an image fails',async()=>{
  await render();const card=wrapper.find('[data-partner="michael"]');await card.find('img').trigger('error');
  expect(card.find('img').exists()).toBe(false);expect(card.find('.partner-wordmark').text()).toBe('Michael V. Mendez Consulting');
  expect(card.find('.partner-logo-horizontal').exists()).toBe(false);
 });
 it('rejects unsafe directory links and offers a retry after a failed load',async()=>{
  api.get.mockRejectedValueOnce(new Error('Network unavailable'));await render();
  expect(wrapper.find('[role="status"]').text()).toContain('temporarily unavailable');
  api.get.mockResolvedValueOnce({data:{partners:[{slug:'unsafe',name:'Unsafe',url:'javascript:alert(1)',logoUrl:'javascript:alert(1)'}]}});
  await wrapper.find('button').trigger('click');await flushPromises();
  expect(wrapper.find('[role="status"]').exists()).toBe(false);
  expect(wrapper.find('img').exists()).toBe(false);expect(wrapper.find('a').attributes('href')).toBe('');
 });
});
