import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Deck from '../GuideLessonDeck.vue';
import { sectionScreens, lessonFacts } from '../../../utils/guideLessonSlides';
const question = { id: 'scope', prompt: 'A request is outside your role. What would you do?', options: ['Proceed immediately', 'Ask your supervisor'], sourceSlug: 'boundaries' };
const createLesson = () => ({ id: 11, status: 'in_progress', readSections: [], reflections: [], attempts: [], definition: { requiredSections: ['boundaries'], questions: [question] }, book: { sections: [{ slug: 'boundaries', title: 'Professional boundaries', body_html: '<p>Work within your role.</p><ul><li>Ask when unsure.</li><li>Use your guide.</li></ul>' }] } });
let wrapper;
afterEach(() => wrapper?.unmount());
const button = text => wrapper.findAll('button').find(b => b.text().includes(text));
function setup(lesson = createLesson(), saveReading = vi.fn(async () => { lesson.readSections = ['boundaries']; return wrapper.setProps({ lesson: structuredClone(lesson) }); })) {
  const revealReflection = vi.fn(async (id, answer) => { lesson.reflections = [{ id, selectedAnswer: answer, answer: 'Ask your supervisor', explanation: 'Resolve uncertainty before acting.', choiceExplanation: 'A request does not expand your role.', sourceSlug: 'boundaries' }]; await wrapper.setProps({ lesson: structuredClone(lesson) }); });
  wrapper = mount(Deck, { props: { lesson, saveReading, revealReflection } }); return { lesson, saveReading, revealReflection };
}
describe('visual click-through lessons', () => {
  it('reveals facts one at a time, saves the topic, reveals any scenario response and completes only on Finish', async () => {
    const { saveReading, revealReflection } = setup();
    expect(wrapper.get('img').attributes('src')).toContain('/assets/rise/therapy.webp');
    expect(wrapper.findAll('.fact-card')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Ask when unsure.');
    expect(button('Continue →').attributes('disabled')).toBeDefined();
    await button('Reveal next point').trigger('click'); expect(wrapper.text()).toContain('Ask when unsure.');
    await button('Reveal next point').trigger('click'); expect(wrapper.text()).toContain('Use your guide.');
    await button('Continue →').trigger('click'); await flushPromises();
    expect(saveReading).toHaveBeenCalledWith('boundaries'); expect(wrapper.get('legend').text()).toBe(question.prompt);
    await wrapper.findAll('input')[0].setValue(true);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(revealReflection).toHaveBeenCalledWith('scope', 0);
    expect(wrapper.get('.scenario-reveal').text()).toContain('Ask your supervisor');
    expect(wrapper.get('.scenario-reveal').text()).toContain('A request does not expand your role.');
    expect(wrapper.get('.scenario-reveal').text()).toContain('Why:');
    expect(wrapper.emitted('finish')).toBeUndefined();
    await button('Continue →').trigger('click'); await flushPromises();
    await button('Finish & save').trigger('click'); expect(wrapper.emitted('finish')).toHaveLength(1);
  });
  it('resumes at an unanswered scenario with previously reviewed facts retained', async () => {
    const lesson = createLesson(); lesson.readSections = ['boundaries']; setup(lesson);
    expect(wrapper.get('legend').text()).toBe(question.prompt);
    await button('Back').trigger('click'); expect(wrapper.findAll('.fact-card')).toHaveLength(3);
    expect(wrapper.emitted('finish')).toBeUndefined();
  });
  it('does not advance or lose the current facts when saving fails', async () => {
    setup(createLesson(), vi.fn().mockRejectedValue(new Error('offline')));
    await button('Reveal next point').trigger('click'); await button('Reveal next point').trigger('click');
    await button('Continue →').trigger('click'); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('could not be saved');
    expect(wrapper.findAll('.fact-card')).toHaveLength(3); expect(wrapper.find('legend').exists()).toBe(false);
  });
  it('keeps source wording and ordered list numbers while removing executable markup', () => {
    const html = '<h3>Steps</h3><ol start="4">'+Array.from({length:7}, (_,i)=>`<li>Original point ${i}.</li>`).join('')+'</ol><p>Final qualification.</p><script>alert(1)</script>';
    const pages = sectionScreens(html); const facts = pages.flatMap(lessonFacts).join('');
    for(let i=0;i<7;i++) expect(facts).toContain(`Original point ${i}.`);
    expect(facts).toContain('Final qualification.'); expect(facts).toContain('start="10"'); expect(facts).not.toContain('<script');
  });
});
