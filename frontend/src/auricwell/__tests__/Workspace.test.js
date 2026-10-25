import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const mocks=vi.hoisted(()=>({get:vi.fn(),push:vi.fn()}));
vi.mock('../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push})}));
import Overview from '../Overview.vue';
import Shell from '../WorkspaceShell.vue';
import {dayKey,shiftDay,appointmentState,personalToolUrl} from '../workspace';
const props={agency:{id:450,name:'QA',timezone:'America/Denver'},actor:{id:1433,role:'provider',first_name:'Avery',timezone:'America/Denver'},slug:'auricwell-qa-demo',canDocument:true};
const global={stubs:{RouterLink:{props:['to'],template:'<a><slot/></a>'}}};
let wrapper;
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T16:00:00Z'));vi.clearAllMocks();mocks.get.mockImplementation(async path=>({data:path==='/clients'?{items:[{id:1,full_name:'Test Client'}],total:28}:path==='/appointments'?{appointments:[{id:2,startAt:'2026-10-24T15:00:00Z',endAt:'2026-10-24T15:50:00Z',title:'Test appointment',status:'scheduled'},{id:3,startAt:'2026-10-25T07:00:00Z',status:'scheduled'},{id:4,startAt:'2026-10-24T17:00:00Z',status:'canceled_by_client'}]}:path==='/clinical-notes/recent'?{drafts:[{id:5,client_id:1,client_full_name:'Test Client',status:'draft',date_of_service:'2026-10-23'}]}:{tasks:[{id:6,title:'Call family',status:'pending',due_date:'2026-10-23'}],total:1}}));});
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.useRealTimers();});
it('uses practice-local dates across DST and year boundaries',()=>{expect(dayKey('2026-11-01T06:30:00Z','America/Denver')).toBe('2026-11-01');expect(dayKey('2026-10-25T05:59:00Z','America/Denver')).toBe('2026-10-24');expect(shiftDay('2026-12-31',1)).toBe('2027-01-01');expect(appointmentState({status:'completed'})).toBe('Completed');expect(personalToolUrl('auricwell-qa-demo','payroll')).toBe('/auricwell-qa-demo/dashboard?tab=my&my=payroll');});
it('shows true API totals, filters canceled/out-of-day sessions, and scopes provider queries',async()=>{wrapper=mount(Overview,{props,global});await flushPromises();expect(wrapper.text()).toContain('Good morning, Avery.');expect(wrapper.findAll('.aw-summary-card strong').map(n=>n.text())).toEqual(['1','28','1','1']);expect(mocks.get).toHaveBeenCalledWith('/clients',expect.objectContaining({params:expect.objectContaining({provider_id:1433,agency_id:450})}));expect(mocks.get).toHaveBeenCalledWith('/appointments',expect.objectContaining({params:expect.objectContaining({providerId:1433,agencyId:450})}));expect(wrapper.text()).not.toContain('92%');});
it('keeps a failed data source distinct from an empty result',async()=>{mocks.get.mockImplementation(async path=>{if(path==='/appointments')throw new Error('offline');return {data:{items:[],tasks:[],drafts:[],total:0}};});wrapper=mount(Overview,{props,global});await flushPromises();expect(wrapper.findAll('.aw-summary-card strong')[0].text()).toBe('—');expect(wrapper.text()).toContain('Could not load appointments');expect(wrapper.text()).not.toContain('No appointments scheduled');expect(wrapper.text()).toContain('No active clients assigned');});
it('does not fetch or show clinical drafts for support',async()=>{wrapper=mount(Overview,{props:{...props,actor:{...props.actor,role:'support'},canDocument:false},global});await flushPromises();expect(mocks.get.mock.calls.some(c=>c[0]==='/clinical-notes/recent')).toBe(false);expect(wrapper.text()).not.toContain('Pending Note Drafts');});
it('connects search, account menu and responsive navigation',async()=>{wrapper=mount(Shell,{props:{...props,section:'overview',navigation:[{key:'overview',label:'Overview',icon:'dashboard'}],websiteBase:'/',unread:3},global});await wrapper.get('input[type=search]').setValue('Maria López');await wrapper.get('form').trigger('submit');expect(mocks.push).toHaveBeenCalledWith({path:'/auricwell-qa-demo/clients',query:{search:'Maria López'}});await wrapper.get('.aw-account-toggle').trigger('click');expect(wrapper.get('#aw-account-menu').text()).toContain('My Account');await wrapper.get('.aw-mobile-menu').trigger('click');expect(wrapper.classes()).toContain('aw-menu-open');await wrapper.trigger('keydown',{key:'Escape'});expect(wrapper.classes()).not.toContain('aw-menu-open');expect(wrapper.get('.aw-notification-button').attributes('aria-label')).toBe('Notifications, 3 unread');});
it('collapses a card into its existing metric and restores it after reload without losing records',async()=>{
 wrapper=mount(Overview,{props,global});await flushPromises();
 await wrapper.get('[aria-label="Collapse Pending Notes & Documentation to a summary card"]').trigger('click');
 expect(wrapper.get('[data-tour="dash-section-ehr-notes"]').isVisible()).toBe(false);
 expect(wrapper.get('.aw-metric-notes').attributes('aria-label')).toBe('Expand Pending Notes & Documentation');
 wrapper.unmount();wrapper=mount(Overview,{props,global});await flushPromises();
 expect(wrapper.get('[data-tour="dash-section-ehr-notes"]').isVisible()).toBe(false);
 await wrapper.get('.aw-metric-notes').trigger('click');expect(wrapper.get('[data-tour="dash-section-ehr-notes"]').element.style.display).not.toBe('none');
 expect(wrapper.get('[data-tour="dash-section-ehr-notes"]').text()).toContain('Test Client');
});
it('customizes only clinical cards, preserves layout, and resets cards',async()=>{
 wrapper=mount(Overview,{props,global});await flushPromises();await wrapper.get('.ov-customize').trigger('click');
 expect(wrapper.get('.ov-card-editor').text()).not.toMatch(/Payroll|Events|Submit|Compensation/);
 await wrapper.get('[aria-label="Move Your Clients up"]').trigger('click');
 await wrapper.findAll('.ov-card-editor label').find(l=>l.text().includes('Tasks')).get('input').setValue(false);
 expect(wrapper.find('[data-tour="dash-section-ehr-tasks"]').exists()).toBe(false);
 expect(wrapper.get('[data-tour="dash-section-ehr-clients"]').attributes('style')).toContain('order: 1');
 await wrapper.get('.reset-cards').trigger('click');expect(wrapper.find('[data-tour="dash-section-ehr-tasks"]').exists()).toBe(true);
 expect(wrapper.get('[data-tour="dash-section-ehr-clients"]').attributes('style')).toContain('order: 2');
});
it('allows scrolling through more than five loaded notes and keeps support customization restricted',async()=>{
 mocks.get.mockResolvedValue({data:{drafts:Array.from({length:60},(_,id)=>({id,status:'draft',client_full_name:`Client ${id}`})),items:[],tasks:[]}});
 wrapper=mount(Overview,{props,global});await flushPromises();expect(wrapper.findAll('[data-tour="dash-section-ehr-notes"] .aw-list-row')).toHaveLength(60);
 await wrapper.setProps({canDocument:false});await flushPromises();await wrapper.get('.ov-customize').trigger('click');
 expect(wrapper.get('.ov-card-editor').text()).not.toContain('Pending Notes');expect(wrapper.find('[data-tour="dash-section-ehr-notes"]').exists()).toBe(false);
});
it('stores sidebar width separately for each account and practice',async()=>{
 wrapper=mount(Shell,{props:{...props,navigation:[],websiteBase:'/'},global});await wrapper.get('[aria-label="Collapse sidebar"]').trigger('click');
 expect(wrapper.classes()).toContain('aw-collapsed');await wrapper.setProps({slug:'another-practice'});expect(wrapper.classes()).not.toContain('aw-collapsed');
 await wrapper.setProps({slug:props.slug});expect(wrapper.classes()).toContain('aw-collapsed');
 await wrapper.setProps({actor:{...props.actor,id:1434}});expect(wrapper.classes()).not.toContain('aw-collapsed');
});
it('keeps demo layout choices temporary',async()=>{
 wrapper=mount(Overview,{props:{...props,demo:true},global});await flushPromises();
 await wrapper.get('[aria-label="Collapse Pending Notes & Documentation to a summary card"]').trigger('click');
 await wrapper.get('.ov-customize').trigger('click');await wrapper.get('[aria-label="Move Your Clients up"]').trigger('click');
 expect(localStorage.length).toBe(0);
});
