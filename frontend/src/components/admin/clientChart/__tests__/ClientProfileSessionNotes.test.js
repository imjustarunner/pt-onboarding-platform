import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),push:vi.fn(async()=>{})}));
vi.mock('../../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('vue-router',()=>({useRouter:()=>({push:m.push}),useRoute:()=>({params:{organizationSlug:'itsco'}})}));
import Feed from '../ClientClinicalNotesFeed.vue';
import Picker from '../ClientNoteTypePicker.vue';
import Overview from '../ClientRecordsOverview.vue';
let wrapper;
afterEach(()=>{wrapper?.unmount();vi.clearAllMocks();});
const empty=()=>({data:{notes:[],sessions:[],plans:[],artifacts:[]}});
async function feed(){m.get.mockImplementation(async()=>empty());wrapper=mount(Feed,{props:{clientId:4,agencyId:2,organizationSlug:'itsco'},global:{stubs:{NoteAidDocumentationQueue:true,ClientChartCompletedNote:true,ClientManualNoteForm:true,AppointmentChangeWizard:true}}});await flushPromises();return wrapper;}

it.each([{}, {isLearning:true},{isTutoring:true}])('limits profile writing to contact and miscellaneous notes for %j',props=>{
  wrapper=mount(Picker,{props});
  expect(wrapper.findAll('.cntp-card-label').map(node=>node.text())).toEqual(['Contact note','Miscellaneous note']);
  expect(wrapper.text()).toContain('client’s to-do list');
});
it('provides a real client-scoped session to-do list and opens the exact selected session',async()=>{
  const w=await feed(),queue=w.findComponent({name:'NoteAidDocumentationQueue'});
  expect(w.text()).toContain('Client’s to-do list');
  expect(queue.props()).toMatchObject({agencyId:2,clientId:4,sessionOnly:true});
  queue.vm.$emit('select',{clinicalSessionId:71,officeEventId:90,dateOfService:'2026-11-15',serviceCode:'H0004'});
  await flushPromises();
  expect(m.push).toHaveBeenCalledWith({path:'/itsco/note-aid',query:{agencyId:'2',clientId:'4',clinicalSessionId:'71',officeEventId:'90',dateOfService:'2026-11-15',serviceCode:'H0004',noteType:'PROGRESS_NOTE',launchIntent:'progress_note'}});
  expect(m.post).not.toHaveBeenCalled();
});
it('does not create a blank progress draft from the profile picker or an unbacked to-do item',async()=>{
  const w=await feed();
  w.findComponent({name:'NoteAidDocumentationQueue'}).vm.$emit('select',{dateOfService:'2026-11-15',serviceCode:'H0004'});
  w.findComponent({name:'NoteAidDocumentationQueue'}).vm.$emit('select',{officeEventId:90,dateOfService:'2026-11-15',serviceCode:'H0004'});
  await w.findAll('button').find(button=>button.text()==='Add contact / misc note').trigger('click');
  const picker=w.findComponent(Picker);
  picker.vm.$emit('select',{path:'note-aid',kind:'progress'});
  await flushPromises();
  expect(picker.exists()).toBe(true);
  expect(w.findComponent({name:'ClinicalNoteGeneratorView'}).exists()).toBe(false);
  expect(m.push).not.toHaveBeenCalled();expect(m.post).not.toHaveBeenCalled();
});
it('forwards appointment-only session backing and its saved timezone from the client to-do list',async()=>{
  const w=await feed();
  w.findComponent({name:'NoteAidDocumentationQueue'}).vm.$emit('select',{clinicalSessionId:72,appointmentId:94,sourceTimezone:'America/Denver',scheduledStartAt:'2026-11-16T01:00:00Z',scheduledEndAt:'2026-11-16T02:00:00Z',dateOfService:'2026-11-15',serviceCode:'H0004'});
  await flushPromises();
  expect(m.push).toHaveBeenCalledWith(expect.objectContaining({query:expect.objectContaining({clinicalSessionId:'72',appointmentId:'94',sourceTimezone:'America/Denver',scheduledStartAt:'2026-11-16T01:00:00Z',scheduledEndAt:'2026-11-16T02:00:00Z',dateOfService:'2026-11-15'})}));
  expect(m.post).not.toHaveBeenCalled();
});
it('routes the overview to the client to-do list instead of guessing the latest session',async()=>{
  m.get.mockImplementation(async()=>({data:{notes:[],sessions:[{id:71,scheduled_start_at:'2026-11-15T17:00:00Z'}],encounters:[]}}));
  wrapper=mount(Overview,{props:{clientId:4,agencyId:2}});await flushPromises();
  await wrapper.findAll('button').find(button=>button.text()==='Open client’s to-do list').trigger('click');
  expect(wrapper.emitted('navigate')).toContainEqual(['notes']);
  expect(m.push).not.toHaveBeenCalled();expect(m.post).not.toHaveBeenCalled();
});
