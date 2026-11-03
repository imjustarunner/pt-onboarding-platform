import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import ClinicalNoteCosignReview from '../ClinicalNoteCosignReview.vue';
import ClinicalNoteSupervisorReview from '../ClinicalNoteSupervisorReview.vue';
import api from '../../../services/api.js';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async url => ({ data: url.includes('document-reviews')
    ? { content: JSON.stringify({ note: { sections: { Narrative: 'Signed note for review' } }, addenda: [] }), contentHash: 'version-2', reviewSnapshotToken: 'metadata-2', canCosign: true }
    : { note: { id: 4, providerSignedByUserId: 7, providerSignedAt: '2026-11-02T10:00:00Z', reviewSnapshotToken: 'metadata-2', isBillable: false } } }));
  api.post.mockResolvedValue({ data: { ok: true } });
});
const mountReview = () => mount(ClinicalNoteCosignReview, { props: { noteId: 4, agencyId: 1, providerId: 7 } });

describe('cosign entry point shared by dashboard and billing', () => {
  it('opens the common supervisor review and forwards an exact-version signature', async () => {
    const w = mountReview();
    expect(api.get).not.toHaveBeenCalled();
    await w.find('button').trigger('click'); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/supervision/supervisee/7/document-reviews/note/4', { params: { agencyId: 1 }, skipGlobalLoading:true });
    expect(w.text()).toContain('Signed note for review');
    expect(w.find('[data-testid="cosign"]').element.disabled).toBe(true);
    await w.find('[data-testid="supervisor-attestation"]').setValue(true);
    await w.find('[data-testid="cosign"]').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/4/cosign', { agencyId: 1, contentHash: 'version-2', reviewSnapshotToken: 'metadata-2', reviewedAndApproved: true }, {skipGlobalLoading:true});
    expect(w.emitted('signed')).toHaveLength(1);
    expect(w.findComponent(ClinicalNoteSupervisorReview).exists()).toBe(false); w.unmount();
  });
  it('keeps a failed signature visible and never claims success', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Read the current note and addenda before cosigning.' } } } });
    const w = mountReview(); await w.find('button').trigger('click'); await flushPromises();
    await w.find('[data-testid="supervisor-attestation"]').setValue(true);
    await w.find('[data-testid="cosign"]').trigger('click'); await flushPromises();
    expect(w.find('[role="alert"]').text()).toContain('Read the current');
    expect(w.emitted('signed')).toBeUndefined();
    expect(w.find('[data-testid="supervisor-attestation"]').element.checked).toBe(false); w.unmount();
  });
  it('closes a returned note and forwards the return action to its queue', async () => {
    const w = mountReview(); await w.find('button').trigger('click'); await flushPromises();
    w.findComponent(ClinicalNoteSupervisorReview).vm.$emit('returned', { noteId: 4, action: 'changes_needed' }); await flushPromises();
    expect(w.emitted('returned')[0][0].action).toBe('changes_needed');
    expect(w.findComponent(ClinicalNoteSupervisorReview).exists()).toBe(false); w.unmount();
  });
  it('closes the previous review when the note context changes', async () => {
    const w = mountReview(); await w.find('button').trigger('click'); await flushPromises();
    await w.setProps({ noteId: 5 });
    expect(w.findComponent(ClinicalNoteSupervisorReview).exists()).toBe(false); w.unmount();
  });
});
