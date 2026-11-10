import {beforeEach,expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
import Dashboard from '../FamilyDashboard.vue';import Choices from '../FamilyNotificationChoices.vue';import Shell from '../../portal/FamilyPortalShell.vue';import Reader from '../../billing/InsuranceCardReader.vue';import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
const profiles=[{client_id:8,agency_id:2,full_name:'Avery Example',agency_name:'ITSCO'},{client_id:9,agency_id:2,full_name:'Riley Example',agency_name:'ITSCO'},{client_id:10,agency_id:6,full_name:'Jordan Example',agency_name:'NLU'}];
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{}});api.put.mockResolvedValue({data:{revision:'new'}});});
it('aggregates only this payer’s balances once per agency and labels appointments by client',async()=>{api.get.mockImplementation(async(url,{params}={})=>({data:url.includes('/balances')?{balances:params.agencyId===2?[{dueCents:2500,isOwnShare:true},{dueCents:9900,isOwnShare:false},{dueCents:3000,isOwnShare:true,paymentStatus:'pending'}]:[{dueCents:1000,isOwnShare:true}]}:url.endsWith('/messages')?{threads:[]}:{appointments:[{id:1,startAt:'2099-10-21T22:00:00Z',status:'confirmed',providerName:'Demo Tutor'}]}}));const w=mount(Dashboard,{props:{profiles}});await flushPromises();expect(w.find('.total').text()).toBe('$35.00');expect(api.get.mock.calls.filter(([u])=>u==='/family-billing/balances')).toHaveLength(2);expect(w.text()).toContain('Avery Example');expect(w.text()).toContain('Jordan Example');await w.findAll('.family-summary-grid article')[1].find('button').trigger('click');expect(w.emitted('profile')[0]).toEqual([8,'appointments',2,undefined]);w.unmount();});
it('does not present a failed balance lookup as zero',async()=>{api.get.mockImplementation(async u=>{if(u.includes('/balances'))throw new Error('unavailable');return {data:{}};});const w=mount(Dashboard,{props:{profiles}});await flushPromises();expect(w.find('.total').text()).toBe('Unavailable');w.unmount();});
it('closes the mobile menu when its outside backdrop is selected',async()=>{const w=mount(Shell,{props:{navigation:[{key:'family',label:'My family',group:'Family & account'},{key:'plan',label:'Avery’s plan',group:'Viewing Avery'}]}});await w.find('.portal-menu').trigger('click');expect(w.find('.portal-menu').attributes('aria-expanded')).toBe('true');expect(w.findAll('.portal-nav-group')).toHaveLength(2);await w.find('.portal-menu-backdrop').trigger('click');expect(w.find('.portal-menu').attributes('aria-expanded')).toBe('false');w.unmount();});
const categories=[{key:'appointments',label:'Appointment reminders'},{key:'insurance',label:'Insurance card requests',emailOnly:true}];
function mockChoices(mixed=false){api.get.mockImplementation(async url=>({data:{token:url,revision:'r1',version:'v1',disclosure:'Consent',categories,choices:{appointments:mixed&&url.includes('/9/')?'off':'email',insurance:'email'}}}));}
it('requires an explicit choice for mixed family preferences then saves the same choices to each profile without sending SMS',async()=>{mockChoices(true);const w=mount(Choices,{props:{profiles:profiles.slice(0,2)},global:{stubs:{FamilyAccountSettings:true}}});await flushPromises();expect(w.text()).toContain('different preferences');await w.find('input[type=checkbox]').setValue(true);await w.find('form').trigger('submit');expect(api.put).not.toHaveBeenCalled();await w.find('input[name=appointments][value=email]').setValue(true);await w.find('form').trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledTimes(2);for(const [,body]of api.put.mock.calls)expect(body.preferences.choices).toEqual({appointments:'email',insurance:'email'});expect(api.post).not.toHaveBeenCalled();expect(w.emitted('saved')).toHaveLength(1);w.unmount();});
it('reports partial preference failures without saying every profile was saved',async()=>{mockChoices();api.put.mockRejectedValueOnce(new Error('conflict'));const w=mount(Choices,{props:{profiles:profiles.slice(0,2)},global:{stubs:{FamilyAccountSettings:true}}});await flushPromises();await w.find('input[type=checkbox]').setValue(true);await w.find('form').trigger('submit');await flushPromises();expect(w.find('[role=alert]').text()).toContain('1 profile(s) could not be updated');expect(w.emitted('saved')).toBeUndefined();w.unmount();});
it('reads an insurance photo into draft fields without saving coverage or charging',async()=>{api.post.mockResolvedValue({data:{readable:true,fields:{memberId:'DEMO123'}}});const w=mount(Reader,{props:{agencyId:2,clientId:8}});const input=w.find('input[type=file]');Object.defineProperty(input.element,'files',{value:[new File(['card'],'demo.png',{type:'image/png'})]});await input.trigger('change');await flushPromises();expect(w.emitted('fields')[0]).toEqual([{memberId:'DEMO123'}]);expect(w.text()).toContain('Review and correct');expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toBe('/guardian-billing/insurance/read-card');w.unmount();});

it('lists guardian and provider names with an explicit group-message explanation',async()=>{const {default:Access}=await import('../GuardianCareAccess.vue');api.get.mockResolvedValue({data:{participants:[{id:9,name:'Morgan Example',role:'guardian'},{id:10,name:'Alex Example',role:'guardian'},{id:3,name:'Demo Provider',role:'provider'}]}});const w=mount(Access,{props:{clientId:8,clientName:'Avery',userId:9}});await flushPromises();expect(w.text()).toContain('Morgan Example (you)');expect(w.text()).toContain('Alex Example');expect(w.text()).toContain('group conversation for Avery');expect(w.text()).not.toContain('@');await w.find('button').trigger('click');expect(w.emitted('messages')).toHaveLength(1);w.unmount();});

it('loads each service for a multi-agency client and opens the matching agency and service',async()=>{
 const linked=[{...profiles[0],care_contexts:[{agency_id:2,agency_name:'ITSCO',services:[{id:11}]},{agency_id:6,agency_name:'NLU',services:[{id:12}]}]}];
 api.get.mockImplementation(async(url,{params}={})=>({data:url.endsWith('/appointments')?{appointments:[{id:params.agencyId,startAt:'2099-10-21T22:00:00Z',status:'confirmed'}]}:url.endsWith('/messages')?{threads:[]}:{balances:[]}}));
 const w=mount(Dashboard,{props:{profiles:linked}});await flushPromises();
 const calls=api.get.mock.calls.filter(([url])=>url.endsWith('/appointments'));
 expect(calls.map(([,options])=>options.params)).toEqual([{agencyId:2,serviceId:11},{agencyId:6,serviceId:12}]);
 const upcoming=w.findAll('.family-summary-grid article')[1];expect(upcoming.findAll('li')).toHaveLength(2);
 await upcoming.findAll('button')[1].trigger('click');expect(w.emitted('profile')[0]).toEqual([8,'appointments',6,12]);w.unmount();
});
it('applies family preferences to both agencies without enrolling texts implicitly',async()=>{
 mockChoices();const linked=[{...profiles[0],care_contexts:[{agency_id:2},{agency_id:6}]}];
 const w=mount(Choices,{props:{profiles:linked},global:{stubs:{FamilyAccountSettings:true}}});await flushPromises();
 expect(api.get.mock.calls.map(([,options])=>options.params.agencyId)).toEqual([2,6]);
 await w.find('input[type=checkbox]').setValue(true);await w.find('form').trigger('submit');await flushPromises();
 expect(api.put.mock.calls.map(([,body])=>body.agencyId)).toEqual([2,6]);expect(api.post).not.toHaveBeenCalled();w.unmount();
});


it('does not fetch private dashboard data or claim empty records for restricted pending profiles', async () => {
 const w = mount(Dashboard,{props:{profiles:profiles.slice(0,2).map(p=>({...p,no_view:true}))}});
 await flushPromises();expect(api.get).not.toHaveBeenCalled();
 expect(w.text()).toContain('restricted record access');expect(w.text()).toContain('Complete any enrollment forms shown above');
 expect(w.text()).not.toContain('No upcoming appointments');expect(w.find('.family-summary-grid').exists()).toBe(false);w.unmount();
});
it('loads only readable profiles and reacts when server relationship access changes', async () => {
 const pending = {...profiles[0],no_view:true};
 api.get.mockImplementation(async url=>({data:url.endsWith('/appointments')?{appointments:[]}:{balances:[],threads:[]}}));
 const w = mount(Dashboard,{props:{profiles:[pending,profiles[1]]}});await flushPromises();
 expect(api.get.mock.calls.filter(([url])=>url.endsWith('/appointments')).map(([url])=>url)).toEqual(['/guardian-portal/clients/9/appointments']);
 api.get.mockClear();await w.setProps({profiles:[{...pending,no_view:false},profiles[1]]});await flushPromises();
 expect(api.get.mock.calls.filter(([url])=>url.endsWith('/appointments')).map(([url])=>url)).toEqual(['/guardian-portal/clients/8/appointments','/guardian-portal/clients/9/appointments']);
 api.get.mockClear();await w.setProps({profiles:[{...pending,guardian_portal_locked:true}]});await flushPromises();
 expect(api.get).not.toHaveBeenCalled();expect(w.find('.family-summary-grid').exists()).toBe(false);w.unmount();
});

it('ignores an old dashboard response after the server marks the linked profile restricted', async () => {
 let complete;
 api.get.mockImplementation(url=>url.endsWith('/appointments')?new Promise(resolve=>{complete=resolve}):Promise.resolve({data:{balances:[],threads:[]}}));
 const w=mount(Dashboard,{props:{profiles:[profiles[0]]}});await flushPromises();
 await w.setProps({profiles:[{...profiles[0],no_view:true}]});await flushPromises();
 complete({data:{appointments:[{id:77,startAt:'2099-01-02T18:00:00Z',status:'confirmed',providerName:'Old private appointment'}]}});await flushPromises();
 expect(w.text()).not.toContain('Old private appointment');expect(w.find('.family-summary-grid').exists()).toBe(false);
 expect(w.text()).toContain('restricted record access');w.unmount();
});
