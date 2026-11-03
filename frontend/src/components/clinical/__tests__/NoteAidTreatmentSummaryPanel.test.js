import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NoteAidTreatmentSummaryPanel from '../NoteAidTreatmentSummaryPanel.vue';
import api from '../../../services/api.js';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/auth.js', () => ({ useAuthStore: () => ({ user: { id: 9, role: 'provider' } }) }));
const snapshot = () => ({ id: 71, signingToken: 'saved-draft-token', canSignClinicalNote: true, title: 'DEMO QA treatment summary', outputJson: { sections: { Summary: 'DEMO QA saved narrative' } } });
const mountPanel = () => mount(NoteAidTreatmentSummaryPanel, { props: { noteId: 71, agencyId: 2 }, global: { stubs: { ClinicalNoteCosignReview: true } } });
const signButton = wrapper => wrapper.findAll('button').find(button => button.text() === 'Provider sign');
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: { note: snapshot() } }); });
describe('initial treatment summary signature snapshot', () => {
  it('binds the initial signature to the saved draft token and records only the server time', async () => {
    api.post.mockResolvedValue({ data: { signedAt: '2026-11-03T17:00:00Z' } }); const w = mountPanel(); await flushPromises();
    expect(w.text()).toContain('DEMO QA saved narrative'); expect(signButton(w).element.disabled).toBe(true);
    await w.get('input[type=checkbox]').setValue(true); await signButton(w).trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/71/sign', { agencyId: 2, signingToken: 'saved-draft-token', accurateAndComplete: true, medicalNecessityAttested: false, contentReviewConfirmed: true }, { skipGlobalLoading: true });
    expect(w.emitted('updated')).toHaveLength(1); expect(w.text()).toContain('Provider signed'); w.unmount();
  });
  it('requires renewed review after a stale draft and never emits success', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'DEMO QA saved summary changed' } } } }); const w = mountPanel(); await flushPromises(); await w.get('input[type=checkbox]').setValue(true); await signButton(w).trigger('click'); await flushPromises();
    expect(w.text()).toContain('saved summary changed'); expect(w.find('input[type=checkbox]').exists()).toBe(false); expect(w.text()).toContain('Reload saved summary'); expect(w.emitted('updated')).toBeUndefined(); w.unmount();
  });
  it('does not offer a clinical signature when the server denies it', async () => {
    api.get.mockResolvedValue({ data: { note: { ...snapshot(), canSignClinicalNote: false } } }); const w = mountPanel(); await flushPromises(); expect(signButton(w)).toBeUndefined(); expect(w.find('input[type=checkbox]').exists()).toBe(false); w.unmount();
  });
});
