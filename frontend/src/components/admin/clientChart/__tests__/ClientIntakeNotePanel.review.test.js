import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),push:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:{get:mocks.get,post:mocks.post}}));
vi.mock('../../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{slug:'demo'}})}));
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push})}));
vi.mock('../../../clinical/NoteAidIntakeImportReview.vue',()=>({default:{template:'<div />'}}));
vi.mock('../ClientChartAvatar.vue',()=>({default:{template:'<div />'}}));
import Panel from '../ClientIntakeNotePanel.vue';
const draft={id:1,status:'ready',serviceCode:'90791',diagnosisAction:'confirmed',confirmedDiagnosis:{code:'R69'},sections:[{key:'mse',label:'Mental Status Examination',body:'Not observed. '.repeat(30)},{key:'risk',label:'Risk Assessment',body:'Not assessed.'}],sourceReview:{fingerprint:'current',sourceText:'Guardian reports sleep concerns.'}};
let wrapper;
const mountPanel=()=>{wrapper=mount(Panel,{props:{clientId:2304,assignedProvider:true,client:{full_name:'QA',date_of_birth:'2015-05-18T00:00:00.000Z',gender:'F'}}});return wrapper;};
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue({data:{draft:structuredClone(draft),history:[],appointmentOptions:[{clinicalSessionId:77,appointmentId:135,startsAt:'2026-11-03T23:00:00Z',timeZone:'America/Denver',serviceCode:'90791'}]}});mocks.post.mockResolvedValue({data:{draft:{...draft,status:'final'}}});});
afterEach(()=>wrapper?.unmount());
it('does not label long unreviewed sections complete or enable finalization on diagnosis alone',async()=>{
 mountPanel();await flushPromises();expect(wrapper.text()).toContain('Needs source review');expect(wrapper.text()).not.toContain('Ready to finalize');expect(wrapper.text()).toContain('May 18, 2015');expect(wrapper.text()).toContain('Female');expect(wrapper.findAll('button').find(button=>button.text()==='Finalize intake only').attributes('disabled')).toBeDefined();
});
it('requires section reviews and appointment selection, then submits a review bound to the displayed source',async()=>{
 mountPanel();await flushPromises();
 for(const button of wrapper.findAll('.cin-section__toggle'))await button.trigger('click');
 for(const input of wrapper.findAll('input[type="checkbox"]'))await input.setValue(true);
 const finalize=wrapper.findAll('button').find(button=>button.text()==='Finalize intake only');expect(finalize.attributes('disabled')).toBeDefined();
 await wrapper.find('select').setValue('77');expect(finalize.attributes('disabled')).toBeUndefined();await finalize.trigger('click');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/2304/intake-note/1/finalize',{sourceReview:{fingerprint:'current',sectionKeys:['mse','risk'],sourceCompared:true,unsupportedClaimsRemoved:true,appointmentReviewed:true,clinicalSessionId:77}});
});
it('clears review after diagnosis changes return a new content fingerprint',async()=>{
 mountPanel();await flushPromises();for(const button of wrapper.findAll('.cin-section__toggle'))await button.trigger('click');for(const input of wrapper.findAll('input[type="checkbox"]'))await input.setValue(true);await wrapper.find('select').setValue('77');
 mocks.post.mockResolvedValue({data:{draft:{...draft,sourceReview:{...draft.sourceReview,fingerprint:'changed'}}}});await wrapper.findAll('button').find(button=>button.text()==='Diagnosis confirmed').trigger('click');await flushPromises();
 expect(wrapper.findAll('input[type="checkbox"]').every(input=>!input.element.checked)).toBe(true);expect(wrapper.findAll('button').find(button=>button.text()==='Finalize intake only').attributes('disabled')).toBeDefined();
});

it('keeps source visible but prevents finalization when appointment information is unavailable',async()=>{
 mocks.get.mockResolvedValue({data:{draft:structuredClone(draft),history:[],appointmentOptions:[],appointmentOptionsUnavailable:true}});mountPanel();await flushPromises();
 expect(wrapper.text()).toContain('Appointment information could not be loaded');expect(wrapper.text()).not.toContain('No matching appointment is available');
 for(const button of wrapper.findAll('.cin-section__toggle'))await button.trigger('click');for(const input of wrapper.findAll('input[type="checkbox"]'))await input.setValue(true);
 expect(wrapper.findAll('button').find(button=>button.text()==='Finalize intake only').attributes('disabled')).toBeDefined();
});
