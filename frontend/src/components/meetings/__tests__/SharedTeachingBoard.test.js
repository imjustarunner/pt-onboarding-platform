import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import SharedTeachingBoard from '../SharedTeachingBoard.vue';
import { teachingPage } from '../teachingBoard';

const event = (id, type, payload, actor = 'tutor') => ({
  id,
  type,
  actor,
  payload: { shareId: 1, ...payload }
});
const board = event(1, 'share', { mode: 'whiteboard' });
const prompt = event(2, 'board_prompt', {
  prompt: 'Choose one half',
  format: 'choice',
  options: ['2/4', '3/4'],
  x: 5,
  y: 5,
  width: 55
});
const unlock = event(3, 'board_lock', { locked: false });
function mountBoard(host, events, extra = {}) {
  const save = vi.fn(async () => true);
  const wrapper = mount(SharedTeachingBoard, {
    props: { boardId: 1, host, events, actor: host ? 'tutor' : 'student', save, ...extra },
    global: { stubs: { WorksheetExcerpt: true } }
  });
  return { wrapper, save };
}
const button = (w, label) => w.findAll('button').find((el) => el.text() === label);
it('shows a learner a read-only board until unlocked and submits a choice directly on the question', async () => {
  const { wrapper, save } = mountBoard(false, [board, prompt]);
  expect(wrapper.get('input[type=radio]').element.disabled).toBe(true);
  expect(button(wrapper, 'Clear page')).toBeUndefined();
  expect(button(wrapper, 'Eraser')).toBeUndefined();
  await wrapper.setProps({ events: [board, prompt, unlock] });
  await wrapper.findAll('input[type=radio]')[0].setValue();
  await button(wrapper, 'Submit answer').trigger('click');
  expect(save).toHaveBeenCalledWith(
    'board_answer',
    { shareId: 1, targetId: 2, answer: '2/4' },
    expect.any(String)
  );
  await wrapper.setProps({ events: [board, prompt, unlock, event(4, 'board_lock', { locked: true })] });
  expect(wrapper.get('input[type=radio]').element.disabled).toBe(true);
  wrapper.unmount();
});
it('moves and resizes with the keyboard and confirms wiping a whole page', async () => {
  const { wrapper, save } = mountBoard(true, [board, prompt]);
  await button(wrapper, 'Move').trigger('keydown', { key: 'ArrowRight' });
  expect(save).toHaveBeenCalledWith(
    'board_move',
    { shareId: 1, targetId: 2, x: 7, y: 5, width: 55 },
    expect.any(String)
  );
  await button(wrapper, 'Resize').trigger('keydown', { key: 'ArrowRight' });
  expect(save).toHaveBeenCalledWith(
    'board_move',
    { shareId: 1, targetId: 2, x: 5, y: 5, width: 57 },
    expect.any(String)
  );
  await button(wrapper, 'Clear page').trigger('click');
  expect(save.mock.calls.some(([type]) => type === 'board_clear')).toBe(false);
  await button(wrapper, 'Clear everything').trigger('click');
  expect(save).toHaveBeenCalledWith('board_clear', { shareId: 1 }, expect.any(String));
  wrapper.unmount();
});
it('keeps generated drafts private until the tutor reviews and shares them', async () => {
  const generate = vi.fn(async () => ({ prompt: 'Explain one half.', options: [] }));
  const { wrapper, save } = mountBoard(true, [board], { generate });
  await button(wrapper, 'Insert question').trigger('click');
  await button(wrapper, 'Draft with AI').trigger('click');
  await flushPromises();
  expect(generate).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
  await wrapper.find('.composer textarea').setValue('Explain one half using equal parts.');
  await wrapper.get('.composer').trigger('submit');
  await flushPromises();
  expect(save).toHaveBeenCalledWith(
    'board_prompt',
    expect.objectContaining({ prompt: 'Explain one half using equal parts.', format: 'text' }),
    expect.any(String)
  );
  wrapper.unmount();
});
it('restores each page from its own events without changing the old snapshot', () => {
  const moved = event(4, 'board_move', { targetId: 2, x: 22, y: 30, width: 60 });
  const first = teachingPage([board, prompt, unlock, moved], 1);
  expect(first.items[0].payload.x).toBe(22);
  expect(prompt.payload.x).toBe(5);
  expect(teachingPage([board, prompt, unlock, moved, event(5, 'board_clear', {})], 1).items).toEqual([]);
  expect(teachingPage([board, prompt, unlock, moved], 2).locked).toBe(true);
});

it('keeps the tutor’s entered level and skill after a failed AI draft and context refresh',async()=>{
 const track={subject:{id:42,school_grade:'5',subject_label:'Math'}};
 const generate=vi.fn().mockRejectedValue(new Error('Unavailable'));
 const {wrapper,save}=mountBoard(true,[board],{generate,learningContext:{tracks:[track]}});
 try {
  await button(wrapper,'Insert question').trigger('click');
  const field=label=>wrapper.findAll('label').find(el=>el.text()===label).get('input');
  await field('Skill').setValue('Compare unlike denominators');
  await field('Grade or level').setValue('4');
  await button(wrapper,'Draft with AI').trigger('click');
  await flushPromises();
  await wrapper.setProps({learningContext:{tracks:[{subject:{...track.subject}}]}});
  expect(field('Skill').element.value).toBe('Compare unlike denominators');
  expect(field('Grade or level').element.value).toBe('4');
  expect(save).not.toHaveBeenCalled();
 } finally {wrapper.unmount();}
});
