import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),push:vi.fn(),route:null}));
vi.mock('../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'super_admin',timezone:'America/Denver'}})}));
vi.mock('vue-router',()=>({useRoute:()=>mocks.route,useRouter:()=>({push:mocks.push})}));
import Records from '../Records.vue';
import {scheduleLink,agendaTime,providerRows} from '../agenda';
const providers=[{id:9,name:'DEMO QA Avery',active:true,canViewSchedule:true},{id:10,name:'DEMO QA Jordan',active:true,supervisee:true,canViewSchedule:true},{id:11,name:'DEMO QA Historical',active:false,canViewSchedule:true}];
const rows=[{key:'appointment:1',providerId:10,providerName:'DEMO QA Jordan',kind:'appointment',clientName:'DEMO QA Client',title:'Individual therapy',date:'2026-11-03',startAt:'2026-11-03T17:28:00Z',endAt:'2026-11-03T18:21:00Z',status:'scheduled'},{key:'school:2',providerId:10,providerName:'DEMO QA Jordan',kind:'school',title:'School plan',clientName:'DEMO QA Untimed',date:'2026-11-03',status:'canceled',notice:'Contact needs attention',attention:true}];
const stub={props:['to'],template:'<a :data-to="JSON.stringify(to)"><slot/></a>'};
let wrapper;
beforeEach(()=>{mocks.route=reactive({path:'/auricwell/app/itsco/appointments',query:{}});vi.clearAllMocks();mocks.push.mockImplementation(async({query})=>{mocks.route.query=query;});mocks.get.mockImplementation(async path=>({data:path.endsWith('workspace-scope')?{actorId:9,scopes:['mine','supervisees','practice'],providers}:path.endsWith('directory')?{clients:[{id:77,full_name:'DEMO QA Client',status_label:'Being seen'}],total:71}:{items:rows,total:71,timeZone:'America/Denver'}}));});
afterEach(()=>wrapper?.unmount());
const mountPage=async(section='appointments')=>{wrapper=mount(Records,{props:{section,agency:{id:450,name:'QA Practice'},slug:'itsco'},global:{stubs:{RouterLink:stub}}});await flushPromises();};
it('uses exact times, untimed school plans, visible source/status, and only read-only links',async()=>{
 await mountPage();expect(wrapper.text()).toContain('10:28 AM–11:21 AM');expect(wrapper.text()).toContain('Time not set');expect(wrapper.text()).toContain('Contact needs attention');expect(wrapper.findAll('h1')[0].text()).toBe('My Schedule');expect(wrapper.text()).toContain('Open My Schedule');expect(mocks.get).toHaveBeenCalledWith('/auricwell-preview/agenda',expect.objectContaining({params:expect.objectContaining({agencyId:450,scope:'mine'}),skipGlobalLoading:true}));expect(wrapper.text()).not.toContain('Save appointment');
});
it('keeps search, scope, sort and page in route state; Back reloads prior filters',async()=>{
 await mountPage();await wrapper.find('input[type=search]').setValue('DEMO QA');const selects=wrapper.findAll('select');await selects[0].setValue('supervisees');await flushPromises();expect(mocks.route.query.scope).toBe('supervisees');expect(mocks.route.query.search).toBe('DEMO QA');
 await wrapper.find('[aria-label="Results pages"] button:last-child').trigger('click');await flushPromises();expect(mocks.route.query.page).toBe('2');expect(mocks.get.mock.calls.at(-1)[1].params).toMatchObject({scope:'supervisees',page:'2'});
 mocks.route.query={scope:'mine',search:'prior',page:'1'};await flushPromises();expect(wrapper.find('input[type=search]').element.value).toBe('prior');expect(mocks.get.mock.calls.at(-1)[1].params.scope).toBe('mine');
});
it('defaults directory to active providers and keeps history searchable',async()=>{
 await mountPage('providers');expect(wrapper.text()).toContain('DEMO QA Jordan');expect(wrapper.text()).not.toContain('DEMO QA Historical');expect(wrapper.text()).toContain('View agenda');await wrapper.find('select').setValue('inactive');await flushPromises();expect(wrapper.text()).toContain('DEMO QA Historical');expect(wrapper.text()).not.toContain('DEMO QA Jordan');
});
it('uses labeled client statuses and server totals',async()=>{await mountPage('clients');expect(wrapper.text()).toContain('Being seen');expect(wrapper.text()).toContain('71 clients');expect(wrapper.text()).toContain('Page 1 of 2');});
it('distinguishes failed sources from zero results',async()=>{mocks.get.mockImplementation(async path=>{if(path.endsWith('workspace-scope'))return {data:{actorId:9,scopes:['mine'],providers:[]}};throw Error('Unable to load schedule');});await mountPage();expect(wrapper.find('[role=alert]').text()).toContain('Unable to load schedule');expect(wrapper.text()).not.toContain('No records match');});
it('ignores late responses after a scope or practice change',async()=>{
 let late;mocks.get.mockImplementation(async path=>path.endsWith('workspace-scope')?{data:{actorId:9,scopes:['mine','practice'],providers}}:new Promise(resolve=>{late=resolve;}));await mountPage();const first=late;mocks.get.mockImplementation(async path=>({data:path.endsWith('workspace-scope')?{actorId:9,scopes:['mine'],providers:[]}:{items:[],total:0}}));await wrapper.setProps({agency:{id:451,name:'Other QA'}});await flushPromises();first({data:{items:rows,total:71}});await flushPromises();expect(wrapper.text()).not.toContain('DEMO QA Client');expect(wrapper.text()).toContain('No records match');
});
it('routes another provider to their schedule without changing actor or practice',()=>{
 expect(scheduleLink('itsco',9,rows[0])).toEqual({path:'/itsco/my-schedule',query:{weekStart:'2026-11-02',scheduleViewAs:'10'}});expect(scheduleLink('itsco',9,{...rows[0],providerId:9}).query).not.toHaveProperty('scheduleViewAs');expect(agendaTime(rows[1],'America/Denver')).toBe('Time not set');
});
it('filters history and sorts provider names without mutating the source',()=>{expect(providerRows(providers,{history:'all',search:'QA',order:'desc'}).map(p=>p.id)).toEqual([10,11,9]);expect(providers[0].id).toBe(9);});

it('opens the old My Schedule URL as a week and switches to day or agenda without leaving AuricWell',async()=>{
 mocks.route.params={section:'my-schedule'};mocks.route.query={weekStart:'2026-11-02'};await mountPage();expect(wrapper.find('[aria-label="Schedule calendar"]').exists()).toBe(true);
 expect(mocks.get.mock.calls.at(-1)[1].params).toMatchObject({view:'week',start:'2026-11-02',end:'2026-11-09'});
 await wrapper.findAll('[aria-label="Schedule view"] button').find(b=>b.text()==='Day').trigger('click');await flushPromises();expect(mocks.get.mock.calls.at(-1)[1].params).toMatchObject({view:'day',end:'2026-11-03'});
 await wrapper.findAll('[aria-label="Schedule view"] button').find(b=>b.text()==='Agenda').trigger('click');await flushPromises();expect(wrapper.find('.aw-agenda-list').exists()).toBe(true);expect(wrapper.find('[aria-label="Schedule calendar"]').exists()).toBe(false);
});

it('opens legacy schedule links in the permitted supervisee scope',async()=>{
 mocks.route.query={weekStart:'2026-11-02',scheduleViewAs:'10'};
 await mountPage();
 expect(mocks.get.mock.calls.at(-1)[1].params).toMatchObject({scope:'supervisees',providerId:'10'});
});
