import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {mount, flushPromises} from '@vue/test-utils';
import InterviewLiveWorkspace from '../InterviewLiveWorkspace.vue';
const api = vi.hoisted(() => ({get:vi.fn(), put:vi.fn()}));
vi.mock('../../../services/api', () => ({default:api}));
vi.mock('../../../store/auth', () => ({useAuthStore: () => ({user:{id:7}})}));
let wrapper;
beforeEach(() => {
 vi.clearAllMocks();
 document.body.innerHTML = '<aside id="candidate-brief"></aside>';
 api.get.mockImplementation(async url => {
  if(url.endsWith('/brief')) return {data:{data:{candidateName:'Candidate Example', role:'Counselor', reportText:'#### Key strengths for this role\n- Collaborative clinical experience\n\n**Discussion points**\n- Confirm availability'}}};
  if(url.includes('by-schedule-event')) return {data:{data:{interview:{id:4}, template:{scorecard_criteria_json:[]}, flow:{sections:[]}, artifact:{my_scorecard:{communication:2}}}}};
  return {data:{data:{}}};
 });
 api.put.mockResolvedValue({data:{data:{}}});
});
afterEach(() => {wrapper?.unmount(); document.body.innerHTML='';});
it('uses present tense for current roles and shares the exact role prompt', async () => {
 const get = api.get.getMockImplementation();
 api.get.mockImplementation(async url => url.endsWith('/brief') ? {data:{data:{summary:{workHistory:[
  {title:'Counselor',employer:'Current Practice',endDate:'Present'},
  {title:'Intern',employer:'Previous Practice',endDate:'2024'},
  {title:'Volunteer',employer:'Ongoing Practice'}
 ]}}}} : get(url));
 api.put.mockImplementation(async (url, body) => url.endsWith('/interview-question') ? {data:{question:{id:1,text:body.text}}} : {data:{data:{}}});
 wrapper=mount(InterviewLiveWorkspace,{props:{eventId:9}});await flushPromises();
 const cards=wrapper.findAll('.ilw-source-card').filter(card=>card.find('.ilw-prompt').exists());
 expect(cards[0].text()).toContain('What are you learning in your role at Current Practice');
 expect(cards[1].text()).toContain('What did you learn in your role at Previous Practice');
 expect(cards[2].text()).toContain('What are you learning in your role at Ongoing Practice');
 await cards[0].get('button').trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/team-meetings/9/interview-question', {text:'What are you learning in your role at Current Practice, and how would it apply here?'}, expect.any(Object));
 expect(cards[0].get('button').text()).toBe('Remove question');
 expect(wrapper.emitted('shared-question').at(-1)[0].text).toContain('What are you learning');
});
it('cycles both opener buttons without repeating the current question or reusing an option early',async()=>{
 const get=api.get.getMockImplementation();
 api.get.mockImplementation(async url=>url.includes('by-schedule-event')?{data:{data:{interview:{id:4},
  template:{salutation_pool_json:['Hello A','Hello B','Hello C'],icebreaker_pool_json:['Ice A','Ice B','Ice C']},
  flow:{sections:[{key:'salutation',label:'Salutation',item:'Hello A'},{key:'icebreaker',label:'Icebreaker',item:'Ice A'}]}
 }}}:get(url));
 wrapper=mount(InterviewLiveWorkspace,{props:{eventId:9}});await flushPromises();
 for(const [label,prefix] of [['New salutation','Hello'],['New icebreaker','Ice']]){
  const picks=[`${prefix} A`];
  for(let i=0;i<2;i++){
   await wrapper.findAll('button').find(button=>button.text()===label).trigger('click');await flushPromises();
   picks.push(api.put.mock.calls.at(-1)[1].sectionPatch.item);
  }
  expect(new Set(picks).size).toBe(3);
  await wrapper.findAll('button').find(button=>button.text()===label).trigger('click');await flushPromises();
  expect(api.put.mock.calls.at(-1)[1].sectionPatch.item).not.toBe(picks.at(-1));
 }
});
it('shows strengths alongside the resume and saves a rating from the visible scorecard',async () => {
 wrapper=mount(InterviewLiveWorkspace,{attachTo:document.body,props:{eventId:9,briefTarget:'#candidate-brief'}});
 await flushPromises();
 expect(document.querySelector('#candidate-brief .ilw-highlights').textContent).toContain('Collaborative clinical experience');
 await wrapper.findAll('.ilw-tab').find(button => button.text()==='Scorecard').trigger('click');
 const rating=wrapper.find('[aria-label="Communication: 4 out of 4"]');
 expect(rating.isVisible()).toBe(true);
 await rating.trigger('click');
 expect(rating.attributes('aria-pressed')).toBe('true');
 await wrapper.findAll('button').find(button => button.text()==='Save progress').trigger('click');
 await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/hiring/interview-hub/interviews/4/artifacts', expect.objectContaining({myRatings:{communication:4}}), {skipGlobalLoading:true});
 expect(wrapper.text()).toContain('Progress saved');
});
it('displays a guide question to the applicant, then replaces and removes it without ending the meeting', async () => {
 const defaultGet=api.get.getMockImplementation();
 api.get.mockImplementation(async url => url.includes('by-schedule-event') ? { data: { data: { interview: { id: 4 },
  flow: { sections: [{key:'standard',label:'Questions',questions:[{key:'a',text:'First question?'},{key:'b',text:'Next question?'}]}] } } } } : defaultGet(url));
 let id=0;
 api.put.mockImplementation(async (url, body) => url.endsWith('/interview-question') ? {data:{question:{id:++id,text:body.text}}} : {data:{data:{}}});
 wrapper=mount(InterviewLiveWorkspace,{props:{eventId:9}});await flushPromises();
 await wrapper.get('[aria-label="Show question: First question?"]').trigger('click');await flushPromises();
 expect(wrapper.get('.ilw-shared-question').text()).toContain('First question?');
 expect(wrapper.get('[aria-label="Remove question: First question?"]').attributes('aria-pressed')).toBe('true');
 await wrapper.get('[aria-label="Show question: Next question?"]').trigger('click');await flushPromises();
 expect(wrapper.get('.ilw-shared-question').text()).not.toContain('First question?');
 await wrapper.get('[aria-label="Remove question: Next question?"]').trigger('click');await flushPromises();
 expect(wrapper.get('.ilw-shared-question').text()).not.toContain('Next question?');
 expect(api.put.mock.calls.every(([url])=>!url.includes('end-guest-access'))).toBe(true);
});

it('rates the saved job guide rather than replacing it with current agency criteria',async()=>{
 const previous=api.get.getMockImplementation();
 api.get.mockImplementation(async url=>url.includes('by-schedule-event')?{data:{data:{interview:{id:4},template:{scorecard_criteria_json:[{key:'generic',label:'Generic criterion'}]},flow:{sections:[],scorecardCriteria:[{key:'clinical',label:'Clinical judgment'}]},artifact:{my_scorecard:{}}}}}:previous(url));
 wrapper=mount(InterviewLiveWorkspace,{props:{eventId:9}});await flushPromises();await wrapper.findAll('.ilw-tab').find(b=>b.text()==='Scorecard').trigger('click');
 const rating=wrapper.get('[aria-label="Clinical judgment: 4 out of 4"]');await rating.trigger('click');
 expect(wrapper.find('[aria-label="Generic criterion: 4 out of 4"]').exists()).toBe(false);
 await wrapper.findAll('button').find(b=>b.text()==='Save progress').trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/hiring/interview-hub/interviews/4/artifacts',expect.objectContaining({myRatings:{clinical:4}}),{skipGlobalLoading:true});
});
