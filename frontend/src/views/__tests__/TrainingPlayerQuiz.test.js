import { beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '32' }, query: {}, meta: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../composables/useOnboardingActivity.js', () => ({ useOnboardingActivity: () => ({ error: { value: '' }, tracking: { value: false } }) }));
import api from '../../services/api';
import Player from '../TrainingPlayerView.vue';
const quiz = { id: 126, content_type: 'quiz', content_data: { minimumScore: 100, questions: [{}] } };
let attempts, status, content, guide;
beforeEach(() => {
  vi.clearAllMocks(); attempts = []; status = 'in_progress'; content = [quiz]; guide = null;
  api.get.mockImplementation(async path => ({ data: path === '/modules/32' ? { id: 32, title: 'Demo lesson', fingerprintingGuide: guide }
    : path === '/on-demand-training/modules/32' ? { id: 32, title: 'Fingerprinting', fingerprintingGuide: guide, content }
    : path === '/modules/32/content' ? content
    : path === '/quizzes/32/attempts' ? attempts
    : path === '/progress' ? [{ module_id: 32, status }]
    : {} }));
  api.post.mockResolvedValue({ data: {} });
});
const completionButton = wrapper => wrapper.findAll('button').find(button => button.text() === 'Mark Lesson Complete');
it('keeps completion unavailable after failure and enables it after a passing retry', async () => {
  const wrapper = shallowMount(Player); await flushPromises();
  expect(completionButton(wrapper)).toBeUndefined();
  expect(wrapper.text()).toContain('Pass the quiz before marking this lesson complete.');
  wrapper.findComponent({ name: 'TrainingBlockRenderer' }).vm.$emit('quiz-completed', { score: 0, passed: false }); await flushPromises();
  expect(completionButton(wrapper)).toBeUndefined();
  wrapper.findComponent({ name: 'TrainingBlockRenderer' }).vm.$emit('quiz-completed', { score: 100, passed: true }); await flushPromises();
  await completionButton(wrapper).trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/progress/complete', expect.objectContaining({ moduleId: 32 }));
  expect(wrapper.text()).toContain('Lesson completed'); wrapper.unmount();
});
it('restores a saved passing score on a fresh page without making the user retake', async () => {
  attempts = [{ score: '100.00' }, { score: '0.00' }]; status = 'completed';
  const wrapper = shallowMount(Player); await flushPromises();
  expect(wrapper.text()).toContain('Quiz score: 100% (Passed)');
  expect(api.post).not.toHaveBeenCalled(); wrapper.unmount();
});
it('retains completion for a lesson without a quiz', async () => {
  content = [{ id: 125, content_type: 'text', content_data: { content: 'Read' } }];
  const wrapper = shallowMount(Player); await flushPromises();
  expect(completionButton(wrapper)).toBeDefined();
  expect(api.get).not.toHaveBeenCalledWith('/quizzes/32/attempts'); wrapper.unmount();
});
it.each([false, true])('connects the training player to the shared fingerprinting guide (on-demand: %s)', async onDemand => {
 guide = { html: '<ol><li><h3>Open Cabiond</h3></li></ol>', instructions: 'Separate background check.' };
 content = [{ id: 1, content_type: 'text', content_data: { content: 'Old text lesson' } }, { id: 2, content_type: 'image', content_data: { imageUrl: '/original.png' } }, quiz];
 const wrapper = shallowMount(Player, { props: { onDemand } });await flushPromises();
 const course = wrapper.findComponent({ name: 'FingerprintingTrainingGuide' });
 expect(course.props()).toMatchObject({ guide, moduleId: 32, onDemand });
 expect(wrapper.findAllComponents({ name: 'TrainingBlockRenderer' })).toHaveLength(1);
 expect(wrapper.findComponent({ name: 'TrainingBlockRenderer' }).props('block').id).toBe(quiz.id);
 if (onDemand) expect(wrapper.find('.progress-card').exists()).toBe(false);
 expect(api.post).not.toHaveBeenCalled();wrapper.unmount();
});
