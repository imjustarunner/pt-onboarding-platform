import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TicketDetailModal from '../TicketDetailModal.vue';

vi.mock('../TicketDeskView.vue', () => ({ default: {
  name: 'TicketDeskView', props: { embedded: Boolean, initialTicketId: [Number, String], agencyId: [Number, String], syncRoute: Boolean }, emits: ['updated'], template: '<div class="test-ticket-desk">Ticket work</div>'
} }));
let wrapper;
let launcher;
beforeEach(() => {
  launcher = document.createElement('button');
  document.body.appendChild(launcher);
  launcher.focus();
  document.body.style.overflow = 'auto';
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn(function () { this.open = true; }) });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn(function () { this.open = false; }) });
});
afterEach(() => { wrapper?.unmount(); launcher.remove(); document.body.style.overflow = ''; vi.restoreAllMocks(); });

it('embeds the existing ticket desk and restores focus and scrolling on close', async () => {
  wrapper = mount(TicketDetailModal, { props: { ticketId: 101, agencyId: 2 }, attachTo: document.body });
  const desk = wrapper.findComponent({ name: 'TicketDeskView' });
  expect(desk.props()).toMatchObject({ initialTicketId: 101, agencyId: 2, embedded: true, syncRoute: false });
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Close ticket');
  desk.vm.$emit('updated', { id: 101 });
  expect(wrapper.emitted('updated')).toEqual([[{ id: 101 }]]);
  document.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(wrapper.emitted('close')).toHaveLength(1);
  wrapper.unmount();
  wrapper = null;
  expect(document.body.style.overflow).toBe('auto');
  expect(document.activeElement).toBe(launcher);
});
