import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../services/tutoringLearningOs', () => ({ fetchLearningOverview: vi.fn(), listSubjectPlans: vi.fn(), getLearningPlan: vi.fn(), getSessionNote: vi.fn(), saveSessionNote: vi.fn(), downloadSessionNotePdf: vi.fn() }));
import Panel from '../TutoringSessionLearningPanel.vue';
import Checklist from '../LearningPlanSessionChecklist.vue';
import { bundle } from '../../../../previews/learning-session/fixture';
const context = (title = 'Mathematics') => ({ tracks: [{ subject: { id: 18, subject_label: title }, bundle }], note: null });
describe('scheduled tutoring session documentation', () => {
  it('uses the booked-room transport and saves against the actual session and plan', async () => {
    const request = vi.fn(async path => path === '/learning-note-context' ? context() : { note: { id: 5 } });
    const wrapper = mount(Panel, { props: { clientId: 90004, agencyId: 90002, sessionId: 1001, request } }); await flushPromises();
    wrapper.getComponent(Checklist).vm.$emit('save', { planChecklist: { areas: [] } }); await flushPromises();
    expect(request).toHaveBeenCalledWith('/note', 'put', expect.objectContaining({ documentationMode: 'learning_plan_checklist', sessionId: 1001, studentSubjectId: 18, learningPlanId: 801 }));
    expect(wrapper.text()).toContain('Session record saved');
  });
  it('ignores a late context response from a previously selected client', async () => {
    let oldResponse; const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { oldResponse = resolve; })).mockResolvedValueOnce(context('New student subject'));
    const wrapper = mount(Panel, { props: { clientId: 1, sessionId: 1, request } });
    await wrapper.setProps({ clientId: 2, sessionId: 2 }); await flushPromises();
    oldResponse({ tracks: [{ subject: { id: 999, subject_label: 'Prior client' }, bundle: null }], note: { summary: 'Prior private content' } }); await flushPromises();
    expect(wrapper.findComponent(Checklist).exists()).toBe(true); expect(wrapper.text()).not.toContain('Prior private content');
  });
  it('does not silently overwrite a session note from an earlier plan', async () => {
    const request = vi.fn(async () => ({ ...context(), note: { learning_plan_id: 800, summary: 'Historic results', metadata_json: { planChecklist: { areas: [] } } } }));
    const wrapper = mount(Panel, { props: { clientId: 90004, sessionId: 1001, request } }); await flushPromises();
    expect(wrapper.findComponent(Checklist).exists()).toBe(false); expect(wrapper.text()).toContain('earlier learning plan'); expect(wrapper.text()).toContain('Historic results');
  });
  it('keeps a general observation available when no approved learning plan exists', async () => {
    const request = vi.fn(async path => path === '/learning-note-context' ? { tracks: [], note: null } : { note: { summary: 'Homework observation' } });
    const wrapper = mount(Panel, { props: { clientId: 90004, sessionId: 1001, request } }); await flushPromises();
    expect(wrapper.text()).toContain('No approved learning plan');
    await wrapper.get('textarea').setValue('Homework observation'); await wrapper.get('button').trigger('click'); await flushPromises();
    expect(request).toHaveBeenCalledWith('/note', 'put', expect.objectContaining({ summary: 'Homework observation' }));
  });
});
