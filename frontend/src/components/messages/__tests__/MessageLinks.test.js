import { afterEach, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HubEmailBodyEditor from '../HubEmailBodyEditor.vue';
import MessageLinkControl from '../MessageLinkControl.vue';
import MessageLinkText from '../MessageLinkText.vue';

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

it('links selected text in the rich email editor without replacing the label', async () => {
  wrapper = mount(HubEmailBodyEditor, { attachTo: document.body, props: { modelValue: '<p>Meeting details</p>' } });
  await wrapper.vm.$nextTick();
  wrapper.vm.editor.commands.setTextSelection({ from: 1, to: 16 });
  await wrapper.get('.message-link-button').trigger('click');
  await wrapper.get('.message-link-panel input').setValue('https://example.org/schedule');
  await wrapper.get('.message-link-panel input').trigger('keydown.enter');
  expect(wrapper.vm.editor.getHTML()).toContain('href="https://example.org/schedule"');
  expect(wrapper.vm.editor.getHTML()).toContain('>Meeting details</a>');
});

it('rejects unsafe destinations and leaves the draft intact', async () => {
  const textarea = document.createElement('textarea');
  textarea.value = 'Keep this draft';
  document.body.append(textarea);
  wrapper = mount(MessageLinkControl, { props: { textarea } });
  await wrapper.get('.message-link-button').trigger('click');
  const input = wrapper.get('.message-link-panel input');
  await input.setValue('javascript:alert(1)');
  await input.trigger('keydown.enter');
  expect(wrapper.get('[role="alert"]').text()).toContain('valid http or https');
  expect(textarea.value).toBe('Keep this draft');
});

it('renders secure and team message URLs without interpreting markup', () => {
  wrapper = mount(MessageLinkText, { props: { text: 'Check (https://example.org/discussion). <b>Plain text</b>' } });
  expect(wrapper.get('a').attributes()).toMatchObject({ href: 'https://example.org/discussion', rel: 'noopener noreferrer' });
  expect(wrapper.find('b').exists()).toBe(false);
  expect(wrapper.text()).toBe('Check (https://example.org/discussion). <b>Plain text</b>');
});
