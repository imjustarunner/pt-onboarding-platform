import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Directory from '../ItscoProviderDirectory.vue';
import Schools from '../ItscoSchoolPartners.vue';
import Support from '../ItscoSupportForm.vue';
import api from '../../../services/api';
const route=vi.hoisted(()=>({query:{}}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace:vi.fn()})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:null})}));
const global={stubs:{RouterLink:{props:['to'],template:'<a :data-to="JSON.stringify(to)"><slot/></a>'}}};
const school={id:11,name:'Example Elementary',level:'Elementary Schools',providerIds:[1]};
const provider=(id,name,extra={})=>({id,displayName:name,firstName:name,lastName:'Example',title:'Counselor',credential:'LPC',acceptingNewClients:true,office:false,onlineScheduling:false,schools:[],specialties:['Anxiety'],ageGroups:['Teens'],populations:[],modalities:[],insurances:[{name:'Example Plan'}],details:{languages:['Spanish']},bio:'Public profile',...extra});
const providers=[provider(1,'First',{schools:[school],schoolOpenings:true,acceptingNewClients:false}),provider(2,'Second',{office:true,onlineScheduling:true})];
beforeEach(()=>{route.query={};vi.clearAllMocks();api.get.mockResolvedValue({data:{categories:[{id:'provider',label:'Finding a provider'}],recaptchaRequired:false}});});
describe('ITSCO directory and real support',()=>{
 it('requires an assigned office for in-person search and keeps closed providers visible there',async()=>{
  const offices=[{id:11,name:'Colorado Springs',address:'Springs address'},{id:12,name:'Denver',address:'Denver address'}];
  const rows=[provider(1,'Springs Provider',{office:true,officeLocations:[offices[0]]}),provider(2,'Denver Provider',{office:true,acceptingNewClients:false,officeLocations:[offices[1]]}),provider(3,'Both Offices',{office:true,officeLocations:offices}),provider(4,'Unassigned',{office:true,details:{locations:['Denver']}})];
  const w=mount(Directory,{props:{providers:rows,agencyId:1},global});
  await w.findAll('.its-provider-modes button').find(b=>b.text()==='In-office providers').trigger('click');
  expect(w.text()).toContain('Choose a location');expect(w.findAll('.its-provider-card')).toHaveLength(0);
  await w.findAll('.office-buttons button').find(b=>b.text().includes('Denver')).trigger('click');
  expect(w.findAll('.its-provider-card').map(c=>c.find('h3').text())).toEqual(['Both Offices, LPC','Denver Provider, LPC']);
  expect(w.findAll('.its-card-actions a')[0].attributes('data-to')).toContain('"officeId":"12"');
  await w.findAll('.its-provider-modes button').find(b=>b.text()==='All providers').trigger('click');expect(w.findAll('.its-provider-card')).toHaveLength(4);w.unmount();
 });
 it('published school and office openings override stale global closure',async()=>{
  const rows=[providers[0],provider(2,'Second',{office:true,onlineScheduling:true,acceptingNewClients:false,officeAcceptance:{status:'accepting'}})];
  const w=mount(Directory,{props:{providers:rows,schools:[school],agencyId:1,availability:{2:{nextAvailableAt:'2027-01-01T16:00:00Z',hasPublishedOpenings:true,inPerson:{hasPublishedOpenings:true,nextAvailableAt:'2027-01-01T16:00:00Z'}}}},global});
  expect(w.findAll('.its-provider-card')).toHaveLength(2);
  expect(w.text()).toContain('Accepting new clients');expect(w.text()).toContain('View times');
  await w.findAll('select')[4].setValue('yes');expect(w.findAll('.its-provider-card')).toHaveLength(2);w.unmount();
 });
 it('shows a globally open provider without requiring a school assignment or an online opening',()=>{
  const w=mount(Directory,{props:{providers:[provider(528,'Brittany')],agencyId:1},global});
  expect(w.find('.its-provider-card').text()).toContain('Accepting new clients');w.unmount();
 });
 it('deduplicates age tags and exposes only the selected school enrollment link',()=>{
  const w=mount(Directory,{props:{providers:[provider(3,'Third',{specialties:['Teen'],ageGroups:['Teen (14–18)','Teen']})],agencyId:1},global});expect(w.findAll('.its-tags span').map(s=>s.text())).toEqual(['Teen (14–18)']);w.unmount();
  const schools=mount(Schools,{props:{districts:[{name:'D11',slug:'d11',schools:[{...school,intakePublicKey:'published-school-form'}]}]},global});expect(schools.find('.its-parent-link a').attributes('href')).toContain('/intake/published-school-form');expect(schools.findAll('.its-school-columns>section')).toHaveLength(1);schools.unmount();
 });
 it('opens a school link with just its assigned providers and can clear the filter',async()=>{route.query={school:'11'};const w=mount(Directory,{props:{providers,schools:[school],agencyId:1},global});expect(w.findAll('.its-provider-card')).toHaveLength(1);expect(w.text()).toContain('at Example Elementary');await w.findAll('button').find(b=>b.text()==='Clear filters').trigger('click');expect(w.findAll('.its-provider-card')).toHaveLength(2);w.unmount();});
 it('does not call failed availability a confirmed lack of openings',async()=>{const w=mount(Directory,{props:{providers:[providers[1]],agencyId:1,availabilityError:'Unavailable'},global});await w.findAll('select')[5].setValue('no');expect(w.findAll('.its-provider-card')).toHaveLength(0);expect(w.text()).toContain('Unavailable');w.unmount();});
 it('provides school-only profiles without a broken scheduling link',()=>{route.query={provider:'1'};const w=mount(Directory,{props:{providers,schools:[school],agencyId:1},global});expect(w.find('.its-selected-profile').text()).toContain('Public profile');expect(w.findAll('a').some(a=>a.attributes('data-to')===JSON.stringify('/itsco/school-referral'))).toBe(true);expect(w.text()).not.toContain('View availability & full profile');w.unmount();});
 it('supports district switching, search, grouped school counts and actual provider links',async()=>{const w=mount(Schools,{props:{districts:[{name:'D11',slug:'d11',schools:[school]},{name:'New District',slug:'new',schools:[{...school,id:12,name:'Second High',level:'High Schools'}]}]},global});expect(w.find('.its-school-columns').text()).toContain('Example Elementary');await w.findAll('.its-district-tabs button')[1].trigger('click');expect(w.find('.its-school-columns').text()).not.toContain('Example Elementary');expect(w.find('.its-school-columns a').attributes('data-to')).toContain('"school":"12"');await w.find('input').setValue('no match');expect(w.text()).toContain('No matching schools.');w.unmount();});
 it('persists a real support ticket and reports success only after confirmation',async()=>{api.post.mockResolvedValue({data:{ok:true,ticketId:42}});const w=mount(Support,{global});await flushPromises();await w.find('input').setValue('Example Visitor');await w.find('input[type=email]').setValue('visitor@example.test');await w.find('textarea').setValue('A synthetic support question');await w.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/public/agency-support/itsco/tickets',expect.objectContaining({name:'Example Visitor',message:'A synthetic support question'}),expect.anything());expect(w.text()).toContain('#42');w.unmount();});
 it('keeps the support message on failure',async()=>{api.post.mockRejectedValue(new Error('Unable to send'));const w=mount(Support,{global});await flushPromises();await w.find('textarea').setValue('Keep this message');await w.find('form').trigger('submit');await flushPromises();expect(w.find('[role=alert]').text()).toContain('Unable to send');expect(w.find('textarea').element.value).toBe('Keep this message');expect(w.text()).not.toContain('Your message has been sent.');w.unmount();});
});
