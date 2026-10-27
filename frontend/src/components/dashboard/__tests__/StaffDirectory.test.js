import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,it,expect,vi} from 'vitest';
import StaffDirectory from '../StaffDirectory.vue';
const m=vi.hoisted(()=>({get:vi.fn(),push:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('vue-router',()=>({useRoute:()=>({path:'/example/dashboard'}),useRouter:()=>({push:m.push})}));
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:{staff:[{id:7,displayName:'José Example',title:'Clinician',workEmail:'jose@itsco.health',workPhone:'719-657-7444',extension:'204',primaryLocation:'Denver',assignedOffices:['North · Office 3'],profileUrl:'https://www.itsco.health/providers/jose-example-7'},{id:8,displayName:'Another Person',primaryLocation:'Boulder'}]}});});
it('searches multiple terms across names, locations and extensions, and opens the direct conversation',async()=>{
 const w=mount(StaffDirectory,{props:{agencyId:2,userId:1}});await flushPromises();
 await w.get('input').setValue('jose 204 denver');expect(w.findAll('article')).toHaveLength(1);
 expect(w.get('a[target="_blank"]').attributes('href')).toBe('https://www.itsco.health/providers/jose-example-7');
 expect(w.get('footer button').text()).toBe('Internal message');
 expect(w.text()).not.toContain('Assigned office');
 expect(w.text()).not.toContain('North · Office 3');
 await w.get('footer button').trigger('click');expect(m.push).toHaveBeenCalledWith({path:'/example/dashboard',query:{tab:'chats',openChatWith:'7',agencyId:'2'}});
 await w.get('input').setValue('boulder');expect(w.text()).toContain('Another Person');expect(w.text()).not.toContain('José Example');w.unmount();
});
it('clears the prior organization and ignores a late response after switching organizations',async()=>{
 let finish;m.get.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const w=mount(StaffDirectory,{props:{agencyId:2,userId:1}});await w.setProps({agencyId:3});await flushPromises();
 finish({data:{staff:[{id:99,displayName:'Old agency'}]}});await flushPromises();expect(w.text()).not.toContain('Old agency');w.unmount();
});

it('opens an in-app draft addressed to the staff member in the selected organization',async()=>{
 const opened=vi.fn(event=>event.preventDefault());
 window.addEventListener('open-email-composer',opened);
 const popup=vi.spyOn(window,'open');
 const w=mount(StaffDirectory,{props:{agencyId:2,userId:1}});await flushPromises();
 try {
  await w.get('[aria-label="Email José Example"]').trigger('click');
  expect(opened).toHaveBeenCalledOnce();
  expect(opened.mock.calls[0][0].detail).toMatchObject({mode:'new',agencyId:2,to:'jose@itsco.health'});
  expect(popup).not.toHaveBeenCalled();expect(w.find('[href^="mailto:"]').exists()).toBe(false);
 } finally {w.unmount();window.removeEventListener('open-email-composer',opened);popup.mockRestore();}
});
