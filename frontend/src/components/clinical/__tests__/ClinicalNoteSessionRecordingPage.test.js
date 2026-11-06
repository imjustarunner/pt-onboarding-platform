import {beforeEach,describe,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import View from '../../../views/admin/SessionRecordingView.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),push:vi.fn(),back:vi.fn(),route:{params:{organizationSlug:'itsco'},query:{}},agency:{currentAgency:{id:2,organization_type:'agency',practice_category:'mental_health'}},auth:{user:{id:7,role:'provider'}}}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>m.agency}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>m.auth}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({push:m.push,back:m.back})}));
vi.mock('../../documents/DocumentSigningWorkflow.vue',()=>({default:{template:'<div />'}}));
vi.mock('../ClinicalNoteLibrarySidebar.vue',()=>({default:{template:'<div />'}}));
beforeEach(()=>{vi.clearAllMocks();m.route.query={agencyId:'2',clientId:'17',clinicalSessionId:'101',officeEventId:'201',draftId:'55',serviceCode:'90837'};m.get.mockResolvedValue({data:{}});});
describe('dedicated desktop session recording page',()=>{
 it('mounts only the real session recorder and never runs the legacy microphone setup',async()=>{const w=shallowMount(View);await flushPromises();expect(w.findComponent({name:'ClinicalSessionRecordingPanel'}).props()).toMatchObject({agencyId:2,clientId:'17',clinicalSessionId:'101',officeEventId:'201'});expect(m.get).not.toHaveBeenCalled();expect(w.find('.sr-app').exists()).toBe(false);w.unmount();});
 it('returns only opaque recording and saved-draft context ids to Note Workspace',async()=>{const w=shallowMount(View);await flushPromises();w.findComponent({name:'ClinicalSessionRecordingPanel'}).vm.$emit('narrative-ready',{narrative:'Private clinical text must not enter a URL',recordingId:501});await flushPromises();expect(m.push).toHaveBeenCalledWith({path:'/itsco/note-aid',query:expect.objectContaining({recordingId:'501',draftId:'55',clientId:'17',clinicalSessionId:'101',officeEventId:'201'})});expect(JSON.stringify(m.push.mock.calls)).not.toContain('Private clinical text');w.unmount();});
 it('does not permit unlinked clinical note recording or queryless setup',async()=>{m.route.query={};const w=shallowMount(View);await flushPromises();expect(w.findComponent({name:'ClinicalSessionRecordingPanel'}).exists()).toBe(false);expect(w.get('[role="alert"]').text()).toContain('actual clinical session');expect(m.get).not.toHaveBeenCalled();w.unmount();});
});
