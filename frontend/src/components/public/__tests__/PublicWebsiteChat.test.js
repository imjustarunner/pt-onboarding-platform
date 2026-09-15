import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import Chat from '../PublicWebsiteChat.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../utils/websiteCaptcha',()=>({websiteCaptchaToken:vi.fn().mockResolvedValue('synthetic')}));
let wrapper,history=[],eligible=true;
async function render(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/p/:slug/:section?',component:{template:'<div/>'}}]});await router.push('/p/itsco');wrapper=mount(Chat,{global:{plugins:[router],stubs:{teleport:true,PublicWebsiteContactForm:true}}});await flushPromises();}
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();history=[];eligible=true;api.get.mockImplementation(async url=>({data:url.endsWith('/config')?{eligible,online:true,site:{name:'ITSCO',slug:'itsco'},captchaSiteKey:'test'}:{state:'open',messages:history}}));api.post.mockImplementation(async(url,body)=>{if(url.endsWith('/sessions'))return {data:{id:'test-session',token:'a'.repeat(64)}};history.push({id:history.length+1,sender:'visitor',body:body.body,createdAt:new Date().toISOString()});return {data:{state:'open',messages:[...history]}};});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.clearAllMocks();});
describe('local website chat',()=>{
 it('does not create a session or toast for nonlocal visitors',async()=>{eligible=false;await render();expect(wrapper.find('.webchat-visitor').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();});
 it('offers an inquiry after 60 seconds without a staff reply and clears it when staff replies',async()=>{await render();await wrapper.find('textarea').setValue('Can you help me enroll?');await wrapper.find('form').trigger('submit');await flushPromises();expect(wrapper.find('.webchat-fallback').exists()).toBe(false);await vi.advanceTimersByTimeAsync(61000);await flushPromises();expect(wrapper.find('.webchat-fallback').text()).toContain('Sorry we’re taking too long');history.push({id:2,sender:'staff',body:'Start here: https://www.itsco.health/join/itsco/counseling',createdAt:new Date().toISOString()});await vi.advanceTimersByTimeAsync(7000);await flushPromises();expect(wrapper.find('.webchat-fallback').exists()).toBe(false);expect(wrapper.find('a').attributes('href')).toBe('https://www.itsco.health/join/itsco/counseling');});
 it('dismisses the visitor toast for this tab',async()=>{await render();await wrapper.find('[aria-label="Dismiss chat"]').trigger('click');expect(wrapper.find('.webchat-visitor').exists()).toBe(false);expect(JSON.parse(sessionStorage.getItem('website-chat:itsco:dismissed'))).toBe(true);});
});
