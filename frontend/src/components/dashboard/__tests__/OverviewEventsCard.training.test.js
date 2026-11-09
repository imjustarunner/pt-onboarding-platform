import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import OverviewEventsCard from '../OverviewEventsCard.vue';
import { useHowToVideo } from '../../../composables/useHowToVideo';
vi.mock('../StaffPollsPanel.vue', () => ({ default: { template: '<div />' } }));
it('places the events video beside its calendar link and opens that specific training', async () => {
  const wrapper = mount(OverviewEventsCard);
  const row = wrapper.get('.ov-calendar-training');
  expect(row.get('.ov-link').text()).toBe('Events & outreach calendar');
  await row.get('.how-to-inline').trigger('click');
  expect(useHowToVideo().request.value.id).toBe('events-outreach-calendar');
  wrapper.unmount();
});
