import { beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Dialog from '../EnrollmentTerminationDialog.vue';
const props = { title: 'Stop this enrollment?', description: 'This will not submit your enrollment. Reminders will stop.', keepLabel: 'Keep completing enrollment', confirmLabel: 'Terminate enrollment', busyLabel: 'Stopping enrollment…' };
beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); });
it('offers explicit keep and terminate actions with keep as the initial focus', async () => {
  const view = mount(Dialog, { props });
  const buttons = view.findAll('button');
  expect(buttons[0].text()).toBe('Keep completing enrollment'); expect(buttons[0].attributes()).toHaveProperty('autofocus');
  expect(buttons[1].text()).toBe('Terminate enrollment'); await buttons[0].trigger('click');
  expect(view.emitted('cancel')).toHaveLength(1); expect(view.emitted('confirm')).toBeUndefined();
  await buttons[1].trigger('click'); expect(view.emitted('confirm')).toHaveLength(1); view.unmount();
});
it('prevents duplicate actions while stopping and displays a failed request without dismissing', async () => {
  const view = mount(Dialog, { props: { ...props, busy: true } });
  expect(view.findAll('button').every(b => b.element.disabled)).toBe(true);
  await view.get('dialog').trigger('cancel'); expect(view.emitted('cancel')).toBeUndefined();
  await view.setProps({ busy: false, error: 'Your enrollment is still available. Please try again.' });
  expect(view.get('[role="alert"]').text()).toContain('Please try again'); expect(view.findAll('button')[1].element.disabled).toBe(false); view.unmount();
});
