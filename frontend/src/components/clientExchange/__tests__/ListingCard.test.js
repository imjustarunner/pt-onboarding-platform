import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import ListingCard from '../ListingCard.vue';

const listing = { id: 17, status: 'open', createdAt: '2026-11-03', preferences: { modality: 'virtual' }, viewerFit: { status: 'match', canRequest: true, blockers: [], adjustments: [] } };

it('shows the request action on the list card and on the compact card', async () => {
  const wrapper = mount(ListingCard, { props: { listing, canRequest: true, clientLabel: 'Sage' } });
  expect(wrapper.findAll('button').some(button => button.text() === 'Request this client')).toBe(true);
  await wrapper.setProps({ compact: true });
  const request = wrapper.findAll('button').find(button => button.text() === 'Request this client');
  expect(request.exists()).toBe(true);
  await request.trigger('click');
  expect(wrapper.emitted('request')[0][0].id).toBe(17);
  wrapper.unmount();
});

it('shows a pending request on the card instead of another request button', () => {
  const wrapper = mount(ListingCard, { props: { listing, requestPending: true, clientLabel: 'Sage' } });
  expect(wrapper.text()).toContain('Your request is pending.');
  expect(wrapper.findAll('button').some(button => button.text() === 'Request this client')).toBe(false);
  wrapper.unmount();
});
