import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LibraryResourceList from '../LibraryResourceList.vue';
import LibraryResourceGrid from '../LibraryResourceGrid.vue';

const resources = [
  { id: 'guide:workplace-handbook', resourceType: 'company_guide', guideKey: 'workplace-handbook', name: 'Workplace handbook' },
  { id: 'guide:provider', resourceType: 'company_guide', guideKey: 'provider-guide', name: 'Provider guide' },
  { id: 12, resourceType: 'branded_doc', name: 'My document', isMine: true, scope: 'personal' },
  { id: 13, resourceType: 'file', fileType: 'pdf', name: 'Shared PDF', isMine: false, scope: 'personal' }
];
for (const Component of [LibraryResourceList, LibraryResourceGrid]) {
  describe(Component.__name, () => {
    it('offers independent open, detail and favorite controls without nested buttons', async () => {
      const wrapper = mount(Component, { props: { items: resources, canManage: true, showDetails: true, selectedId: 12 } });
      expect(wrapper.find('button button').exists()).toBe(false);
      expect(wrapper.text()).toContain('Handbook');
      expect(wrapper.text()).toContain('Guide');
      expect(wrapper.text()).toContain('Document');
      await wrapper.findAll('button').find(b => b.text().startsWith('My document')).trigger('click');
      expect(wrapper.emitted('open')).toEqual([[resources[2]]]);
      await wrapper.get('button[aria-label="Details for My document"]').trigger('click');
      expect(wrapper.emitted('details')).toEqual([[resources[2]]]);
      await wrapper.get('button[aria-label="Add to favorites: My document"]').trigger('click');
      expect(wrapper.emitted('toggle-favorite')).toEqual([[resources[2]]]);
      expect(wrapper.emitted('open')).toHaveLength(1);
      expect(wrapper.find('.is-selected').text()).toContain('My document');
      wrapper.unmount();
    });
    it('does not expose file mutation actions on guides or label shared files as mine', () => {
      const wrapper = mount(Component, { props: { items: resources, canManage: true } });
      expect(wrapper.find('button[aria-label="Add to favorites: Workplace handbook"]').exists()).toBe(false);
      expect(wrapper.find('button[aria-label="More actions for Provider guide"]').exists()).toBe(false);
      expect(wrapper.findAll('.lib-mine-tag')).toHaveLength(1);
      expect(wrapper.findAll('.lib-mine-tag')[0].element.closest('.lib-card, .lib-list__row').textContent).toContain('My document');
      wrapper.unmount();
    });
  });
}
