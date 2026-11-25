import {describe,it,expect,vi} from 'vitest';
import {mount} from '@vue/test-utils';
import Workspace from '../NarrivaReviewWorkspace.vue';
describe('Narriva draft and findings',()=>{
 it('shows the reviewed text alongside findings and identifies loaded clinical enrollment sources',()=>{
  const w=mount(Workspace,{props:{preGeneration:true,review:{draftPreview:'Synthetic draft.',draftPreviewSections:{'Presenting Problem':'Synthetic caregiver report.'},enrollmentSources:{submissions:2,clinicalAnswers:19,instruments:['phq9']}}},slots:{default:'<p>Confirm the missing fact</p>'}});
  expect(w.get('[aria-label="Draft under review"]').text()).toContain('Synthetic caregiver report.');
  expect(w.get('.narriva-review-findings').text()).toContain('Confirm the missing fact');
  expect(w.get('.narriva-source-summary').text()).toContain('19 clinical answers');
  expect(w.findAll('textarea')).toHaveLength(0);
  w.unmount();
 });
 it('reports an empty enrollment source honestly and exposes the live stage while running',async()=>{
  vi.useFakeTimers();
  const w=mount(Workspace,{props:{preGeneration:true,busy:true,review:{stage:'drafting',enrollmentSources:{submissions:0,clinicalAnswers:0,instruments:[]}}}});
  expect(w.text()).toContain('No completed enrollment clinical answers were found');
  expect(w.text()).toContain('Writing your draft');
  vi.advanceTimersByTime(32000);
  await w.vm.$nextTick();
  expect(w.text()).toContain('32s elapsed');
  expect(w.get('[role="progressbar"]').attributes('aria-valuetext')).toContain('Write the note');
  await w.setProps({review:{stage:'checking',draftPreview:'Synthetic note',draftPreviewSections:{Plan:'Synthetic plan'}}});
  expect(w.get('[aria-label="Draft under review"]').text()).toContain('Synthetic plan');
  expect(w.findAll('.narriva-pending-checks li')).toHaveLength(5);
  w.unmount();vi.useRealTimers();
 });
});
