import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import WeeklyAvailabilityPicker from '../../components/careers/WeeklyAvailabilityPicker.vue';
import CandidateResumeWorkspace from '../../components/hiring/CandidateResumeWorkspace.vue';
describe('application availability', () => {
  it('selects days and ranges without typing, and restores a saved selection', async () => {
    const wrapper = mount(WeeklyAvailabilityPicker, { props: { modelValue: 'Wednesday 14:00–15:00 (America/Denver)' } });
    expect(wrapper.findAll('input[type=checkbox]')[2].element.checked).toBe(true);
    expect(wrapper.get('[aria-label="Wednesday start time"]').element.value).toBe('14:00');
    await wrapper.get('[aria-label="Wednesday start time"]').setValue('16:00');
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe('Wednesday 16:00–16:30 (America/Denver)');
    expect(wrapper.find('textarea').exists()).toBe(false);
    wrapper.unmount();
  });
  it('keeps older free-text availability until the applicant changes it', async () => {
    const wrapper = mount(WeeklyAvailabilityPicker, { props: { modelValue: 'Wednesdays 2–3pm' } });
    expect(wrapper.text()).toContain('Wednesdays 2–3pm'); expect(wrapper.emitted()).toEqual({});
    await wrapper.findAll('input[type=checkbox]')[0].setValue(true);
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toContain('Monday 09:00–17:00'); wrapper.unmount();
  });
});
describe('resume assessment', () => {
  it('shows a readable original and offers extracted text', async () => {
    const wrapper = mount(CandidateResumeWorkspace, { props: { resumes: [{ id: 173, mimeType: 'application/pdf', resumeParseStatus: 'completed' }], resolveViewerUrl: async () => ({ url: 'https://files.example/resume.pdf', mimeType: 'application/pdf', extractedText: 'Jordan, counselor' }) } });
    await flushPromises(); expect(wrapper.get('iframe').attributes('src')).toContain('resume.pdf');
    await wrapper.findAll('button').find(b => b.text() === 'Extracted text').trigger('click');
    expect(wrapper.get('pre').text()).toBe('Jordan, counselor'); wrapper.unmount();
  });
  it('reports a file failure instead of presenting an empty frame', async () => {
    const wrapper = mount(CandidateResumeWorkspace, { props: { resumes: [{ id: 173 }], resolveViewerUrl: vi.fn().mockRejectedValue(new Error('missing')) } });
    await flushPromises(); expect(wrapper.text()).toContain('The resume could not be opened'); expect(wrapper.find('iframe').exists()).toBe(false); wrapper.unmount();
  });
});
