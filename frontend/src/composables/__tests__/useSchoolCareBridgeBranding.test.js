import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import { it, expect } from 'vitest';
import { useSchoolCareBridgeBranding, schoolCareBridgeBrowserBrand } from '../useSchoolCareBridgeBranding';

it('restores the prior identity when switching from school to program views', async () => {
  document.head.innerHTML = '<link rel="icon" href="/practice.png">';
  document.title = 'Practice';
  const enabled = ref(true);
  const wrapper = mount({ setup() { useSchoolCareBridgeBranding('Overview', enabled); }, template: '<div />' });
  expect(document.title).toBe('Overview | SchoolCareBridge');
  expect(schoolCareBridgeBrowserBrand.value.title).toBe(document.title);
  enabled.value = false;
  await nextTick();
  expect(document.title).toBe('Practice');
  expect(schoolCareBridgeBrowserBrand.value).toBeNull();
  expect(document.querySelector('link').getAttribute('href')).toBe('/practice.png');
  enabled.value = true;
  await nextTick();
  wrapper.unmount();
  expect(document.title).toBe('Practice');
  expect(schoolCareBridgeBrowserBrand.value).toBeNull();
});

it('does not overwrite branding established by the next view on unmount', () => {
  const wrapper = mount({ setup() { useSchoolCareBridgeBranding('Portal'); }, template: '<div />' });
  document.title = 'Another workspace';
  document.querySelector('link').setAttribute('href', '/another.png');
  wrapper.unmount();
  expect(document.title).toBe('Another workspace');
  expect(document.querySelector('link').getAttribute('href')).toBe('/another.png');
});
