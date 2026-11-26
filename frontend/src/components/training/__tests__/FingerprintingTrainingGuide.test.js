import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Course from '../FingerprintingTrainingGuide.vue';
import { FINGERPRINTING_SCREENSHOTS } from '../../../navigation/hireFingerprintingScreenshots.js';
const titles = [...new Set(FINGERPRINTING_SCREENSHOTS.map(item => item.stepTitle)), 'Complete your appointment and notify Rachel Finch'];
const html = '<p>Original introduction.</p><ol>' + titles.map(title => `<li><h3>${title}</h3><p>Original instructions for ${title}.</p>${title === 'Ship the card to ITSCO' ? '<ul><li>ITSCO</li><li>Rachel Finch</li></ul>' : ''}</li>`).join('') + '</ol><p>Keep your confirmation.</p>';
let wrapper, http;
beforeEach(() => {
 http = { get: vi.fn(async () => ({ data: new Blob(['synthetic image'], { type: 'image/png' }) })), post: vi.fn() };
 let id = 0;vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => `blob:fixture-${++id}`);static revokeObjectURL = vi.fn(); });
});
afterEach(() => { wrapper?.unmount();vi.unstubAllGlobals(); });
function render(guide = { html, instructions: 'This is separate from the employment background check.' }) {
 wrapper = mount(Course, { props: { guide, http, moduleId: 32, onDemand: true } });return wrapper;
}
const button = text => wrapper.findAll('button').find(node => node.text().includes(text));
it('shows all nine numbered steps with their original screenshots and keeps nested shipping instructions together', async () => {
 render();await flushPromises();
 expect(wrapper.text()).toContain('separate from the employment background check');
 expect(wrapper.text()).toContain('Original introduction.');expect(wrapper.text()).toContain('Keep your confirmation.');
 expect(wrapper.findAll('.step-picker button')).toHaveLength(9);
 expect(wrapper.find('.step-navigation button').attributes('disabled')).toBeDefined();
 for (let step = 0; step < titles.length; step++) {
  expect(wrapper.get('.step-position').text()).toBe(`Step ${step + 1} of 9`);
  expect(wrapper.get('.course-step h3').text()).toBe(titles[step]);
  const images = FINGERPRINTING_SCREENSHOTS.filter(item => item.stepTitle === titles[step]);
  expect(wrapper.findAll('.course-step img[src^="blob:"]')).toHaveLength(images.length);
  if (step === 7) expect(wrapper.get('.course-step ul').text()).toContain('Rachel Finch');
  if (step < titles.length - 1) { await button('Next step').trigger('click');await flushPromises(); }
 }
 expect(http.get).toHaveBeenCalledTimes(9);
 expect(http.get.mock.calls.every(([path]) => path.startsWith('/on-demand-training/modules/32/fingerprinting-screenshots/'))).toBe(true);
 expect(http.post).not.toHaveBeenCalled();
 await button('Previous step').trigger('click');await flushPromises();expect(wrapper.get('.course-step h3').text()).toBe(titles[7]);
 expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('uses edited saved instructions and course content and lets people revisit a selected step', async () => {
 render();await flushPromises();await wrapper.findAll('.step-picker button')[6].trigger('click');await flushPromises();
 expect(wrapper.get('.step-position').text()).toBe('Step 7 of 9');
 await wrapper.setProps({ guide: { instructions: 'Updated instructions.', html: html.replace('Original instructions for Open Cabiond.', 'Updated first step.') } });await flushPromises();
 expect(wrapper.get('.step-position').text()).toBe('Step 1 of 9');expect(wrapper.text()).toContain('Updated instructions.');expect(wrapper.get('.course-step').text()).toContain('Updated first step.');
});
it('preserves a custom guide without an ordered list', async () => {
 render({ html: '<h3>Custom agency instructions</h3><p>Original custom wording.</p>' });await flushPromises();
 expect(wrapper.get('.step-position').text()).toBe('Step 1 of 1');expect(wrapper.text()).toContain('Original custom wording.');expect(http.get).not.toHaveBeenCalled();
});
