import {beforeEach,expect,it,vi} from 'vitest';import {shallowMount,flushPromises} from '@vue/test-utils';import {createRouter,createMemoryHistory} from 'vue-router';
import View from '../../../views/guardian/GuardianPortalView.vue';import Shell from '../../portal/FamilyPortalShell.vue';import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../../../services/tutoringLearningOs',()=>({fetchGuardianLearningFeed:vi.fn().mockResolvedValue({subjects:[],plans:[]})}));
vi.mock('../../../store/auth',async()=>{const{reactive}=await import('vue');const s=reactive({user:{id:10,role:'client_guardian',firstName:'Morgan',lastName:'Bennett'},logout:vi.fn()});return{useAuthStore:()=>s}});
vi.mock('../../../store/agency',async()=>{const{reactive}=await import('vue');const s=reactive({currentAgency:null,userAgencies:[],setCurrentAgency(a){this.currentAgency=a}});return{useAgencyStore:()=>s}});
vi.mock('../../../store/guardian',async()=>{const{reactive}=await import('vue');const s=reactive({selectedChildId:null,setSelectedChild(id){this.selectedChildId=id}});return{useGuardianStore:()=>s}});
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({primaryColor:'#2467a7'})}));
import{useAgencyStore}from '../../../store/agency';import{useGuardianStore}from '../../../store/guardian';
const agencies=[{id:2,slug:'itsco',name:'ITSCO',organization_type:'agency'},{id:6,slug:'nlu',name:'Next Level Up',organization_type:'agency'},{id:377,slug:'tisi',name:'Inner Strength',organization_type:'agency'}];
const person=(id,aid,name,type='clinical',self=false)=>({client_id:id,agency_id:aid,agency_name:agencies.find(a=>a.id===aid).name,agency_slug:agencies.find(a=>a.id===aid).slug,full_name:name,initials:name.slice(0,2),client_type:type,organization_type:id===3?'school':'agency',organization_id:id===3?376:aid,relationship_type:self?'self':'guardian',school_affiliations:id===3?[{organization_id:376,name:'Hogwarts',status:'current'}]:[]});
const people=[person(1,2,'Riley'),person(2,6,'Jordan','learning'),person(3,2,'Avery','school'),person(4,377,'Morgan','clinical',true)];
it('opens the family dashboard when the personal portal check fails',async()=>{
 api.get.mockImplementation(async(url='')=>{if(url==='/dependent-portal/status')throw new Error('status down');return{data:url==='/guardian-portal/overview'?{children:people.slice(0,3),me:people[3],programs:agencies}:{events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}});
 const{w}=await setup();expect(w.text()).not.toContain('could not be opened');expect(w.findAll('.family-profile-card')).toHaveLength(4);w.unmount();
});
it('does not mount family widgets before personal portal access is resolved',async()=>{
 let resolve;api.get.mockImplementation(url=>url==='/dependent-portal/status'?new Promise(done=>{resolve=done}):Promise.resolve({data:{children:[],programs:[]}}));
 const{w,router}=await setup();expect(w.text()).toContain('Loading your dashboard');expect(w.findComponent({name:'GuardianInvitations'}).exists()).toBe(false);
 resolve({data:{personalPortal:true}});await flushPromises();expect(router.currentRoute.value.path).toBe('/my-portal');expect(api.get.mock.calls.some(([url])=>url==='/guardian-portal/overview')).toBe(false);w.unmount();
});
beforeEach(()=>{vi.clearAllMocks();useAgencyStore().currentAgency=agencies[0];useAgencyStore().userAgencies=agencies;useGuardianStore().selectedChildId=null;Element.prototype.scrollIntoView=vi.fn();api.get.mockImplementation(async url=>({data:url==='/guardian-portal/overview'?{children:people.slice(0,3),me:people[3],programs:agencies}:url.includes('clinical-access')?{grants:people.map(p=>({clientId:p.client_id,guardianUserId:10,scopes:['treatment_plan']}))}:{events:[],items:[],documents:[],subjects:[],plans:[]}}));});
async function setup(path='/itsco/guardian'){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:organizationSlug/guardian',component:View}]});await router.push(path);await router.isReady();const w=shallowMount(View,{global:{plugins:[router],stubs:{FamilyPortalShell:false,PortalContextPicker:false,ClinicalWorkspaceFrame:{template:'<div><slot/></div>'}}}});await flushPromises();return{w,router}}
it('starts with all dependents and self; names the school menu',async()=>{const{w}=await setup();expect(w.findAll('.family-profile-card')).toHaveLength(4);expect(w.text()).toContain('Morgan (you)');expect(w.findComponent(Shell).props('active')).toBe('family');expect(w.findComponent(Shell).props('userName')).toBe('Morgan Bennett');await w.findAll('.family-profile-card').find(c=>c.text().includes('Avery')).find('button').trigger('click');await flushPromises();expect(w.findComponent(Shell).props('navigation').some(n=>n.key==='schoolcarebridge'&&n.label==='Hogwarts')).toBe(true);expect(w.findComponent(Shell).props('agencyName')).toBe('ITSCO');w.unmount()});
it('switches person, agency, branding and content together',async()=>{const{w,router}=await setup();await w.findAll('.family-profile-card').find(c=>c.text().includes('Jordan')).find('button').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/nlu/guardian');expect(useGuardianStore().selectedChildId).toBe(2);expect(w.findComponent(Shell).props('brandName')).toBe('Next Level Up');expect(w.findComponent({name:'GuardianTutoringDashboard'}).props('clientId')).toBe(2);w.findComponent(Shell).vm.$emit('navigate','family');await flushPromises();await w.findAll('.family-profile-card').find(c=>c.text().includes('Morgan')).find('button').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/tisi/guardian');expect(w.findComponent(Shell).props('brandName')).toBe('AuricWell');expect(w.text()).toContain('Morgan (you)');w.unmount()});
it('corrects a school URL without losing the chosen client',async()=>{useAgencyStore().currentAgency={id:376,slug:'hogwarts',organization_type:'school'};const{w,router}=await setup('/hogwarts/guardian?clientId=3&panel=messages');expect(router.currentRoute.value.path).toBe('/itsco/guardian');expect(useGuardianStore().selectedChildId).toBe(3);expect(w.findComponent({name:'GuardianMessagesPanel'}).props('clientId')).toBe(3);w.unmount()});
it('gates billing until actionable onboarding is done, allowing team-held steps',async()=>{const{w}=await setup();const checklist=w.findComponent({name:'PortalMigrationChecklist'});checklist.vm.$emit('state',{enrolled:true,items:[{key:'information',complete:false}]});await flushPromises();w.findComponent(Shell).vm.$emit('navigate','billing');await flushPromises();expect(w.findComponent(Shell).props('active')).toBe('onboarding');expect(w.text()).toContain('Please complete the available onboarding steps');checklist.vm.$emit('state',{enrolled:true,items:[{key:'information',complete:true},{key:'payment',complete:false,waiting:true}]});await flushPromises();w.findComponent(Shell).vm.$emit('navigate','billing');await flushPromises();expect(w.findComponent(Shell).props('active')).toBe('billing');w.unmount()});
it('keeps one child while switching between agencies and two services in one agency',async()=>{
 const care=(agency,services)=>({agency_id:agency.id,agency_name:agency.name,agency_slug:agency.slug,organization_type:'agency',services});
 const multi={...person(3,2,'Avery','school'),care_contexts:[care(agencies[0],[{id:11,service_kind:'counseling',label:'School counseling',provider_name:'Sam',is_active:1}]),care(agencies[1],[{id:12,service_kind:'tutoring',label:'Reading tutoring',provider_name:'Taylor',is_active:1},{id:13,service_kind:'counseling',label:'Counseling',provider_name:'Alex',is_active:1}])]};
 api.get.mockImplementation(async url=>({data:url==='/guardian-portal/overview'?{children:[multi],programs:agencies}:{events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}));
 const{w,router}=await setup();
 expect(w.findAll('.family-profile-card')).toHaveLength(1);
 const profilePicker=w.find('.family-profile-picker');
 await profilePicker.find('.picker-trigger').trigger('click');
 expect(profilePicker.findAll('[role=option]')).toHaveLength(2);
 expect(profilePicker.findAll('[aria-selected=true]')).toHaveLength(1);
 await profilePicker.findAll('[role=group]')[1].find('[role=option]').trigger('click');await flushPromises();
 expect(router.currentRoute.value.path).toBe('/nlu/guardian');
 expect(useGuardianStore().selectedChildId).toBe(3);
 w.findComponent(Shell).vm.$emit('navigate','family');await flushPromises();
 await w.findAll('.family-profile-card button').find(b=>b.text().includes('Reading tutoring')).trigger('click');await flushPromises();
 expect(router.currentRoute.value.path).toBe('/nlu/guardian');expect(router.currentRoute.value.query.serviceId).toBe('12');expect(useGuardianStore().selectedChildId).toBe(3);
 expect(w.findComponent({name:'GuardianTutoringDashboard'}).props('clientId')).toBe(3);expect(w.findComponent(Shell).props('brandName')).toBe('Next Level Up');
 const selector=w.findAll('.context-picker').find(s=>s.text().includes('Service & provider'));
 await selector.find('.picker-trigger').trigger('click');
 await selector.findAll('[role=option]').find(o=>o.text().includes('Counseling')).trigger('click');await flushPromises();
 expect(router.currentRoute.value.query.serviceId).toBe('13');expect(useGuardianStore().selectedChildId).toBe(3);expect(w.findComponent({name:'GuardianTutoringDashboard'}).exists()).toBe(false);expect(w.findComponent(Shell).props('brandName')).toBe('AuricWell');
 w.findComponent(Shell).vm.$emit('navigate','messages');await flushPromises();expect(router.currentRoute.value.query.serviceId).toBe('13');w.unmount();
});

it('lists every linked profile in agency groups and switches context from the header', async () => {
 const {w,router}=await setup();
 const picker=w.find('.family-profile-picker');
 expect(w.find('.family-context select').exists()).toBe(false);
 await picker.find('.picker-trigger').trigger('click');
 expect(picker.findAll('[role=group]').map(g=>g.find('.picker-group-label').text())).toEqual(['Inner Strength','ITSCO','Next Level Up']);
 expect(picker.findAll('[role=option]')).toHaveLength(4);
 expect(picker.findAll('[aria-selected=true]')).toHaveLength(1);
 await picker.findAll('[role=option]').find(o=>o.text().includes('Jordan')).trigger('click');
 await flushPromises();
 expect(router.currentRoute.value.path).toBe('/nlu/guardian');
 expect(router.currentRoute.value.query.clientId).toBe('2');
 expect(useAgencyStore().currentAgency.id).toBe(6);
 expect(useGuardianStore().selectedChildId).toBe(2);
 expect(w.findComponent({name:'GuardianTutoringDashboard'}).props('clientId')).toBe(2);
 expect(picker.find('.picker-trigger').attributes('aria-expanded')).toBe('false');
 await picker.find('.picker-trigger').trigger('click');
 expect(picker.findAll('[role=option]')).toHaveLength(4);
 await picker.findAll('[role=option]').find(o=>o.text().includes('Avery')).trigger('click');
 await flushPromises();
 expect(router.currentRoute.value.path).toBe('/itsco/guardian');
 expect(useGuardianStore().selectedChildId).toBe(3);
 expect(w.findComponent(Shell).props('agencyName')).toBe('ITSCO');
 w.unmount();
});


it('keeps a restricted guardian’s own enrollment visible without preloading private records', async () => {
 const linked = [person(3,2,'Avery','school'), person(5,2,'Riley','school')].map(p => ({...p,no_view:true,school_affiliations:[{organization_id:376,name:'Current school'}]}));
 api.get.mockImplementation(async url => ({data: url === '/guardian-portal/overview' ? {children:linked,programs:agencies} : {events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}));
 const {w} = await setup();
 expect(w.findAll('.family-profile-card')).toHaveLength(2);
 expect(w.findComponent({name:'GuardianPendingEnrollment'}).exists()).toBe(true);
 expect(w.findComponent({name:'PortalMigrationChecklist'}).exists()).toBe(false);
 expect(w.findComponent({name:'GuardianSchoolReleaseNotice'}).exists()).toBe(false);
 expect(api.get.mock.calls.some(([url]) => url.endsWith('/intake-documents') || url.includes('/daily-notes'))).toBe(false);
 expect(w.text()).toContain('Detailed records are restricted');
 w.findComponent({name:'GuardianPendingEnrollment'}).vm.$emit('state',{loaded:true,pending:true});
 for (const panel of ['documents','appointments','onboarding','overview','child']) {
   w.findComponent(Shell).vm.$emit('navigate',panel); await flushPromises();
   expect(w.text()).toContain('Complete your own enrollment above to continue');
   for (const name of ['GuardianIntakeDocuments','GuardianAppointmentsPanel','GuardianClientDetails','FamilyPortalHome','PortalMigrationChecklist']) expect(w.findComponent({name}).exists()).toBe(false);
   expect(w.findComponent({name:'GuardianPendingEnrollment'}).exists()).toBe(true);
 }
 w.unmount();
});
it('loads authorized record widgets when selecting a completed profile in a mixed family', async () => {
 const pending = {...person(3,2,'Avery','school'),no_view:true};
 const completed = person(5,2,'Riley','school');
 api.get.mockImplementation(async url => ({data:url === '/guardian-portal/overview' ? {children:[pending,completed],programs:agencies} : {events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}));
 const {w} = await setup();
 expect(w.findComponent({name:'PortalMigrationChecklist'}).exists()).toBe(false);
 await w.findAll('.family-profile-card').find(c=>c.text().includes('Riley')).find('button').trigger('click');await flushPromises();
 expect(useGuardianStore().selectedChildId).toBe(5);
 expect(w.findComponent({name:'PortalMigrationChecklist'}).props('clientId')).toBe(5);
 expect(api.get.mock.calls.some(([url])=>url==='/guardian-portal/clients/5/intake-documents')).toBe(true);
 expect(api.get.mock.calls.some(([url])=>url==='/guardian-portal/clients/3/intake-documents')).toBe(false);
 w.findComponent(Shell).vm.$emit('navigate','documents');await flushPromises();
 expect(w.findComponent({name:'GuardianIntakeDocuments'}).props('clientId')).toBe(5);
 w.unmount();
});

it('does not require agency or profile selection for a single-agency single-child family',async()=>{
 api.get.mockImplementation(async url=>({data:url==='/guardian-portal/overview'?{children:[people[0]],programs:[agencies[0]]}:url==='/dependent-portal/status'?{personalPortal:false}:{events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}));
 const {w}=await setup();expect(w.findAllComponents({name:'PortalContextPicker'})).toHaveLength(0);expect(w.get('.family-current-profile').text()).toContain('Riley');w.unmount();
});
it('uses learning payment navigation and mounts the scoped parent invitation on the selected child information page',async()=>{
 const learning={...people[1],services:[{id:21,service_kind:'tutoring',label:'Tutoring'}]};
 api.get.mockImplementation(async url=>({data:url==='/guardian-portal/overview'?{children:[learning],programs:[agencies[1]]}:{events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}));
 const{w}=await setup('/nlu/guardian');const shell=w.findComponent(Shell);
 expect(shell.props('navigation').find(n=>n.key==='payment_methods').label).toBe('Payments');expect(shell.props('learning')).toBe(true);
 shell.vm.$emit('navigate','payment_methods');await flushPromises();
 expect(shell.props('subtitle')).toBe('Manage your saved payment methods.');
 expect(w.findComponent({name:'GuardianPaymentInsuranceTab'}).props('learningOnly')).toBe(true);
 shell.vm.$emit('navigate','child');await flushPromises();
 expect(w.findComponent({name:'GuardianLearningInvitations'}).props()).toMatchObject({clientId:2,agencyId:6,clientName:'Jordan'});w.unmount();
});
it('keeps insurance access for a dual-service profile even when tutoring is selected',async()=>{
 const dual={...people[1],services:[{id:21,service_kind:'tutoring',label:'Tutoring'},{id:22,service_kind:'counseling',label:'Counseling'}]};
 api.get.mockImplementation(async url=>({data:url==='/guardian-portal/overview'?{children:[dual],programs:[agencies[1]]}:{events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}));
 const{w}=await setup('/nlu/guardian');const shell=w.findComponent(Shell);
 expect(shell.props('navigation').find(n=>n.key==='payment_methods').label).toBe('Insurance & payments');
 shell.vm.$emit('navigate','payment_methods');await flushPromises();
 expect(w.findComponent({name:'GuardianPaymentInsuranceTab'}).props('learningOnly')).toBe(false);w.unmount();
});
it('retains an ended service in the picker and limits its portal without closing another active service',async()=>{
 const profile={...people[0],care_contexts:[{agency_id:2,agency_name:'ITSCO',agency_slug:'itsco',services:[{id:11,label:'Counseling',provider_name:'Michael',provider_user_id:20,service_kind:'counseling',is_active:0,service_status:'discontinued',status_label:'Discontinued services',portal_limited:true},{id:12,label:'Tutoring',provider_name:'Avery',provider_user_id:21,service_kind:'tutoring',is_active:1,service_status:'active',status_label:'Active services'}]}]};
 api.get.mockImplementation(async url=>({data:url==='/guardian-portal/overview'?{children:[profile],programs:agencies}:{events:[],items:[],documents:[],grants:[],subjects:[],plans:[]}}));
 const{w}=await setup('/itsco/guardian?clientId=1&serviceId=11&panel=appointments');
 expect(w.findComponent({name:'EndedServicePortal'}).exists()).toBe(true);
 expect(w.findComponent(Shell).props('navigation').some(item=>['messages','notifications','onboarding','enroll'].includes(item.key))).toBe(false);
 const picker=w.findAllComponents({name:'PortalContextPicker'}).find(p=>p.props('label')==='Service & provider');
 expect(picker.props('groups')[0].options).toHaveLength(2);picker.vm.$emit('update:modelValue',12);await flushPromises();
 expect(w.findComponent({name:'EndedServicePortal'}).exists()).toBe(false);expect(w.findComponent(Shell).props('navigation').some(item=>item.key==='messages')).toBe(true);w.unmount();
});
