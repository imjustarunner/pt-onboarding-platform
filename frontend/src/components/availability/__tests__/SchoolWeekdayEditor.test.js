import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Editor from '../SchoolWeekdayEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const context = () => ({ eligible: true, days: ['Monday','Tuesday','Wednesday','Thursday','Friday'].map((day,i) => ({ day, status: i === 0 ? 'assigned' : 'available', available: true, schools: i === 0 ? [{ schoolOrganizationId: 10, schoolName: 'Cedar' }] : [] })) });
let wrapper;
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: context() }); });
afterEach(() => wrapper?.unmount());
async function render() { wrapper = mount(Editor, { props: { providerId: 7, agencyId: 2 }, global: { stubs: { Teleport: true } } }); await flushPromises(); return wrapper; }
it('shows a five-day editor, locks assigned schools, and saves weekday choices to the shared endpoint', async () => {
  await render(); const days = wrapper.findAll('fieldset');
  expect(days).toHaveLength(5); expect(days[0].attributes('disabled')).toBeDefined(); expect(days[0].text()).toContain('Cedar');
  await days[1].findAll('button')[1].trigger('click'); await flushPromises(); expect(wrapper.findAll('fieldset')[1].classes()).toContain('unavailable');
  api.put.mockResolvedValue({ data: context() }); await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/availability/providers/7/school-weekdays', expect.objectContaining({ agencyId: 2, days: { Monday: true, Tuesday: false, Wednesday: true, Thursday: true, Friday: true } }), expect.anything());
  expect(wrapper.emitted('saved')).toHaveLength(1); expect(wrapper.emitted('close')).toHaveLength(1);
});
it('keeps failures visible without closing or reporting saved choices', async () => {
  await render(); api.put.mockRejectedValue({ response: { data: { error: { message: 'Assignment changed. Reload.' } } } });
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(wrapper.find('[role="alert"]').text()).toContain('Assignment changed'); expect(wrapper.emitted('saved')).toBeUndefined(); expect(wrapper.emitted('close')).toBeUndefined();
});
it('does not invent availability on a failed load and supports retry', async () => {
  api.get.mockRejectedValueOnce(new Error('offline')); await render();
  expect(wrapper.findAll('fieldset')).toHaveLength(0); expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  await wrapper.find('[role="alert"] button').trigger('click'); await flushPromises(); expect(wrapper.findAll('fieldset')).toHaveLength(5);
});
