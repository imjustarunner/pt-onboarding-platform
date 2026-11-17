import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Shell from '../ClientChartShell.vue';
it('collapses branding, actions, and alerts while retaining the tab controls and content', async () => {
  const wrapper = mount(Shell, {
    props: { clinicalBranding: true, tabs: [{ id: 'overview', label: 'Overview', description: 'Summary' }], alertItems: [{ id: 'test', label: 'Test alert' }] },
    slots: { header: '<h2>Example Client</h2>', 'quick-actions': '<button>Assignments</button>', default: '<input value="Unsaved edit" />' },
    global: { stubs: { ClinicalWorkspaceFrame: { props: ['hideHeader'], template: '<section><header v-if="!hideHeader">Branding</header><slot /></section>' } } }
  });
  await wrapper.setProps({ headerCollapsed: true });
  expect(wrapper.text()).not.toContain('Branding');
  expect(wrapper.find('.cc-alert-bar').exists()).toBe(false);
  expect(wrapper.findAll('button').find(button => button.text() === 'Assignments').isVisible()).toBe(false);
  expect(wrapper.get('[role="tab"]').isVisible()).toBe(true);
  expect(wrapper.get('input').element.value).toBe('Unsaved edit');
  await wrapper.get('[role="tab"]').trigger('click');
  expect(wrapper.emitted('update:activeTab')).toEqual([['overview']]);
  await wrapper.setProps({ headerCollapsed: false });
  expect(wrapper.text()).toContain('Branding');
  wrapper.unmount();
});
