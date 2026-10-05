import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Dashboard from '../SchoolReinitDashboard.vue';
import { SECTION_META } from '../../../../utils/schoolReinit';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

let wrapper;
let payload;
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  payload = {
    cycle: { id: 12, status: 'in_progress', school_year: '2026-2027' },
    agency: { name: 'ITSCO' }, school: { name: 'Keller Elementary School' },
    sections: SECTION_META.map(({ key }) => ({ sectionKey: key, reviewed: true, completed: true, data: {} })),
    questions: [{ question_key: 'overall_satisfaction', section_key: 'growth_feedback',
      label: 'Overall, how satisfied are you with ITSCO?', input_type: 'likert', required: 1, enabled: 1 }],
  };
  api.put.mockImplementation(async (url, body) => {
    const section = payload.sections.find(s => url.endsWith(`/sections/${s.sectionKey}`));
    Object.assign(section, { data: body.data, reviewed: body.reviewed, completed: body.completed });
    return { data: { sections: structuredClone(payload.sections) } };
  });
  api.post.mockImplementation(async () => {
    expect(payload.sections.find(s => s.sectionKey === 'growth_feedback').data.overall_satisfaction).toBe(5);
    return { data: { cycle: { ...payload.cycle, status: 'finalized' } } };
  });
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });

async function openFeedback() {
  wrapper = mount(Dashboard, {
    props: { initialPayload: payload },
    global: { stubs: { PostSchoolEventModal: true, SchoolReinitReceipt: true } },
  });
  await flushPromises();
  const step = wrapper.findAll('.cua__step').find(b => b.text().includes('Growth & Feedback'));
  await step.trigger('click');
  await wrapper.findAll('.dyn-q__scale-btn')[4].trigger('click');
}

describe('collaborative update submission', () => {
  it('leaves unchanged sections alone when their answers are already saved', async () => {
    payload.sections.find(s => s.sectionKey === 'growth_feedback').data.overall_satisfaction = 5;
    await openFeedback();
    await wrapper.find('.cua__finalize-btn').trigger('click');
    await flushPromises();
    expect(api.put).not.toHaveBeenCalled();
    expect(wrapper.emitted('finalized')).toHaveLength(1);
  });

  it('persists a rating edited after review before finalizing', async () => {
    await openFeedback();
    await wrapper.find('.cua__finalize-btn').trigger('click');
    await flushPromises();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledWith('/school-reinit/me/sections/growth_feedback', expect.objectContaining({
      data: { overall_satisfaction: 5 }, reviewed: true, completed: true,
    }));
    expect(api.post).toHaveBeenCalledWith('/school-reinit/me/finalize', expect.any(Object));
    expect(wrapper.emitted('finalized')).toHaveLength(1);
  });

  it('keeps the rating and blocks finalization when saving fails, then allows retry', async () => {
    await openFeedback();
    api.put.mockRejectedValueOnce(new Error('Connection lost'));
    await wrapper.find('.cua__finalize-btn').trigger('click');
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Connection lost');
    expect(wrapper.find('.dyn-q__scale-btn.selected').text()).toBe('5');
    await wrapper.find('.cua__finalize-btn').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('finalized')).toHaveLength(1);
  });

  it('does not advance an unreviewed section after a failed confirmation save', async () => {
    payload.sections.find(s => s.sectionKey === 'growth_feedback').reviewed = false;
    payload.sections.find(s => s.sectionKey === 'growth_feedback').completed = false;
    await openFeedback();
    api.put.mockRejectedValueOnce(new Error('Connection lost'));
    await wrapper.find('.sec-actions .btn-confirm').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Connection lost');
    expect(wrapper.find('.dyn-q__scale-btn.selected').text()).toBe('5');
    expect(wrapper.find('.cua__finalize-btn').attributes('disabled')).toBeDefined();
  });
});
