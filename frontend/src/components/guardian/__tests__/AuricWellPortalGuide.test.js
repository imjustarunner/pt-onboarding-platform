import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const mocks=vi.hoisted(()=>({post:vi.fn(),route:{query:{}}}));
vi.mock('../../../services/api',()=>({default:{post:mocks.post}}));
vi.mock('vue-router',()=>({useRoute:()=>mocks.route}));
import Guide from '../AuricWellPortalGuide.vue';
const create=()=>mount(Guide,{props:{agencyId:2,clientId:8},global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});
beforeEach(()=>{vi.clearAllMocks();mocks.route.query={};mocks.post.mockResolvedValue({data:{ticketId:71}});});
it('opens the guide from the migration email and labels Beta without an unconfigured support address',()=>{mocks.route.query={welcome:'learn-more'};const w=create();expect(w.get('details').attributes()).toHaveProperty('open');expect(w.text()).toContain('Established 2026');expect(w.text()).toContain('Beta');expect(w.text()).not.toContain('technology@');w.unmount();});
it('sends a report only on submit, scoped to the selected profile, with a deduplication key',async()=>{
 const w=create();expect(mocks.post).not.toHaveBeenCalled();await w.get('textarea').setValue('The download failed on my phone.');await w.get('form').trigger('submit');await flushPromises();
 const [url,body]=mocks.post.mock.calls[0];expect(url).toBe('/guardian-portal/technology-help');expect(body.get('clientId')).toBe('8');expect(body.get('agencyId')).toBe('2');expect(body.get('question')).toBe('The download failed on my phone.');expect(body.get('requestId')).toMatch(/^[a-f0-9-]{36}$/);expect(w.text()).toContain('Report #71');w.unmount();
});
it('retains the request id after a network failure to prevent duplicate support tickets on retry',async()=>{
 const w=create();mocks.post.mockRejectedValueOnce(new Error('Network'));await w.get('textarea').setValue('The download failed.');await w.get('form').trigger('submit');await flushPromises();await w.get('form').trigger('submit');await flushPromises();expect(mocks.post.mock.calls[0][1].get('requestId')).toBe(mocks.post.mock.calls[1][1].get('requestId'));w.unmount();
});
it('clears draft screenshots and ignores another profile’s late response after a profile switch',async()=>{
 let resolve;mocks.post.mockImplementation(()=>new Promise(done=>{resolve=done;}));const w=create();await w.get('textarea').setValue('The download failed.');await w.get('form').trigger('submit');await w.setProps({clientId:9});resolve({data:{ticketId:71}});await flushPromises();expect(w.get('textarea').element.value).toBe('');expect(w.text()).not.toContain('Report #71');w.unmount();
});
it('blocks over-limit screenshots before a submission',async()=>{
 const w=create();await w.get('textarea').setValue('The download failed.');const input=w.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[1,2,3,4].map(()=>new File(['image'],'screen.png',{type:'image/png'}))});await input.trigger('change');await w.get('form').trigger('submit');await flushPromises();expect(mocks.post).not.toHaveBeenCalled();expect(w.text()).toContain('Choose up to three');w.unmount();
});
