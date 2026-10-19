import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import H0002ScreeningReview from '../H0002ScreeningReview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const data = () => ({ clientCode:'SAMPLE', sourceText:'Reported questionnaire and history', sourceHash:'source-version', psc:{complete:true,answered:17,total:11,subscales:{attention:{score:7,cutoff:7},internalizing:{score:1,cutoff:5},externalizing:{score:3,cutoff:7}}}, suggestedOutcome:'further_evaluation', reportedConcerns:true, safetyFlag:false, reviewServiceDate:'2026-10-19' });
async function open(overrides={}) {
  api.get.mockResolvedValue({data:{...data(),...overrides}});
  const wrapper=mount(H0002ScreeningReview,{props:{sessionId:12,agencyId:2},global:{stubs:{Teleport:true}}});
  await flushPromises();return wrapper;
}
describe('digital screening review',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('starts with further evaluation and cannot sign without clinician review',async()=>{
    const w=await open();
    expect(w.find('select').element.value).toBe('further_evaluation');
    expect(w.find('option[value="does_not_meet"]').element.disabled).toBe(true);
    expect(w.find('.btn-primary').element.disabled).toBe(true);
    expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('prefills a reviewable assessment without attesting or signing for the clinician',async()=>{
    const w=await open({proposedReview:{assessment:'Screening suggests further evaluation.',followUp:'Discuss treatment options.'}});
    expect(w.findAll('textarea').map(t=>t.element.value)).toEqual(['Screening suggests further evaluation.','Discuss treatment options.']);
    expect(w.findAll('input[type="checkbox"]').every(c=>!c.element.checked)).toBe(true);
    expect(w.find('.btn-primary').element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('sends only an explicit clinician determination and attestations',async()=>{
    const w=await open();
    const textareas=w.findAll('textarea');await textareas[0].setValue('Reported difficulties warrant further assessment.');await textareas[1].setValue('Discuss care options and arrange assessment.');
    await w.find('input:not([type="checkbox"])').setValue('ITSCO office');
    for(const checkbox of w.findAll('input[type="checkbox"]'))await checkbox.setValue(true);
    api.post.mockResolvedValue({data:{ok:true,noteId:99}});
    await w.find('.btn-primary').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/screening-sessions/12/sign',expect.objectContaining({agencyId:2,sourceHash:'source-version',outcome:'further_evaluation',reviewConfirmed:true,accurateAndComplete:true,medicalNecessityAttested:true}),expect.anything());
    expect(w.emitted('signed')).toHaveLength(1);w.unmount();
  });
  it('locks an incomplete screen instead of treating blanks as negative answers',async()=>{
    const w=await open({psc:{complete:false,invalid:true,answered:13,total:null,subscales:{}}});
    expect(w.text()).toContain('Invalid screening: too many missing items');expect(w.find('.btn-primary').element.disabled).toBe(true);w.unmount();
  });
  it('requires an extra confirmation for reported safety concerns',async()=>{
    const w=await open({safetyFlag:true});expect(w.text()).toContain('documented the indicated safety assessment');expect(w.findAll('input[type="checkbox"]')).toHaveLength(4);w.unmount();
  });
});
