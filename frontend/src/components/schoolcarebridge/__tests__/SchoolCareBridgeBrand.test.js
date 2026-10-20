import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import SchoolCareBridgeBrand from '../SchoolCareBridgeBrand.vue';

describe('SchoolCareBridge public home link', () => {
  it.each([false, true])('leaves the login router for the public homepage (compact=%s)', compact => {
    const wrapper = mount(SchoolCareBridgeBrand, { props: { compact } });
    const link = wrapper.get('a');
    expect(link.attributes('href')).toBe('https://schoolcarebridge.org/');
    expect(new URL(link.attributes('href')).pathname).not.toMatch(/\/app|\/login|\/schoolcarebridge/);
    expect(link.get('img').attributes('alt')).toBe('SchoolCareBridge');
  });
});
