import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Form from '../StudentTrainingEvaluationForm.vue';
import Panel from '../StudentTrainingEvaluationsPanel.vue';
import template from '../../../../../backend/src/content/evaluations/itsco-student-training-v1.json';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
import api from '../../../services/api';
const blank = () => ({ scores: {}, notes: {}, summary: '', nextSteps: '' });
const record = () => ({ id: 9, agencyId: 2, studentUserId: 10, studentName: 'Test intern', evaluatorName: 'Test supervisor', year: 2026, quarter: 4, status: 'draft', revision: 1, template, response: blank(), canEdit: true });
const button = (w, label) => w.findAll('button').find(b => b.text() === label);
beforeEach(() => vi.resetAllMocks());

describe('student training form', () => {
  it('distinguishes blank, zero and full scores, and emits numeric scores', async () => {
    const w = mount(Form, { props: { template } });
    expect(w.get('.training-total').text()).toContain('0 of 7');
    await w.get('select').setValue('0');
    expect(w.emitted('update:modelValue')[0][0].scores[template.sections[0].key]).toBe(0);
    const scores = Object.fromEntries(template.sections.map(s => [s.key, 0]));
    await w.setProps({ modelValue: { ...blank(), scores } });
    expect(w.get('.training-total strong').text()).toBe('0 / 100');
    await w.setProps({ modelValue: { ...blank(), scores: Object.fromEntries(template.sections.map(s => [s.key, s.maxPoints])) } });
    expect(w.get('.training-total strong').text()).toBe('100 / 100');
    w.unmount();
  });
  it('renders every scoring guide with no editable fields in the appendix', () => {
    const w = mount(Form, { props: { template, preview: true } });
    expect(w.findAll('.training-category')).toHaveLength(7);
    expect(w.findAll('.training-band')).toHaveLength(28);
    expect(w.findAll('select, textarea').every(e => e.element.disabled)).toBe(true);
    expect(w.text()).toContain('Individual responses are private');
    w.unmount();
  });
});

describe('student training workflow', () => {
  async function opened(value = record()) {
    api.get.mockResolvedValueOnce({ data: { evaluations: [value], students: [] } }).mockResolvedValueOnce({ data: value });
    const w = mount(Panel, { props: { agencyId: 2 } });
    await flushPromises();
    await w.get('.training-records button').trigger('click');
    await flushPromises(); return w;
  }
  it('saves a draft with the current revision then submits only after all scores and confirmation', async () => {
    const w = await opened();
    expect(button(w, 'Submit evaluation').element.disabled).toBe(true);
    await w.get('.training-form select').setValue('0');
    api.put.mockImplementation(async (_url, payload) => ({ data: { ...record(), response: payload.response, revision: 2 } }));
    await button(w, 'Save draft').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/evaluations/student-training/9', expect.objectContaining({ agencyId: 2, revision: 1 }));
    expect(w.text()).toContain('Draft saved');
    for (const select of w.findAll('.training-form select')) await select.setValue('0');
    expect(button(w, 'Submit evaluation').element.disabled).toBe(true);
    await w.get('input[type="checkbox"]').setValue(true);
    api.post.mockImplementation(async (_url, payload) => ({ data: { ...record(), response: payload.response, status: 'submitted', total: 0, outcome: 'Unsatisfactory', revision: 3, canEdit: false } }));
    await button(w, 'Submit evaluation').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/evaluations/student-training/9/submit', expect.objectContaining({ revision: 2 }));
    expect(w.text()).toContain('Submitted · Read-only record');
    expect(w.findAll('.training-form select').every(s => s.element.disabled)).toBe(true);
    w.unmount();
  });
  it('preserves unsaved notes on a stale-save error', async () => {
    const w = await opened();
    await w.get('textarea').setValue('Keep this observation');
    api.put.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Reload before saving.' } } } });
    await button(w, 'Save draft').trigger('click'); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Reload');
    expect(w.get('textarea').element.value).toBe('Keep this observation');
    expect(w.text()).toContain('Unsaved changes'); w.unmount();
  });
  it('lets interns read their submitted record without editing controls', async () => {
    const w = await opened({ ...record(), status: 'submitted', canEdit: false });
    expect(w.find('.training-save').exists()).toBe(false);
    expect(w.findAll('.training-form select, .training-form textarea').every(e => e.element.disabled)).toBe(true);
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('discards late record responses when switching agency', async () => {
    let resolveRecord;
    api.get.mockResolvedValueOnce({ data: { evaluations: [record()] } }).mockImplementationOnce(() => new Promise(resolve => { resolveRecord = resolve; }));
    const w = mount(Panel, { props: { agencyId: 2 } }); await flushPromises();
    await w.get('.training-records button').trigger('click');
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    await w.setProps({ agencyId: 3 }); await flushPromises();
    resolveRecord({ data: record() }); await flushPromises();
    expect(w.text()).not.toContain('Test intern');
    expect(w.find('.training-form').exists()).toBe(false); w.unmount();
  });
});
