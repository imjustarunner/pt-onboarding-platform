import {shallowMount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({route:null,fetch:vi.fn(),save:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>m.route}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:453,name:'NLU QA'}})}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({})}));
vi.mock('../../../services/inPersonTutoring',async importOriginal=>({...await importOriginal(),fetchInPersonPlan:m.fetch,saveInPersonPlan:m.save}));
vi.mock('../../../components/classroom/ClassroomFillablePdfWorkspace.vue',()=>({default:{template:'<div/>'}}));
vi.mock('../../../components/tutoring/TutorSessionGuidePanel.vue',()=>({default:{template:'<div/>'}}));
vi.mock('../../../components/tutoring/TutoringSessionLearningPanel.vue',()=>({default:{template:'<div/>'}}));
import View from '../InPersonTutoringSessionView.vue';
import {createEmptyInPersonPayload} from '../../../services/inPersonTutoring';
let wrapper;
beforeEach(()=>{m.route=reactive({params:{sessionId:'10',organizationSlug:'nlu-qa-demo'},query:{}});m.fetch.mockReset();});
afterEach(()=>wrapper?.unmount());
const data=(id,name)=>({...createEmptyInPersonPayload(),session:{id,status:'scheduled'},student:{clientId:id,name},canModerate:true});
it('shows a neutral loading state and never grants demo permissions before authorization',async()=>{
 m.fetch.mockReturnValue(new Promise(()=>{}));wrapper=shallowMount(View);await flushPromises();
 expect(wrapper.text()).toContain('Loading this student');expect(wrapper.text()).not.toMatch(/Mia|Lopez/);expect(wrapper.find('.ipts-shell').exists()).toBe(false);expect(wrapper.find('.ipts-stage-card').exists()).toBe(false);
});
it('ignores a previous student response after the session changes',async()=>{
 let old; m.fetch.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve;})).mockResolvedValueOnce(data(11,'Quinn QA'));
 wrapper=shallowMount(View);await flushPromises();m.route.params.sessionId='11';await flushPromises();expect(wrapper.text()).toContain('Quinn QA');
 old(data(10,'Parker QA'));await flushPromises();expect(wrapper.text()).toContain('Quinn QA');expect(wrapper.text()).not.toContain('Parker QA');
});
it('clears the old student when the replacement request is denied',async()=>{
 m.fetch.mockResolvedValueOnce(data(10,'Parker QA')).mockRejectedValueOnce({response:{data:{error:{message:'Access denied'}}}});
 wrapper=shallowMount(View);await flushPromises();expect(wrapper.text()).toContain('Parker QA');m.route.params.sessionId='12';await flushPromises();expect(wrapper.text()).toContain('Access denied');expect(wrapper.text()).not.toContain('Parker QA');expect(wrapper.find('.ipts-shell').exists()).toBe(false);
});

it('does not replace the new student with a delayed save response from the old session',async()=>{let resolveSave;m.fetch.mockResolvedValueOnce(data(10,'Parker QA')).mockResolvedValueOnce(data(11,'Quinn QA'));m.save.mockReturnValue(new Promise(resolve=>{resolveSave=resolve;}));wrapper=shallowMount(View);await flushPromises();const saving=wrapper.vm.$.setupState.saveNotes();m.route.params.sessionId='11';await flushPromises();resolveSave(data(10,'Parker QA'));await saving;await flushPromises();expect(wrapper.text()).toContain('Quinn QA');expect(wrapper.text()).not.toContain('Parker QA');});
