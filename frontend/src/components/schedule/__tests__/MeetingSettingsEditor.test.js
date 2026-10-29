import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import MeetingSettingsEditor from '../MeetingSettingsEditor.vue';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));

const settings = () => ({ agenda: true, goals: true, actionItems: true, attendance: true, transcription: true, screenShare: true, compensation: true, reminders: ['business_days_3', 1440, 5, 30] });
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label);
beforeEach(() => { vi.clearAllMocks(); api.put.mockResolvedValue({ data: {} }); });

async function mountEditor(canEdit = true, extraProps = {}) {
  api.get.mockResolvedValue({ data: { canEdit, types: [{ key: 'general', settings: settings() }] } });
  const wrapper = mount(MeetingSettingsEditor, { props: { agencyId: 2, modelValue: settings(), ...extraProps } });
  await flushPromises();
  return wrapper;
}

it('clears every editable meeting option and preset/custom reminder in one update', async () => {
  const wrapper = await mountEditor();
  await button(wrapper, 'Deselect all').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([[{
    agenda: false, goals: false, actionItems: false, attendance: false,
    transcription: false, screenShare: false, compensation: false, reminders: []
  }]]);
  expect(api.put).not.toHaveBeenCalled();
  wrapper.unmount();
});

it('preserves a compensation setting the user cannot edit and respects disabled forms', async () => {
  const wrapper = await mountEditor(false);
  await button(wrapper, 'Deselect all').trigger('click');
  expect(wrapper.emitted('update:modelValue')[0][0]).toMatchObject({ attendance: false, compensation: true, reminders: [] });
  await wrapper.setProps({ disabled: true });
  await button(wrapper, 'Deselect all').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
  wrapper.unmount();
});

it('clears the type-default draft without changing this meeting or saving until requested', async () => {
  const wrapper = await mountEditor();
  await button(wrapper, 'Edit meeting type defaults').trigger('click');
  await button(wrapper, 'Deselect all').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  expect(api.put).not.toHaveBeenCalled();
  await button(wrapper, 'Save type defaults').trigger('click');
  await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/team-meetings/types/general', {
    agencyId: 2, settings: expect.objectContaining({ agenda: false, compensation: false, reminders: [] })
  });
  wrapper.unmount();
});
