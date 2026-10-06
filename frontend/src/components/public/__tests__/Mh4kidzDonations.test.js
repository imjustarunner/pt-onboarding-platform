import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import Donations from '../Mh4kidzDonations.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
async function render(props={},url='/p/mh4kidz/donate'){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/p/mh4kidz/:section',component:Donations}]});await router.push(url);
 wrapper=mount(Donations,{props,global:{plugins:[router]}});await flushPromises();return wrapper;
}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{acceptingDonations:true,donors:[]}});});
afterEach(()=>wrapper?.unmount());
describe('MH4Kidz giving experience',()=>{
 it('shows public recognition and the exact published fields before checkout',async()=>{
  await render();expect(wrapper.findAll('input[type=radio]')[0].element.checked).toBe(true);
  expect(wrapper.text()).toContain('Show my name, gift amount, and city/state or region');expect(wrapper.text()).toContain('Your email is never shown');
  expect(wrapper.find('.donation-preview').text()).toContain('$50.00');
  await wrapper.findAll('.donation-amounts button')[2].trigger('click');expect(wrapper.find('.donation-submit').text()).toContain('$100.00');
 });
 it('lets donors choose anonymous without collecting a location',async()=>{
  await render();await wrapper.findAll('input[type=radio]')[1].setValue();expect(wrapper.find('input[autocomplete=address-level2]').exists()).toBe(false);expect(wrapper.find('.donation-preview').exists()).toBe(false);
 });
 it('never opens a checkout from the website editor preview',async()=>{
  await render({preview:true});expect(api.get).not.toHaveBeenCalled();expect(wrapper.find('.donation-submit').attributes('disabled')).toBeDefined();await wrapper.find('form').trigger('submit');expect(api.post).not.toHaveBeenCalled();
 });
 it('does not collect payment details while donations are closed',async()=>{
  api.get.mockResolvedValue({data:{acceptingDonations:false,donors:[]}});await render();expect(wrapper.find('form').exists()).toBe(false);expect(wrapper.text()).toContain('opening soon');expect(wrapper.find('a').attributes('href')).toBe('/p/mh4kidz/contact');
 });
 it('escapes donor listing content and shows the net gift',async()=>{
  api.get.mockResolvedValue({data:{acceptingDonations:true,donors:[{name:'<img onerror=alert(1)>',city:'Denver',region:'CO',amountCents:4500}]}});await render();expect(wrapper.find('.donation-wall').text()).toContain('$45.00');expect(wrapper.find('.donation-wall img').exists()).toBe(false);
 });
 it('treats the return URL as pending until the server confirms payment',async()=>{
  api.post.mockResolvedValue({data:{status:'processing'}});await render({},'/p/mh4kidz/donate?checkout=success#receipt='+ 'a'.repeat(64));
  expect(wrapper.text()).toContain('Confirming your donation');expect(wrapper.text()).not.toContain('Thank you for your donation');expect(api.post).toHaveBeenCalledWith('/public/mh4kidz/donations/receipt',{receiptToken:'a'.repeat(64)},expect.anything());
 });
 it('shows a verified receipt and saves an anonymous choice after payment',async()=>{
  api.post.mockResolvedValueOnce({data:{status:'paid',publicRecognition:true,receipt:{html:'<p>Donation acknowledgment</p>'}}}).mockResolvedValueOnce({data:{saved:true}}).mockResolvedValueOnce({data:{status:'paid',publicRecognition:false,receipt:{html:'<p>Donation acknowledgment</p>'}}});
  await render({},'/p/mh4kidz/donate#receipt='+ 'a'.repeat(64));expect(wrapper.text()).toContain('Print / save PDF');await wrapper.findAll('button').find(b=>b.text().includes('Make my donation')).trigger('click');await flushPromises();expect(wrapper.text()).toContain('Your donation is anonymous');
 });
});
