import { beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
const calls = vi.hoisted(() => ({ adapter: null, get: vi.fn(), post: vi.fn(), staffGet: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: calls.staffGet } }));
vi.mock('axios', () => ({ default: { create: options => { calls.adapter = options.adapter;return { get: calls.get, post: calls.post }; } } }));
vi.mock('../../components/prehire/HireDocumentPreview.vue', () => ({ default: { template: '<div />' } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../composables/useOnboardingActivity.js', () => ({ useOnboardingActivity: () => ({}) }));
import Portal from '../CandidatePreHirePortalView.vue';
beforeEach(() => { vi.clearAllMocks();calls.staffGet.mockResolvedValue({ data: new Blob(['synthetic fixture'], { type: 'image/png' }), status: 200 }); });
async function setup() {
 const previewData = { candidate: { status: 'PREHIRE_OPEN' }, agency: { id: 9000, name: 'Synthetic ITSCO' }, journey: {}, workflow: { supervisor: {}, steps: { pre_hire: [], onboarding: [] } }, tasks: [] };
 const wrapper = shallowMount(Portal, { props: { previewData } });await flushPromises();return wrapper;
}
it('forwards only the image GET through staff authentication using the preview organization', async () => {
 const w = await setup();const url = '/contracts/fingerprinting-screenshots/' + 'a'.repeat(64);
 const response = await calls.adapter({ method: 'get', url, params: { agencyId: 9999 } });expect(response.data.type).toBe('image/png');expect(calls.staffGet).toHaveBeenCalledWith(url, expect.objectContaining({ params: { agencyId: 9000 }, responseType: 'blob' }));w.unmount();
});
it('continues to block candidate writes and unrelated staff reads in preview', async () => {
 const w = await setup();for (const config of [{ method: 'post', url: '/contracts/fingerprinting-screenshots/' + 'a'.repeat(64) }, { method: 'get', url: '/contracts/library' }]) await expect(calls.adapter(config)).rejects.toThrow('read-only');expect(calls.staffGet).not.toHaveBeenCalled();w.unmount();
});
