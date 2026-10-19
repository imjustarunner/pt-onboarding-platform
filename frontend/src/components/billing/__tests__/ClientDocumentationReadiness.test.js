import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import Panel from '../ClientDocumentationReadiness.vue';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const data = () => ({ status: 'not_reviewed', blockers: ['Review screening documents'], sourceHash: 'source', reviewId: null, evidence: { uploadedFiles: 2, signedForms: 3, paperwork: [{ key: 'roi', label: 'Release', status: 'received' }] } });
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: data() }); api.post.mockResolvedValue({ data: { id: 1 } }); });
describe('documentation review', () => {
  it('keeps screening receipt separate from verification and treatment intake', async () => {
    const w = mount(Panel, { props: { clientId: 8, agencyId: 2, scope: 'screening', serviceDate: '2026-10-19' } }); await flushPromises();
    expect(w.text()).toContain('full treatment intake may still be pending'); expect(w.text()).toContain('receipt, not verification'); expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('requires explicit attestation and saves the selected agency, scope and source revision', async () => {
    const w = mount(Panel, { props: { clientId: 8, agencyId: 2, scope: 'screening', serviceDate: '2026-10-19' } }); await flushPromises();
    await w.get('form select').setValue('verified'); const button = w.get('form button'); expect(button.attributes('disabled')).toBeDefined();
    await w.get('textarea').setValue('Reviewed the screening consent in Documents');
    for (const checkbox of w.findAll('input[type=checkbox]')) await checkbox.setValue(true);
    expect(button.attributes('disabled')).toBeUndefined(); await w.get('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/clients/8/documentation-readiness', expect.objectContaining({ agencyId: 2, scope: 'screening', sourceHash: 'source', previousReviewId: null, effectiveFrom: '2026-10-19', authorityReviewed: true, requiredDocumentsReviewed: true }));
    expect(w.emitted('saved')).toHaveLength(1); w.unmount();
  });
  it('discards old client responses when the agency changes or access fails', async () => {
    let resolveOld; api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const w = mount(Panel, { props: { clientId: 8, agencyId: 2 } });
    api.get.mockRejectedValue({ response: { data: { error: { message: 'Access denied' } } } }); await w.setProps({ agencyId: 3 }); await flushPromises();
    resolveOld({ data: data() }); await flushPromises(); expect(w.text()).toContain('Access denied'); expect(w.find('form').exists()).toBe(false); w.unmount();
  });
});
