import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import DigitalFormShell from '../DigitalFormShell.vue';

const css = readFileSync(resolve(process.cwd(), 'src/styles/enrollment-layout.css'), 'utf8');
const steps = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, label: `Step label ${i + 1}` }));

describe('enrollment step navigation', () => {
  it('renders every step in one navigation row with a visible progress bar', () => {
    const wrapper = mount(DigitalFormShell, {
      props: { enrollmentLayout: true, progressSteps: steps, progressIndex: 3 },
      global: { plugins: [createPinia()], stubs: { EnrollmentBrand: true, RouterLink: true } }
    });
    expect(wrapper.findAll('.df-enrollment-progress button')).toHaveLength(12);
    const bar = wrapper.get('.df-enrollment-progress-bar');
    expect(bar.attributes('role')).toBe('progressbar');
    expect(bar.attributes('aria-valuenow')).toBe('4');
    expect(bar.attributes('aria-valuemax')).toBe('12');
    expect(bar.get('i').attributes('style')).toContain('width: 33%');
  });

  it('keeps desktop steps on a single non-wrapping row and phones on one scrolling row', () => {
    const desktop = css.match(/\.df-page\.df-page--enrollment \.df-enrollment-progress \{[^}]*\}/)[0];
    expect(desktop).toContain('grid-auto-flow:column');
    expect(desktop).not.toContain('auto-fit');
    expect(desktop).toContain('overflow-x:auto');
    expect(css).toMatch(/\.df-enrollment-progress-bar \{[^}]*height:6px/);
    const phone = css.slice(css.indexOf('@media(max-width:720px)'));
    expect(phone).toMatch(/\.df-enrollment-progress \{[^}]*flex-wrap:nowrap[^}]*overflow-x:auto/);
  });
});
