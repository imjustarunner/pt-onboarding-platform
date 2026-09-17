import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{mount,flushPromises}from'@vue/test-utils';
import Menu from'../PublicResourcesMenu.vue';
import api from'../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('vue-router',()=>({useRoute:()=>({path:'/p/itsco'})}));
let wrapper;
beforeEach(()=>{vi.stubGlobal('innerWidth',1440);vi.stubGlobal('matchMedia',()=>({matches:true}));api.get.mockResolvedValue({data:{partners:[{slug:'nlu',name:'Next Level Up',url:'https://app.nextleveluplcc.com/p/nlu'},{slug:'bad',name:'Unsafe',url:'javascript:alert(1)'}]}});});afterEach(()=>{wrapper?.unmount();vi.unstubAllGlobals();});
describe('public resources partners menu',()=>{
 it('shows the shared directory in a new tab and every partner except the current site',async()=>{api.get.mockResolvedValue({data:{partners:[{slug:'itsco',name:'ITSCO',url:'https://itsco.health'},{slug:'ptco',name:'PlotTwistCo',url:'https://plottwistco.com'}]}});wrapper=mount(Menu);await flushPromises();await wrapper.find('button').trigger('click');const network=wrapper.find('a[href="/p/itsco/referral-network"]');expect(network.attributes('target')).toBe('_blank');await wrapper.find('.public-partners>button').trigger('click');expect(wrapper.findAll('.public-partners-panel a').map(a=>a.text())).toEqual(['PlotTwistCo ↗']);});

 it('opens only safe partner links in new tabs',async()=>{wrapper=mount(Menu,{props:{resourcesPath:'/p/itsco/resources'}});await flushPromises();await wrapper.find('.public-resources>button').trigger('click');await wrapper.find('.public-partners>button').trigger('click');const a=wrapper.find('.public-partners-panel a');expect(a.attributes('href')).toBe('https://app.nextleveluplcc.com/p/nlu');expect(a.attributes('target')).toBe('_blank');expect(a.attributes('rel')).toContain('noopener');expect(wrapper.findAll('.public-partners-panel a')).toHaveLength(1);expect(wrapper.find('.public-resources-panel>a').attributes('href')).toBe('/p/itsco/resources');});
 it('supports touch/click and keyboard close',async()=>{wrapper=mount(Menu);await wrapper.find('button').trigger('click');await wrapper.find('.public-partners>button').trigger('click');expect(wrapper.find('.public-partners-panel').exists()).toBe(true);await wrapper.trigger('keydown',{key:'Escape'});expect(wrapper.find('.public-resources-panel').exists()).toBe(false);expect(wrapper.find('button').attributes('aria-expanded')).toBe('false');});
 it('shows retry on a failed request',async()=>{api.get.mockRejectedValueOnce(Error());wrapper=mount(Menu);await flushPromises();await wrapper.find('button').trigger('click');await wrapper.find('.public-partners>button').trigger('click');expect(wrapper.text()).toContain('Try loading partners again');await wrapper.find('.public-partners-panel button').trigger('click');await flushPromises();expect(wrapper.text()).toContain('Next Level Up');});
});
