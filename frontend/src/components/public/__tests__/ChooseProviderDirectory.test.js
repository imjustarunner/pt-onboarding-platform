import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ChooseProviderDirectory from '../ChooseProviderDirectory.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
const openProvider = { id: 1, displayName: 'Zoe Example', acceptingNewClients: true, waitlist: false, credential: 'LPC', profilePhotoUrl: '/public-photo.jpg', intakeStatusByFormat: { IN_PERSON: 'accepting', VIRTUAL: 'accepting' }, clinicalFocus: { reviewed: true, top: { specialties: ['Anxiety'] } } };
const waitlistProvider = { id: 2, displayName: 'Amy Sample', acceptingNewClients: false, waitlist: true, intakeStatusByFormat: { IN_PERSON: 'waitlist', VIRTUAL: 'waitlist' } };
const closedProvider = { id: 3, displayName: 'Closed Provider', acceptingNewClients: false, waitlist: false, intakeStatusByFormat: { IN_PERSON: 'unavailable', VIRTUAL: 'unavailable' } };
const wrappers = [];
const render = props => {
  const wrapper = mount(ChooseProviderDirectory, { attachTo: document.body, props: { mode: 'intake', providers: [waitlistProvider, closedProvider, openProvider], agencySlug: 'itsco', ...props } });
  wrappers.push(wrapper);
  return wrapper;
};
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { provider: openProvider, profile: { publicBlurb: 'A provider biography.', insurancesAccepted: ['Example plan'], details: { languages: ['English'] } } } }); });
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; document.body.style.overflow = ''; });

describe('compact full enrollment provider choice', () => {
  it('puts Open before Waitlist, excludes Closed, and renders concise rows without downloading profiles', async () => {
    const wrapper = render();
    expect(wrapper.findAll('.cpd-compact-row').map(row => row.attributes('data-provider-id'))).toEqual(['1', '2']);
    expect(wrapper.text()).not.toContain('Closed Provider');
    expect(wrapper.find('.cpd-avatar').attributes('src')).toBe('/public-photo.jpg');
    expect(wrapper.text()).toContain('In person · Virtual');
    expect(wrapper.text()).toContain('Anxiety');
    expect(wrapper.text()).toContain('does not guarantee placement');
    expect(wrapper.text()).toContain('care coordinator');
    await wrapper.find('.cpd-sort').setValue('name');
    expect(wrapper.findAll('.cpd-compact-row').map(row => row.attributes('data-provider-id'))).toEqual(['1', '2']);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('filters and labels eligibility for the requested modality rather than another open format', () => {
    const wrapper = render({ modality: 'VIRTUAL', providers: [
      { ...openProvider, id: 11, intakeStatusByFormat: { IN_PERSON: 'accepting', VIRTUAL: 'unavailable' } },
      { ...waitlistProvider, id: 12, acceptingNewClients: true, intakeStatusByFormat: { IN_PERSON: 'accepting', VIRTUAL: 'waitlist' } },
      { ...openProvider, id: 13 }
    ] });
    const rows = wrapper.findAll('.cpd-compact-row');
    expect(rows.map(row => row.attributes('data-provider-id'))).toEqual(['13', '12']);
    expect(rows[1].text()).toContain('Waitlist');
    expect(rows[1].text()).toContain('Choose waitlist');
    expect(wrapper.text()).not.toContain('In person');
  });

  it('lets applicants select a preference or skip without racing the parent hold release', async () => {
    const wrapper = render({ selectedIds: ['2'] });
    await wrapper.find('.cpd-select-provider').trigger('click');
    expect(wrapper.emitted('update:selectedIds').at(-1)[0]).toEqual(['2', '1']);
    await wrapper.find('.cpd-skip-top').trigger('click');
    expect(wrapper.emitted('update:selectedIds')).toHaveLength(1);
    expect(wrapper.emitted('skip')).toHaveLength(1);
  });

  it('opens a profile on demand and returns focus when dismissed by Escape', async () => {
    const wrapper = render();
    const view = wrapper.find('.cpd-view-profile');
    view.element.focus();
    await view.trigger('click');
    await flushPromises();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('A provider biography.');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/public/agency-services/itsco/providers/1', expect.objectContaining({ skipGlobalLoading: true }));
    expect(document.activeElement.getAttribute('aria-label')).toBe('Close provider profile');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(view.element);
  });

  it('dismisses only on backdrop click or close button and traps keyboard focus inside the dialog', async () => {
    const wrapper = render();
    await wrapper.find('.cpd-view-profile').trigger('click');
    await flushPromises();
    const dialog = document.querySelector('[role="dialog"]');
    dialog.click();
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const close = dialog.querySelector('.epd-close');
    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(dialog.querySelector('.epd-button-primary'));
    document.querySelector('.epd-backdrop').click();
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await wrapper.find('.cpd-view-profile').trigger('click');
    await flushPromises();
    document.querySelector('.epd-close').click();
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('preserves the enrollment choice and shows basic profile data if details fail', async () => {
    api.get.mockRejectedValue(new Error('Unavailable'));
    const wrapper = render();
    await wrapper.find('.cpd-view-profile').trigger('click');
    await flushPromises();
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Some profile details could not be loaded');
    document.querySelector('.epd-button-primary').click();
    await flushPromises();
    expect(wrapper.emitted('update:selectedIds').at(-1)[0]).toEqual(['1']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });



  it('preserves matching rank by default while allowing openings or name sorting within availability status', async () => {
    const wrapper = render({ providers: [
      { ...waitlistProvider, id: 8, openSlots: 99 },
      { ...openProvider, id: 6, displayName: 'Zoe Best Fit', openSlots: 1 },
      { ...openProvider, id: 7, displayName: 'Amy More Openings', openSlots: 8 }
    ] });
    const ids = () => wrapper.findAll('.cpd-compact-row').map(row => row.attributes('data-provider-id'));
    expect(wrapper.find('.cpd-sort').element.value).toBe('bestFit');
    expect(ids()).toEqual(['6', '7', '8']);
    await wrapper.find('.cpd-sort').setValue('openSlots');
    expect(ids()).toEqual(['7', '6', '8']);
    await wrapper.find('.cpd-sort').setValue('name');
    expect(ids()).toEqual(['7', '6', '8']);
    await wrapper.find('.cpd-sort').setValue('bestFit');
    expect(ids()).toEqual(['6', '7', '8']);
  });

  it('limits intake to three preferences and keeps unselected profiles readable', async () => {
    const wrapper = render({ providers: [openProvider, waitlistProvider, { ...openProvider, id: 4 }, { ...openProvider, id: 5 }], selectedIds: ['1', '2', '4'] });
    expect(wrapper.find('.cpd-selection-count').text()).toContain('3 selected');
    const fourth = wrapper.find('[data-provider-id="5"]');
    expect(fourth.find('.cpd-select-provider').element.disabled).toBe(true);
    expect(wrapper.find('[data-provider-id="1"] .cpd-select-provider').element.disabled).toBe(false);
    await fourth.find('.cpd-view-profile').trigger('click');
    await flushPromises();
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Remove one before choosing another provider');
    expect(document.querySelector('.epd-button-primary').disabled).toBe(true);
    document.querySelector('.epd-close').click();
    await flushPromises();
    await wrapper.find('[data-provider-id="1"] .cpd-select-provider').trigger('click');
    expect(wrapper.emitted('update:selectedIds').at(-1)[0]).toEqual(['2', '4']);
    await wrapper.setProps({ selectedIds: ['2', '4'] });
    expect(fourth.find('.cpd-select-provider').element.disabled).toBe(false);
    await fourth.find('.cpd-select-provider').trigger('click');
    expect(wrapper.emitted('update:selectedIds').at(-1)[0]).toEqual(['2', '4', '5']);
  });

  it('keeps existing public directory cards and action events outside enrollment', async () => {
    const wrapper = render({ mode: 'public', providers: [openProvider] });
    expect(wrapper.find('.cpd-compact-list').exists()).toBe(false);
    expect(wrapper.find('.cpd-card').exists()).toBe(true);
    expect(wrapper.find('.cpd-skip-top').exists()).toBe(false);
    await wrapper.find('.cpd-btn-primary').trigger('click');
    expect(wrapper.emitted('prefer')[0][0]).toEqual(openProvider);
    expect(api.get).not.toHaveBeenCalled();
  });
});
