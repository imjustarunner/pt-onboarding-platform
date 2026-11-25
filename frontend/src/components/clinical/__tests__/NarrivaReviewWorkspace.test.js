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

it('lets the author edit the displayed sections and submits them together for recheck',async()=>{
 const w=mount(Workspace,{props:{preGeneration:true,review:{id:51,status:'passed',draftPreview:'Synthetic draft',draftPreviewSections:{Subjective:'Caregiver reports a concern.',Plan:'Continue the documented assessment.'}}}});
 await w.get('button').trigger('click');expect(w.findAll('textarea')).toHaveLength(2);
 await w.get('[aria-label="Subjective"]').setValue('Caregiver reports a concern and supplied additional clinical context.');
 await w.findAll('button').find(button=>button.text()==='Save edits and recheck').trigger('click');
 expect(w.emitted('edit')[0][0]).toEqual({Subjective:'Caregiver reports a concern and supplied additional clinical context.',Plan:'Continue the documented assessment.'});expect(w.findAll('textarea')).toHaveLength(0);w.unmount();
});
it('requires a fresh review before editing an old preview while retaining its wording',()=>{
 const w=mount(Workspace,{props:{preGeneration:true,review:{id:51,status:'stale',draftPreview:'Previous wording',draftPreviewSections:{Subjective:'Previous wording'}}}});
 expect(w.get('button').attributes()).toHaveProperty('disabled');expect(w.text()).toContain('Previous wording');w.unmount();
});

it('requires approval of each displayed section and resets it for a new draft',async()=>{
 const review={id:51,status:'passed',draftApprovalToken:'revision-1',draftPreview:'Synthetic draft',draftPreviewSections:{Subjective:'Caregiver reported a concern.',Plan:'Continue the documented assessment.'}};
 const w=mount(Workspace,{props:{preGeneration:true,review}});
 const boxes=w.findAll('.narriva-section-approval input');
 expect(boxes).toHaveLength(2);
 await boxes[0].setValue(true);
 expect(w.emitted('approval').at(-1)).toEqual([null]);
 await boxes[1].setValue(true);
 expect(w.emitted('approval').at(-1)).toEqual([{token:'revision-1',sections:['Subjective','Plan'],method:'individual'}]);
 await w.setProps({review:{...review,draftApprovalToken:'revision-2'}});
 expect(w.findAll('.narriva-section-approval input').every(box=>!box.element.checked)).toBe(true);
 expect(w.emitted('approval').at(-1)).toEqual([null]);
 await w.findAll('button').find(button=>button.text()==='Mark all as reviewed and approved').trigger('click');
 expect(w.emitted('approval').at(-1)).toEqual([{token:'revision-2',sections:['Subjective','Plan'],method:'all'}]);
 w.unmount();
});
