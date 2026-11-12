import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Details from '../PublicProviderProfileDetails.vue';

const provider = { firstName:'Example', displayName:'Example Provider', specialties:['Anxiety','Depression'], ageGroups:['Adults (18+)','Adults (18+)'], focus:['Individuals'], modalities:['CBT'], interventions:['Mindfulness'] };
const section = (w,title) => w.findAll('.profile-panel').find(item => item.find('h2').text() === title);
describe('shared public provider details',()=>{
 it('shows published biography, clients, approaches, insurance and optional practice details',()=>{
  const w=mount(Details,{props:{provider,profile:{publicBlurb:'A collaborative practice.',insurancesAccepted:['Example Plan'],details:{gender:'Female'}},practice:{name:'Example Practice',setting:'Virtual',service:'Individual therapy',location:'Colorado',languages:'English',firstVisit:'Discuss your goals.'}}});
  expect(w.text()).toContain('A collaborative practice.');expect(w.text()).toContain('Example Practice');expect(w.text()).toContain('Discuss your goals.');expect(section(w,'Client ages').findAll('.profile-tags span').map(item=>item.text())).toEqual(['Adults (18+)']);
  expect(section(w,'Populations served').text()).toContain('Individuals');expect(section(w,'Approaches').text()).toContain('Mindfulness');expect(section(w,'Insurance accepted').text()).toContain('Example Plan');expect(section(w,'Provider gender').text()).toContain('Female');w.unmount();
 });
 it('retains reviewed highlights, exclusions and the distinction between specialties and fit discussions',()=>{
  const clinicalFocus={reviewed:true,top:{specialties:['Anxiety']},excluded:{specialties:['Depression']}};
  const w=mount(Details,{props:{provider,profile:{details:{clinicalFocus}}}});const specialties=section(w,'Specialties');
  expect(specialties.findAll(':scope > .profile-tags span').map(item=>item.text())).toEqual(['Anxiety']);expect(specialties.text()).not.toContain('Depression');expect(specialties.find('summary').text()).toBe('Other areas open to discussing fit');expect(specialties.find('details').text()).toContain('not claims of specialized training');w.unmount();
 });
 it('preserves tutoring subjects and grades without substituting clinical focus',()=>{
  const w=mount(Details,{props:{provider:{...provider,tutoringProfile:{subjectAreas:['Math'],gradeLevels:['Grade 6']}},service:'tutoring',profile:{insurancesAccepted:['Clinical insurer'],details:{clinicalFocus:{reviewed:true,top:{specialties:['Anxiety']}}}}}});
  expect(section(w,'Subjects').text()).toContain('Math');expect(section(w,'Grades').text()).toContain('Grade 6');expect(section(w,'Subjects').text()).not.toContain('Anxiety');expect(w.text()).not.toContain('Insurance accepted');expect(w.text()).not.toContain('Clinical insurer');w.unmount();
 });
 it('keeps unpublished placeholders on real profiles and hides them only for a complete fictional example',()=>{
  const w=mount(Details,{props:{provider:{displayName:'Example'}}});expect(w.text()).toContain('has not published a biography yet');expect(w.findAll('.profile-facets section')).toHaveLength(6);expect(w.find('.profile-practice').exists()).toBe(false);w.unmount();
  const demo=mount(Details,{props:{provider:{displayName:'Example'},hideUnpublished:true}});expect(demo.findAll('.profile-facets section')).toHaveLength(0);demo.unmount();
 });
});
