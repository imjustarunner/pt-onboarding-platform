import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import SchoolCareBridgeBrand from '../SchoolCareBridgeBrand.vue';

describe('SchoolCareBridge public home link', () => {
  it.each(['', '/assets/schoolcarebridge/logo.png', 'https://schoolcarebridge.org/assets/schoolcarebridge/logo.png?v=old', 'https://mh4kidz.org/assets/schoolcarebridge/logo.png'])('frames the original built-in logo without its empty margins (%s)', logo => {
    const wrapper = mount(SchoolCareBridgeBrand, { props: { logo } });
    expect(wrapper.get('img').attributes('src')).toBe('/assets/schoolcarebridge/wordmark.svg');
  });
  it('preserves a configured custom logo', () => {
    const wrapper = mount(SchoolCareBridgeBrand, { props: { logo: '/uploads/custom-school.svg' } });
    expect(wrapper.get('img').attributes('src')).toBe('/uploads/custom-school.svg');
  });
  it.each([false, true])('leaves the login router for the public homepage (compact=%s)', compact => {
    const wrapper = mount(SchoolCareBridgeBrand, { props: { compact } });
    const link = wrapper.get('a');
    expect(link.attributes('href')).toBe('https://schoolcarebridge.org/');
    expect(new URL(link.attributes('href')).pathname).not.toMatch(/\/app|\/login|\/schoolcarebridge/);
    expect(link.get('img').attributes('alt')).toBe('SchoolCareBridge');
  });
});
