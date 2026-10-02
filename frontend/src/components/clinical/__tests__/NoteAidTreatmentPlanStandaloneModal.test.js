import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Writer from '../NoteAidTreatmentPlanStandaloneModal.vue';
import api from '../../../services/api.js';
import { parseNoteSections } from '../../../../../backend/src/services/clinicalNoteSections.service.js';
import { parseTreatmentPlanText } from '../../../../../backend/src/services/treatmentPlanImport.service.js';

vi.mock('../../../services/api.js', () => ({ default: { post: vi.fn(), patch: vi.fn() } }));

const planText = `Diagnosis: F41.9 - Synthetic diagnosis
Diagnostic Justification: Synthetic example for testing.
Presenting Problem: Difficulty coping with stress.
Goal 1: Improve coping.
Objective 1.1: Increase coping from a current self-reported level of 3 to a target of 7 on a 1–10 scale.
Goal 2: Improve communication.
Objective 2.1: Increase communication from a current self-reported level of 4 to a target of 8 on a 1–10 scale.
Discharge Plan: Sustained independent coping.`;
let wrapper;
const click = async (label) => {
  await wrapper.findAll('button').find((b) => b.text() === label).trigger('click');
  await flushPromises();
};

beforeEach(() => {
  vi.resetAllMocks();
  api.post.mockImplementation(async (url, body) => {
    if (url === '/clinical-notes/generate') {
      return { data: { draftId: 42, outputJson: { sections: parseNoteSections(planText), meta: { toolId: 'clinical_psychotherapy_plan' } } } };
    }
    if (url === '/medical-billing/treatment-plans/parse') {
      // Match the real parser's response, including its wrapper and agency requirement.
      if (body.agencyId !== 7) throw new Error('agencyId is required');
      return { data: { parsed: parseTreatmentPlanText(body.text) } };
    }
    if (url === '/clinical-notes/drafts') return { data: { draft: { id: 43 } } };
    throw new Error(`Unexpected endpoint: ${url}`);
  });
  api.patch.mockResolvedValue({ data: {} });
  wrapper = mount(Writer, { props: { open: true, agencyId: 7 }, global: { stubs: { teleport: true } } });
});
afterEach(() => wrapper.unmount());

function expectReview() {
  expect(wrapper.find('.na-tp-error').exists()).toBe(false);
  expect(wrapper.find('.na-tp-review').exists()).toBe(true);
  const goals = wrapper.findAll('.na-tp-goal');
  expect(goals).toHaveLength(2);
  expect(goals[0].find('textarea').element.value).toBe('Improve coping.');
  expect(goals[1].find('textarea').element.value).toBe('Improve communication.');
  expect(goals[0].find('.na-tp-obj textarea').element.value).toContain('current self-reported level of 3');
  expect(goals[0].findAll('input[type="number"]').map((i) => i.element.value)).toEqual(['3', '7']);
}

it('reviews the real generation response without selecting a client, then saves it to the library', async () => {
  await wrapper.find('textarea').setValue('Synthetic presenting problem.');
  await click('AI write plan, then review');
  expectReview();
  const [, parseBody] = api.post.mock.calls.find(([url]) => url.endsWith('/parse'));
  expect(parseBody.agencyId).toBe(7);
  expect(parseBody).not.toHaveProperty('clientId');
  await click('Save to library (initials only)');
  const [, patch] = api.patch.mock.calls[0];
  const saved = JSON.parse(patch.outputJson).meta.structuredPlan;
  expect(saved.goals).toHaveLength(2);
  expect(saved.diagnosticJustification).toContain('Synthetic example');
  expect(saved.dischargePlan).toContain('Sustained independent coping');
  expect(wrapper.emitted('saved')[0][0].id).toBe(43);
});

it('reviews the real update response with a selected client', async () => {
  await wrapper.setProps({ clients: [{ id: 12, initials: 'TEST' }] });
  await wrapper.find('select').setValue('12');
  await click('Update existing plan');
  const fields = wrapper.findAll('textarea');
  await fields[0].setValue(planText);
  await fields[1].setValue('Update coping goals.');
  await click('Rewrite plan, then review');
  expectReview();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans/parse', expect.objectContaining({ agencyId: 7, clientId: 12 }), expect.any(Object));
});

it('parses a pasted plan without generating AI output or selecting a client', async () => {
  await wrapper.find('textarea').setValue(planText);
  await click('Parse into review');
  expectReview();
  expect(api.post).toHaveBeenCalledTimes(1);
});

it('shows the service error and retains the input when generation fails', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Please retry generation.' } } } });
  await wrapper.find('textarea').setValue('Synthetic input to retain.');
  await click('AI write plan, then review');
  expect(wrapper.find('.na-tp-error').text()).toBe('Please retry generation.');
  expect(wrapper.find('textarea').element.value).toBe('Synthetic input to retain.');
  expect(wrapper.find('.na-tp-review').exists()).toBe(false);
});

it('rejects an empty generation response before parsing or offering to save', async () => {
  api.post.mockResolvedValueOnce({ data: { outputJson: { sections: {} } } });
  await wrapper.find('textarea').setValue('Synthetic input.');
  await click('AI write plan, then review');
  expect(wrapper.find('.na-tp-error').text()).toBe('No plan returned.');
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(wrapper.find('.na-tp-review').exists()).toBe(false);
});

it('does not present an empty parsed result as a completed plan', async () => {
  await wrapper.find('textarea').setValue('No goals or objectives provided.');
  await click('Parse into review');
  expect(wrapper.find('.na-tp-error').text()).toContain('No treatment goals were found');
  expect(wrapper.find('.na-tp-review').exists()).toBe(false);
});
