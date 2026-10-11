import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Book from '../WorkplaceHandbookBook.vue';
import Appendix from '../WorkplaceHandbookSelfAssessment.vue';
import Workspace from '../../evaluations/EmployeeEvaluationWorkspace.vue';
import StudentForm from '../../evaluations/StudentTrainingEvaluationForm.vue';
import { ITSCO_EVALUATION_RUBRICS } from '../../../../../backend/src/seeds/itscoEmployeeEvaluationRubrics.js';
import template from '../../../../../backend/src/content/evaluations/itsco-student-training-v1.json';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
import api from '../../../services/api';
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState({}, '', '/'); Element.prototype.scrollIntoView = vi.fn(); });

describe('handbook evaluation form representations', () => {
  it.each(Object.values(ITSCO_EVALUATION_RUBRICS))('shows the actual blank $slug form, including anchors and reflections, without API calls', async definition => {
    const w = mount(Appendix, { props: { form: { ...definition, version: 1, response: { private: 'PRIVATE RESPONSE' } } } });
    await flushPromises();
    expect(w.findComponent(Workspace).exists()).toBe(true);
    const criteria = definition.rubric.sections.flatMap(s => s.criteria);
    expect(w.findAll('input[type="radio"]')).toHaveLength(criteria.length * 4);
    expect(w.findAll('input, textarea').every(e => e.element.disabled)).toBe(true);
    expect(w.findAll('input').every(e => !e.element.checked)).toBe(true);
    for (const c of criteria) for (const anchor of Object.values(c.anchors)) expect(w.text()).toContain(anchor);
    for (const p of definition.rubric.reflectionPrompts) expect(w.text()).toContain(p.label);
    expect(w.text()).not.toContain('PRIVATE RESPONSE');
    expect(api.get).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
    w.unmount();
  });
  it('renders the matching self-assessment snapshot but preserves later handbook text edits', async () => {
    const form = { ...ITSCO_EVALUATION_RUBRICS.supervisor, version: 1, sectionSlug: 'employee-self-assessment-supervisor', sectionBodyHtml: '<p>Scoring reference</p>' };
    const section = { slug: form.sectionSlug, title: 'Supervisor self-assessment', body_html: form.sectionBodyHtml, content_status: 'ready' };
    const handbook = { sections: [section], metadata: { forms: { employeeSelfAssessments: [form] } } };
    const w = mount(Book, { props: { handbook } });
    expect(w.findComponent(Appendix).exists()).toBe(true);
    expect(w.find('a[download]').exists()).toBe(false);
    await w.setProps({ handbook: { ...handbook, sections: [{ ...section, body_html: '<p>Administrator revised this appendix.</p>' }] } });
    expect(w.findComponent(Appendix).exists()).toBe(false);
    expect(w.text()).toContain('Administrator revised this appendix.'); w.unmount();
  });
  it('uses the interactive intern form component as a disabled blank Appendix G', () => {
    const form = { ...template, sectionBodyHtml: '<p>Intern scoring reference</p>' };
    const w = mount(Book, { props: { handbook: { sections: [{ slug: form.sectionSlug, title: form.sourceTitle, body_html: form.sectionBodyHtml, content_status: 'ready' }], metadata: { forms: { studentTrainingEvaluation: form } } } } });
    expect(w.findComponent(StudentForm).props('preview')).toBe(true);
    expect(w.get('.training-total strong').text()).toBe('— / 100');
    expect(api.get).not.toHaveBeenCalled(); w.unmount();
  });
});
