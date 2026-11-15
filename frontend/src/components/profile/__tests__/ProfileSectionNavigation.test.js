import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ProfileSectionNavigation from '../ProfileSectionNavigation.vue';

let wrapper;
let root;
afterEach(() => {
  wrapper?.unmount();
  root?.remove();
  vi.restoreAllMocks();
});

function mountNavigation(content) {
  root = document.createElement('div');
  root.innerHTML = `<div class="tab-content">${content}</div>`;
  document.body.append(root);
  wrapper = mount(ProfileSectionNavigation, { props: { root, tabId: 'account', label: 'Account' } });
  return flushPromises();
}

describe('Profile section navigation', () => {
  it('lists rendered sections, skips hidden cards and fields, and reveals a collapsed destination', async () => {
    await mountNavigation(`
      <section id="contact" class="acct-card"><h3>Contact information</h3><label>First name</label></section>
      <details><summary>More</summary><section id="employment" class="acct-card"><h3>Employment</h3></section></details>
      <section id="hidden" class="acct-card" hidden><h3>Unavailable section</h3></section>
    `);

    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Contact information', 'Employment']);
    expect(wrapper.text()).toContain('2 sections');
    const scroll = vi.fn();
    root.querySelector('#employment').scrollIntoView = scroll;
    await wrapper.findAll('button')[1].trigger('click');
    expect(root.querySelector('details').open).toBe(true);
    expect(document.activeElement.id).toBe('employment');
    expect(wrapper.findAll('button')[1].attributes('aria-current')).toBe('location');
    expect(scroll).toHaveBeenCalled();
  });

  it('discovers sections that finish loading after a page opens', async () => {
    await mountNavigation('<div class="ov-card"><span class="ov-card-title">Personal information</span></div>');
    expect(wrapper.find('nav').exists()).toBe(false);
    root.querySelector('.tab-content').insertAdjacentHTML('beforeend', '<div class="ov-card"><span class="ov-card-title">Assignments</span></div>');
    await new Promise(resolve => setTimeout(resolve, 110));
    await flushPromises();
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Personal information', 'Assignments']);
    expect(root.querySelectorAll('.ov-card[id]')).toHaveLength(2);
  });

  it('replaces sections when navigating to another page', async () => {
    await mountNavigation('<section id="contact"><h3>Contact information</h3></section><section id="security"><h3>Security</h3></section>');
    root.querySelector('.tab-content').innerHTML = '<section id="agencies"><h3>Agencies</h3></section><section id="offices"><h3>Offices</h3></section>';
    await wrapper.setProps({ tabId: 'assignments', label: 'Assignments' });
    await flushPromises();
    expect(wrapper.attributes('aria-label')).toBe('Assignments sections');
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Agencies', 'Offices']);
  });
});
