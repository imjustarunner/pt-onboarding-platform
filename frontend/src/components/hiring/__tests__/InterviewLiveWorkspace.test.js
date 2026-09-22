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
 expect(api.put).toHaveBeenCalledWith('/hiring/interview-hub/interviews/4/artifacts', expect.objectContaining({myRatings:{communication:4}}));
 expect(wrapper.text()).toContain('Progress saved');
});
