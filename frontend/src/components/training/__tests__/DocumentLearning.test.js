import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Catalog from '../DocumentLearningCatalog.vue';
import Player from '../DocumentLearningPlayer.vue';
import Review from '../DocumentTrainingReview.vue';
import Staff from '../StaffDocumentLearning.vue';
import { useAgencyStore } from '../../../store/agency';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api';
const button = (w, text) => w.findAll('button').find(b => b.text().includes(text));
const questions = Array.from({ length: 3 }, (_, i) => ({ id: `question-${i}`, prompt: `Question ${i + 1}?`, options: ['Answer A', 'Answer B'] }));
const book = { metadata: { documentKey: 'provider-guide', presentation: { theme: 'itsco-foundations' } }, version: { id: 14, version_number: 1 }, sections: [{ slug: 'first', title: 'First section', body_html: '<p>Read here.</p>', content_status: 'ready' }] };
const definition = { title: 'Provider guide training', description: 'Test training', requiredSections: ['first'], questions };
const course = { key: 'provider-guide', title: 'Provider guide training', description: 'Clinical care', status: 'ready', questionCount: 3, readingCount: 1, version: { id: 14 }, onboardingRequired: false, enrollments: [] };
const enrollment = purpose => ({ id: 11, purpose, status: 'in_progress', paid: purpose !== 'practice', onboardingTime: purpose === 'onboarding', readSections: [], attempts: [], definition, book, time: [] });
let wrappers = [];
async function globalOptions() { const pinia = createPinia(), router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:organizationSlug/learning', component: { template: '<div />' } }] }); await router.push('/itsco/learning'); await router.isReady(); const store = useAgencyStore(pinia); store.currentAgency = { id: 2, slug: 'itsco' }; return { plugins: [pinia, router] }; }
async function mounted(component, options = {}) { const w = mount(component, { ...options, global: { ...await globalOptions(), ...options.global } }); wrappers.push(w); await flushPromises(); return w; }
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState({}, '', '/'); });
afterEach(() => { wrappers.forEach(w => w.unmount()); wrappers = []; });
describe('same guide catalog across learning surfaces', () => {
  it('keeps care-guide orientation distinct from clinical authorization and uses the company font', async () => {
    const careBook = { ...book, metadata: { documentKey: 'counseling-guide', learningPurpose: 'orientation', presentation: { theme: 'nlu-foundations' } } };
    api.get.mockResolvedValue({ data: { ...enrollment('practice'), key: 'counseling-guide', book: careBook } });
    const w = await mounted(Player, { props: { agencyId: 12, learningId: 11 }, global: { stubs: { Book: true } } });
    expect(w.text()).toContain('not a clinical skills assessment');
    expect(w.attributes('style')).toContain('var(--font-ptco)');
    expect(button(w, 'Pause timer')).toBeUndefined();
  });
  it('labels optional practice as own time and cannot create a paid assignment', async () => {
    api.get.mockResolvedValue({ data: { courses: [course] } }); api.post.mockResolvedValue({ data: { id: 11 } });
    const w = await mounted(Catalog, { props: { agencyId: 2, mode: 'on-demand' }, global: { stubs: { Player: true } } });
    expect(w.text()).toContain('Your own time'); expect(button(w, 'Start learning')).toBeUndefined();
    await button(w, 'Start optional').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/provider-update/document-learning/courses/provider-guide/start', expect.objectContaining({ purpose: 'practice', agencyId: 2, expectedVersionId: 14, requestKey: expect.any(String) }));
  });
  it('explains a skipped practice quiz and keeps that enrollment available to resume', async () => {
    api.get.mockResolvedValue({ data: { courses: [{ ...course, enrollments: [{ id: 11, purpose: 'practice', status: 'in_progress' }] }] } });
    const w = await mounted(Catalog, { props: { agencyId: 2, mode: 'on-demand' }, global: { stubs: { Player: true } } });
    await button(w, 'Continue optional').trigger('click');
    w.getComponent({ name: 'Player' }).vm.$emit('close', { skippedKnowledgeCheck: true }); await flushPromises();
    expect(w.text()).toContain('no completion was recorded');
    expect(button(w, 'Continue optional')).toBeDefined();
    expect(w.emitted('completed')).toBeUndefined(); expect(api.post).not.toHaveBeenCalled();
  });
  it('resumes assigned records without creating a new practice or payroll assignment', async () => {
    api.get.mockResolvedValue({ data: { courses: [{ ...course, enrollments: [{ id: 5, purpose: 'assigned', status: 'in_progress' }] }] } });
    const w = await mounted(Catalog, { props: { agencyId: 2, mode: 'assigned' }, global: { stubs: { Player: true } } });
    await button(w, 'Continue learning').trigger('click'); expect(w.getComponent({ name: 'Player' }).props('learningId')).toBe(5); expect(api.post).not.toHaveBeenCalled();
  });
  it('offers onboarding only when required and hides optional practice in the portal', async () => {
    api.get.mockResolvedValue({ data: { courses: [{ ...course, onboardingRequired: true }] } }); api.post.mockResolvedValue({ data: { id: 11 } });
    const w = await mounted(Catalog, { props: { agencyId: 2, mode: 'onboarding', apiBase: '/prehire-portal/test/document-learning' }, global: { stubs: { Player: true } } });
    await button(w, 'Start learning').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[0][1].purpose).toBe('onboarding'); expect(button(w, 'Start optional')).toBeUndefined();
  });
  it('blocks new starts for an unreviewed edition while keeping existing assignments available', async () => {
    api.get.mockResolvedValue({ data: { courses: [{ ...course, status: 'needs_review', enrollments: [{ id: 5, purpose: 'assigned', status: 'in_progress' }] }] } });
    const w = await mounted(Catalog, { props: { agencyId: 2 } }); expect(button(w, 'Start optional').attributes('disabled')).toBeDefined(); expect(button(w, 'Continue learning').attributes('disabled')).toBeUndefined();
  });
  it('does not show another agency’s late response after switching company', async () => {
    let resolve; api.get.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ data: { courses: [] } });
    const w = await mounted(Catalog, { props: { agencyId: 2 } }); await w.setProps({ agencyId: 8 }); await flushPromises(); resolve({ data: { courses: [course] } }); await flushPromises(); expect(w.text()).not.toContain('Provider guide training');
  });
});
const BookStub = { name: 'WorkplaceHandbookBook', emits: ['section-change'], props: ['handbook', 'answerQuestion'], mounted() { this.$emit('section-change', 'first'); }, methods: { selectSection(slug) { this.$emit('section-change', slug); } }, template: '<div>Readable guide<slot name="reader-actions" :section="handbook.sections[0]" /></div>' };
describe('guide reader, questions and completion', () => {
  it('optional practice never sends heartbeat or payroll requests, including completion and closing', async () => {
    let saved = enrollment('practice'); api.get.mockImplementation(async () => ({ data: structuredClone(saved) }));
    api.post.mockImplementation(async (path) => {
      if (path.endsWith('/reading')) { saved.readSections = ['first']; return { data: { readSections: ['first'] } }; }
      if (path.endsWith('/quiz')) { saved.status = 'completed'; return { data: { passed: true, score: 100, feedback: [] } }; }
      throw new Error('Unexpected request ' + path);
    });
    const w = await mounted(Player, { props: { agencyId: 2, learningId: 11 }, global: { stubs: { Book: BookStub } } });
    await button(w, 'Reviewed · Continue').trigger('click'); await flushPromises(); await button(w, 'Reflect & reveal').trigger('click');
    for (const field of w.findAll('.knowledge-check fieldset')) await field.findAll('input')[0].setValue(true);
    await w.get('.knowledge-check form').trigger('submit'); await flushPromises(); expect(w.text()).toContain('Completed and saved');
    await button(w, 'Save & close').trigger('click'); await flushPromises(); expect(w.emitted('close')).toHaveLength(1);
    expect(api.post.mock.calls.every(([path]) => !/heartbeat|\/time$/.test(path))).toBe(true);
  });
  it('keeps quiz unavailable until reading is acknowledged and reveals linked answers without scoring the learner', async () => {
    let saved = enrollment('practice'); api.get.mockImplementation(async () => ({ data: structuredClone(saved) }));
    api.post.mockImplementation(async path => { if (path.endsWith('/reading')) { saved.readSections = ['first']; return { data: { readSections: ['first'] } }; } saved.status = 'completed'; return { data: { completed: true, reviewed: true, feedback: [{ id: 'question-1', answer: 'Answer B', explanation: 'Read the applicable procedure.', sourceSlug: 'first' }] } }; });
    const w = await mounted(Player, { props: { agencyId: 2, learningId: 11 }, global: { stubs: { Book: BookStub } } });
    await button(w, 'Reflect & reveal').trigger('click'); expect(button(w, 'Reveal answers & save reflection').attributes('disabled')).toBeDefined();
    await button(w, 'Read & ask').trigger('click'); await button(w, 'Reviewed · Continue').trigger('click'); await flushPromises(); await button(w, 'Reflect & reveal').trigger('click');
    for (const field of w.findAll('.knowledge-check fieldset')) await field.findAll('input')[0].setValue(true);
    await w.get('.knowledge-check form').trigger('submit'); await flushPromises(); expect(w.text()).toContain('Answer B'); expect(w.text()).not.toContain('67%'); expect(w.text()).toContain('Read the applicable procedure.');
    await button(w, 'Read First section').trigger('click'); expect(w.get('.reading-confirmation').text()).toContain('Training completed'); expect(w.emitted('completed')).toHaveLength(1);
  });
  it('opens the questions automatically after the last core acknowledgment and does not complete from reading alone', async () => {
    api.get.mockResolvedValue({ data: enrollment('practice') });
    api.post.mockResolvedValue({ data: { readSections: ['first'] } });
    const w = await mounted(Player, { props: { agencyId: 2, learningId: 11 }, global: { stubs: { Book: BookStub } } });
    expect(w.find('.knowledge-check').exists()).toBe(false);
    await button(w, 'Reviewed · Continue').trigger('click'); await flushPromises();
    expect(w.find('.knowledge-check').isVisible()).toBe(true);
    expect(w.text()).toContain('Apply what you learned');
    expect(w.findAll('.knowledge-check fieldset')).toHaveLength(3);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/provider-update/document-learning/enrollments/11/reading', { agencyId: 2, slug: 'first' });
    expect(w.emitted('completed')).toBeUndefined();
  });
  it('makes the pending quiz visible on resume and skips only optional practice without a completion or quiz request', async () => {
    const saved = { ...enrollment('practice'), readSections: ['first'] };
    api.get.mockResolvedValue({ data: saved });
    const w = await mounted(Player, { props: { agencyId: 2, learningId: 11 }, global: { stubs: { Book: BookStub } } });
    expect(w.get('.reading-ready').text()).toContain('Reading complete. Put it into practice.');
    expect(w.get('.reading-confirmation').text()).toContain('Start reflection questions');
    await button(w, 'Start reflection questions').trigger('click');
    await w.get('.quiz-heading').findAll('button')[0].trigger('click');
    expect(w.emitted('close')).toEqual([[{ skippedKnowledgeCheck: true }]]);
    expect(w.emitted('completed')).toBeUndefined();
    expect(api.post).not.toHaveBeenCalled();
    expect(saved.status).toBe('in_progress');
  });
  it.each(['assigned', 'onboarding'])('never offers quiz skipping for %s training', async purpose => {
    api.get.mockResolvedValue({ data: { ...enrollment(purpose), readSections: ['first'] } });
    api.post.mockResolvedValue({ data: { tracking: false } });
    const w = await mounted(Player, { props: { agencyId: 2, learningId: 11 }, global: { stubs: { Book: BookStub } } });
    expect(button(w, 'Skip knowledge')).toBeUndefined();
    await button(w, 'Start reflection questions').trigger('click');
    expect(button(w, 'Skip knowledge')).toBeUndefined();
    expect(button(w, 'Reveal answers & save reflection').attributes('disabled')).toBeDefined();
    await w.get('.knowledge-check form').trigger('submit'); await flushPromises();
    expect(api.post.mock.calls.some(([path]) => path.endsWith('/quiz'))).toBe(false);
    expect(w.emitted('completed')).toBeUndefined();
  });
  it('does not advance to questions when a reading save fails', async () => {
    api.get.mockResolvedValue({ data: enrollment('practice') }); api.post.mockRejectedValue(new Error('Offline'));
    const w = await mounted(Player, { props: { agencyId: 2, learningId: 11 }, global: { stubs: { Book: BookStub } } });
    await button(w, 'Reviewed · Continue').trigger('click'); await flushPromises();
    expect(w.text()).toContain('Reading progress could not be saved.');
    expect(w.find('.knowledge-check').exists()).toBe(false);
    expect(w.emitted('completed')).toBeUndefined();
  });
  it('shows paid time on assigned work and retains an actionable message on payroll failure', async () => {
    api.get.mockResolvedValue({ data: enrollment('assigned') }); api.post.mockImplementation(async path => { if (path.endsWith('/heartbeat')) return { data: { tracking: true } }; throw new Error('Offline'); });
    const w = await mounted(Player, { props: { agencyId: 2, learningId: 11 }, global: { stubs: { Book: BookStub } } });
    expect(w.text()).toContain('Assigned training · Paid time'); await button(w, 'Submit recorded time').trigger('click'); await flushPromises(); expect(w.text()).toContain('Recorded time is retained');
  });
});
describe('training administration', () => {
  it('approves reviewed questions for a specific published edition and detects edits', async () => {
    const reviewed = { ...definition, questions: questions.map(q => ({ ...q, correctAnswer: 0, sourceSlug: 'first', explanation: 'Use this section.' })) };
    api.get.mockResolvedValue({ data: { book, status: 'needs_review', definition: reviewed, reviewRevision: 'r1' } }); api.post.mockResolvedValue({ data: {} });
    const w = await mounted(Review, { props: { agencyId: 2, documentKey: 'provider-guide', versionId: 14 } });
    await w.get('input').setValue('Updated course title'); expect(w.emitted('dirty').at(-1)).toEqual([true]);
    await w.get('form').trigger('submit'); await flushPromises(); expect(api.post.mock.calls[0][1]).toMatchObject({ expectedVersionId: 14, expectedReviewRevision: 'r1', definition: { title: 'Updated course title' } });
  });
  it('lets an administrator remove a reading section deleted from the new edition', async () => {
    api.get.mockResolvedValue({ data: { book, status: 'needs_review', definition: { ...definition, requiredSections: ['first', 'deleted-policy'] }, reviewRevision: null } });
    const w = await mounted(Review, { props: { agencyId: 2, documentKey: 'provider-guide', versionId: 14 } });
    expect(w.text()).toContain('deleted-policy'); await button(w, 'Remove unavailable reading').trigger('click'); expect(w.text()).not.toContain('deleted-policy'); expect(w.emitted('dirty').at(-1)).toEqual([true]);
  });
  it('allows a supervisor with server access to assign a paid refresher and change school expectations', async () => {
    const school = { ...course, key: 'school-practice-guide' }; api.get.mockResolvedValue({ data: { courses: [school], canAssign: true, learnerStatus: 'ACTIVE_EMPLOYEE', expectedSchoolWork: true } }); api.post.mockResolvedValue({ data: { id: 21 } }); api.put.mockResolvedValue({ data: {} });
    const w = await mounted(Staff, { props: { agencyId: 2, userId: 7 } });
    await w.get('input[type=checkbox]').setValue(false); await button(w, 'Save school-work').trigger('click'); await flushPromises(); expect(api.put.mock.calls[0][1].expectedSchoolWork).toBe(false);
    await button(w, 'Assign paid refresher').trigger('click'); await flushPromises(); expect(api.post).toHaveBeenCalledWith('/provider-update/document-learning/staff/7/school-practice-guide/assign', expect.objectContaining({ agencyId: 2, expectedVersionId: 14 }));
  });
});

describe('beta practice and separate learning sections', () => {
  it('starts beta practice with its source revision and keeps required training unavailable', async () => {
    api.get.mockResolvedValue({ data: { courses: [{ ...course, status: 'beta', betaRevision: 'source-revision', version: { id: 0 }, onboardingRequired: true }] } });
    api.post.mockResolvedValue({ data: { id: 12 } });
    const w = await mounted(Catalog, { props: { agencyId: 2, mode: 'on-demand' }, global: { stubs: { Player: true } } });
    expect(button(w, 'Start learning')).toBeUndefined(); expect(button(w, 'Start optional').attributes('disabled')).toBeUndefined();
    await button(w, 'Start optional').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ purpose: 'practice', expectedBetaRevision: 'source-revision', expectedVersionId: 0 }));
  });
  it('includes completed onboarding and practice in history without creating new assignments', async () => {
    api.get.mockResolvedValue({ data: { courses: [{ ...course, enrollments: [{ id: 1, purpose: 'onboarding', status: 'completed' }, { id: 2, purpose: 'practice', status: 'completed' }, { id: 3, purpose: 'assigned', status: 'in_progress' }] }] } });
    const w = await mounted(Catalog, { props: { agencyId: 2, mode: 'completed' }, global: { stubs: { Player: true } } });
    expect(w.findAll('button').filter(b => b.text() === 'Review completion')).toHaveLength(2);
    expect(button(w, 'Start optional')).toBeUndefined(); expect(button(w, 'Continue learning')).toBeUndefined();
  });
});

it('opens beta onboarding guides in a reading view without starting training', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/read') ? { book, status: 'beta' } : { courses: [{ ...course, status: 'beta', canRead: true, onboardingRequired: true }] } }));
  const w = await mounted(Catalog, { props: { agencyId: 2, mode: 'onboarding', apiBase: '/prehire-portal/private/document-learning' }, global: { stubs: { Book: true } } });
  expect(button(w, 'Start learning').attributes('disabled')).toBeUndefined();
  await button(w, 'Read guide').trigger('click'); await flushPromises();
  expect(w.getComponent({ name: 'Book' }).props('handbook')).toMatchObject(book);
  expect(w.text()).toContain('save your reading progress and reflections'); expect(api.post).not.toHaveBeenCalled();
  await button(w, 'Back to guides').trigger('click'); expect(w.text()).toContain(course.title);
});

it('edits and previews visual points and choice explanations before saving the supplied edition', async () => {
  const editable = { ...definition, questions: questions.map(q => ({ ...q, sourceSlug: 'first', correctAnswer: 1, explanation: 'This follows the source.' })) };
  api.get.mockResolvedValue({ data: { book: { ...book, version: { id: 0 } }, definition: editable, status: 'beta', sourceRevision: 'source-v1', reviewRevision: null } });
  api.post.mockResolvedValue({ data: {} });
  const w = await mounted(Review, { props: { agencyId: 2, documentKey: 'provider-guide', versionId: 0 } });
  await button(w, 'Customize source points').trigger('click');
  const lessonEditor = w.get('.lesson-editor'); await lessonEditor.get('textarea').setValue('Use the approved workflow.');
  await w.get('.answer-editor textarea').setValue('This option skips the required clarification.');
  await button(w, 'Preview interactive training').trigger('click'); await flushPromises();
  expect(w.get('.training-preview').text()).toContain('Use the approved workflow.');
  expect(api.post).not.toHaveBeenCalled();
  await w.get('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ expectedVersionId: 0, expectedSourceRevision: 'source-v1', definition: expect.objectContaining({ lessonPresentation: expect.objectContaining({ first: expect.objectContaining({ facts: ['Use the approved workflow.'] }) }), questions: expect.arrayContaining([expect.objectContaining({ choiceExplanations: ['This option skips the required clarification.', ''] })]) }) }));
});
