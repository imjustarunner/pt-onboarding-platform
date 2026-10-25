import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('../../../composables/useAskAssistant', () => ({ useAskAssistant: () => ({ openAsk: vi.fn() }) }));
import TeamCalendar from '../TeamAvailabilityCalendar.vue';
import ScheduleHelp from '../ScheduleHelp.vue';
import ScheduleColorLegend from '../ScheduleColorLegend.vue';
import { useScheduleFullscreen } from '../../../composables/useScheduleFullscreen.js';
let wrapper;
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('requests only scoped availability and never displays arbitrary appointment text', async () => {
  mocks.get.mockResolvedValue({ data: { busyBlocks: [{ startAt: '2026-10-26T10:00:00', endAt: '2026-10-26T11:00:00', activityType: 'session', title: 'Private Client', description: 'Do not render', joinUrl: 'https://private.example' }] } });
  wrapper = mount(TeamCalendar, { props: { userId: 8, agencyId: 2, name: 'Coworker', weekStartYmd: '2026-10-26' } });
  await flushPromises();
  expect(mocks.get).toHaveBeenCalledWith('/users/8/schedule-summary', expect.objectContaining({ params: expect.objectContaining({ agencyId: 2, detailLevel: 'availability', skipOfficeMaterialize: 'true' }) }));
  expect(wrapper.text()).toContain('Session');
  expect(wrapper.html()).not.toMatch(/Private Client|Do not render|private.example|Book session|Cancel day/);
  expect(wrapper.findAll('.team-calendar__day')).toHaveLength(7);
});

it('discards an old coworker response after switching people', async () => {
  let finishOld;
  mocks.get.mockImplementation(url => url.includes('/8/') ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ data: { busyBlocks: [] } }));
  wrapper = mount(TeamCalendar, { props: { userId: 8, agencyId: 2, name: 'First', weekStartYmd: '2026-10-26' } });
  await wrapper.setProps({ userId: 9, name: 'Second' }); await flushPromises();
  finishOld({ data: { busyBlocks: [{ startAt: '2026-10-26T10:00:00', endAt: '2026-10-26T11:00:00', activityType: 'session' }] } });
  await flushPromises(); expect(wrapper.findAll('li')).toHaveLength(0); expect(wrapper.text()).toContain('Second');
});

it('keeps help inside a narrow viewport and closes with Escape', async () => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
  wrapper = mount(ScheduleHelp, { attachTo: document.body });
  const button = wrapper.get('button'); button.element.getBoundingClientRect = () => ({ left: 300, bottom: 550 });
  await button.trigger('click'); await flushPromises();
  const panel = document.querySelector('[role="dialog"]');
  expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(12);
  expect(Number.parseFloat(panel.style.left) + Number.parseFloat(panel.style.width)).toBeLessThanOrEqual(378);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises();
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button.element);
});

it('starts with the color key collapsed and expands on demand', async () => {
  wrapper = mount(ScheduleColorLegend);
  expect(wrapper.get('details').element.open).toBe(false);
  wrapper.get('summary').element.click();
  expect(wrapper.get('details').element.open).toBe(true);
});

it('supports full screen without the browser API, exits with Escape, and restores scrolling', async () => {
  document.body.style.overflow = 'auto';
  wrapper = mount(defineComponent({ setup() { const root = ref(null); return { root, ...useScheduleFullscreen(root) }; }, template: '<section ref="root"><button @click="toggleFullscreen">{{ fullscreenActive ? "Exit full screen" : "Full screen" }}</button></section>' }), { attachTo: document.body });
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(wrapper.text()).toBe('Exit full screen'); expect(document.body.style.overflow).toBe('hidden');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises();
  expect(wrapper.text()).toBe('Full screen'); expect(document.body.style.overflow).toBe('auto');
});
