import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Guide from '../HireFingerprintingGuide.vue';
import { FINGERPRINTING_SCREENSHOTS } from '../../../navigation/hireFingerprintingScreenshots.js';
let http, wrappers;
const png = () => new Blob(['synthetic fixture'], { type: 'image/png' });
const heading = '<h3>Create an account if you need one</h3><p>Instructions.</p>';
beforeEach(() => {
 wrappers = [];http = { get: vi.fn(async () => ({ data: png() })), post: vi.fn() };
 let number = 0;vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:fixture-' + (++number));static revokeObjectURL = vi.fn(); });
});
afterEach(() => { wrappers.forEach(w => w.unmount());vi.unstubAllGlobals(); });
function render(props = {}) { const wrapper = mount(Guide, { props: { html: heading, http, token: 'synthetic-portal', agencyId: 9000, ...props } });wrappers.push(wrapper);return wrapper; }
it('loads all nine original references through the candidate endpoint and offers full-size viewing', async () => {
 const html = [...new Set(FINGERPRINTING_SCREENSHOTS.map(i => i.stepTitle))].map(t => '<h3>' + t + '</h3><p>Instruction.</p>').join('');
 const w = render({ html });await flushPromises();expect(http.get).toHaveBeenCalledTimes(9);expect(w.findAll('img[src^="blob:"]')).toHaveLength(9);
 expect(http.get.mock.calls.every(([url,options]) => url.startsWith('/prehire-portal/synthetic-portal/workflow/denver-school-fingerprinting/images/') && options.responseType === 'blob')).toBe(true);
 expect(w.findAll('a[target="_blank"]')).toHaveLength(9);expect(http.post).not.toHaveBeenCalled();expect(w.props('html')).toBe(html);
});
it('uses the protected organization-scoped staff endpoint in read-only previews', async () => {
 const w = render({ preview: true, token: 'preview' });await flushPromises();expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/contracts/fingerprinting-screenshots/'), expect.objectContaining({ params: { agencyId: 9000 }, responseType: 'blob' }));expect(w.find('img').attributes('src')).toMatch(/^blob:/);expect(http.post).not.toHaveBeenCalled();
});
it('retries failed screenshots and frees the private object URL on unmount', async () => {
 http.get.mockRejectedValueOnce(new Error('temporary failure'));const w = render();await flushPromises();expect(w.find('[role="alert"]').exists()).toBe(true);
 await w.find('button').trigger('click');await flushPromises();expect(w.find('[role="alert"]').exists()).toBe(false);expect(w.find('img').attributes('src')).toBe('blob:fixture-1');
 w.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture-1');wrappers = [];
});
it('discards a response from an earlier guide after the viewer changes', async () => {
 let finish;http.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));const w = render();await flushPromises();await w.setProps({ html: '<p>Different step</p>' });await flushPromises();finish({ data: png() });await flushPromises();expect(w.text()).toContain('Different step');expect(w.findAll('img')).toHaveLength(0);expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('does not request arbitrary image keys embedded in a guide', async () => {
 const w = render({ html: '<p>Guide</p><img data-fingerprinting-screenshot="untrusted-key" />' });await flushPromises();expect(http.get).not.toHaveBeenCalled();expect(w.find('img').exists()).toBe(false);
});
