import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import Editor from '../PublicWebsiteEditorBar.vue';
import {websiteEditor,websiteContent,mergeWebsiteEdits} from '../../../composables/usePublicWebsiteEditor';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),logout:vi.fn(),guard:vi.fn()}));
const route=reactive({path:'/p/itsco',fullPath:'/p/itsco',meta:{publicMarketingHub:true},query:{}});
const auth=reactive({user:{id:1,role:'super_admin'},setAuth:vi.fn(),logout:mocks.logout});
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({beforeEach:mocks.guard})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>auth}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get,put:mocks.put,post:mocks.post}}));
let wrapper;
const record=()=>({id:8,slug:'itsco',brandingJson:{otherSiteSetting:true,itscoWebsite:{story:'Keep story',inlineContent:{old:'Keep prior change'}}}});
beforeEach(()=>{vi.clearAllMocks();route.query={};auth.user={id:1,role:'super_admin'};websiteEditor.active=false;websiteEditor.page=null;websiteEditor.changes={};mocks.guard.mockReturnValue(vi.fn());mocks.get.mockImplementation(async path=>({data:path==='/users/me'?auth.user:{pages:[record()]}}));mocks.put.mockResolvedValue({data:{}});mocks.post.mockResolvedValue({data:{url:'/uploads/replacement.png'}});});
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';});
const button=text=>wrapper.findAll('button').find(b=>b.text()===text);
async function open(){wrapper=mount(Editor,{attachTo:document.body,global:{stubs:{RouterLink:true}}});await flushPromises();await button('Edit this page').trigger('click');await flushPromises();}
describe('on-page website editing',()=>{
 it('replaces photos with a live draft and publishes only changed content over latest settings',async()=>{
  await open();document.body.insertAdjacentHTML('beforeend','<img data-website-image="page:home:image" src="/old.png">');
  document.querySelector('[data-website-image]').click();await flushPromises();
  expect(document.querySelector('.website-edit-panel')).not.toBeNull();
  const file=document.querySelector('input[type=file]');Object.defineProperty(file,'files',{value:[new File(['image'],'new.png',{type:'image/png'})]});file.dispatchEvent(new Event('change'));await flushPromises();
  expect(websiteContent('page:home:image','/old.png')).toBe('/uploads/replacement.png');
  expect(mocks.put).not.toHaveBeenCalled();
  await button('Save changes').trigger('click');await flushPromises();
  expect(mocks.put.mock.calls[0][1].brandingJson).toEqual({...record().brandingJson,itscoWebsite:{story:'Keep story',inlineContent:{old:'Keep prior change','page:home:image':'/uploads/replacement.png'}}});
  expect(websiteEditor.active).toBe(false);expect(wrapper.text()).toContain('Changes published.');
 });
 it('keeps a failed save in the editor and allows discard',async()=>{
  await open();websiteEditor.changes={'page:home:title':'Draft'};mocks.put.mockRejectedValue(Error('Offline'));
  await button('Save changes').trigger('click');await flushPromises();expect(websiteEditor.active).toBe(true);expect(websiteEditor.changes['page:home:title']).toBe('Draft');
  vi.spyOn(window,'confirm').mockReturnValue(true);await button('Discard changes').trigger('click');expect(websiteEditor.changes).toEqual({});expect(websiteEditor.active).toBe(false);
 });
 it('requires a server-verified role, not just a stored admin user',async()=>{
  mocks.get.mockRejectedValue({response:{status:401}});wrapper=mount(Editor,{global:{stubs:{RouterLink:true}}});await flushPromises();expect(wrapper.text()).not.toContain('Edit this page');expect(wrapper.text()).toContain('Staff sign in');
 });
 it('provides logout without navigating to the admin form',async()=>{
  await open();await button('Log out').trigger('click');expect(mocks.logout).toHaveBeenCalledOnce();expect(websiteEditor.page).toBeNull();
 });
 it('keeps provider records and other website settings outside marketing copy patches',()=>{
  expect(mergeWebsiteEdits(record(),{'hero':'Updated'}).itscoWebsite.story).toBe('Keep story');
  websiteEditor.page=null;expect(websiteContent('hero','Original',{inlineContent:{hero:'Published'}})).toBe('Published');
 });
});
