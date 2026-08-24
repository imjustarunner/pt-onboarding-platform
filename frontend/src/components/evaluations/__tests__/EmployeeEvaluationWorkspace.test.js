import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeEvaluationWorkspace from '../EmployeeEvaluationWorkspace.vue';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn()
}));

vi.mock('../../../services/api', () => ({ default: apiMock }));

const sampleBundle = {
  cycle: {
    id: 42,
    status: 'in_progress',
    period_year: 2026,
    period_half: 'H2',
    job_title_snapshot: 'Mental Health Provider',
    agency_id: 2,
    employee_user_id: 10,
    admin_comments: null
  },
  responses: [
    {
      id: 1,
      template_slug: 'mental_health_counselor',
      template_name: 'Mental Health Counselor',
      is_supervisor_rubric: 0,
      status: 'draft',
      ratings_json: {},
      section_action_items_json: {},
      reflection_json: {},
      rubric_snapshot_json: {
        ratingScale: [
          { value: 1, label: 'Emerging' },
          { value: 2, label: 'Developing' },
          { value: 3, label: 'Proficient' },
          { value: 4, label: 'Exemplary' }
        ],
        sections: [
          {
            key: 'clinical',
            title: 'Clinical Practice',
            hasActionItems: true,
            criteria: [
              {
                key: 'c1',
                label: 'Therapeutic presence',
                anchors: { 1: 'Rarely', 2: 'Sometimes', 3: 'Often', 4: 'Always' }
              }
            ]
          }
        ],
        reflectionPrompts: [{ key: 'r1', label: 'What went well?' }]
      }
    }
  ],
  activity: []
};

describe('EmployeeEvaluationWorkspace', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockResolvedValue({ data: sampleBundle });
    apiMock.post.mockResolvedValue({
      data: {
        ...sampleBundle,
        cycle: { ...sampleBundle.cycle, status: 'submitted' },
        responses: [{ ...sampleBundle.responses[0], status: 'submitted' }]
      }
    });
  });

  it('renders rubric criteria and submits self-assessment', async () => {
    const wrapper = mount(EmployeeEvaluationWorkspace, {
      props: {
        bundle: sampleBundle,
        agencyId: 2,
        mode: 'employee'
      }
    });

    await flushPromises();
    expect(wrapper.text()).toContain('Therapeutic presence');
    expect(wrapper.text()).toContain('H2 2026');

    const radio = wrapper.find('input[type="radio"][value="3"]');
    expect(radio.exists()).toBe(true);
    await radio.setValue(true);
    await radio.trigger('change');

    const submitBtn = wrapper.find('button.ee-btn--primary');
    expect(submitBtn.exists()).toBe(true);
    await submitBtn.trigger('click');
    await flushPromises();

    expect(apiMock.post).toHaveBeenCalled();
    const [url, body] = apiMock.post.mock.calls[0];
    expect(String(url)).toContain('/evaluations/cycles/42/submit');
    expect(body.responses?.[0]?.ratings?.c1).toBeTruthy();

    wrapper.unmount();
  });
});
