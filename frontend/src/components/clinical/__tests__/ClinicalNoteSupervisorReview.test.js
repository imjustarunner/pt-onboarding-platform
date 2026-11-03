import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClinicalNoteSupervisorReview from '../ClinicalNoteSupervisorReview.vue';
import api from '../../../services/api.js';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const note = () => ({ id: 71, agencyId: 2, reviewSnapshotToken: 'metadata-version', clientName: 'DEMO QA Client', providerSignedAt: '2026-11-02T16:00:00Z', providerSignedByUserId: 9, providerSigner: { id: 9, name: 'DEMO QA Author', credentials: 'LSW' }, dateOfService: '2026-11-01', serviceCode: 'H0002', durationMinutes: 45, locationLabel: 'Office', startTime: '10:00', endTime: '10:45', placeOfService: '11', serviceLocationId: 5, clinicalSessionId: 100, structuredChart: { participants: 'Client only', mentalStatusExam: { domains: { Appearance: { status: 'normal' }, Mood: { status: 'abnormal', detail: 'Anxious' } } }, medications: { noneCurrently: true } }, outputJson: { sections: { Subjective: 'Stale fetched text' } }, objectiveRatings: [{ id: 1, goalIndex: 1, objectiveIndex: 1, scaleStart: 3, scalePrevious: 4, scaleValue: 5, scaleTarget: 8, objectiveText: 'Use a grounding strategy', disposition: 'rated' }] });
const review = () => ({ reviewSnapshotToken: 'metadata-version', contentHash: 'reviewed-current-version', canCosign: true, content: JSON.stringify({ note: { sections: { Subjective: 'Current signed narrative', Objective: '', Plan: 'Practice the agreed strategy.' } }, addenda: [{ id: 4, body: 'A signed correction', entry_kind: 'correction', entry_reason: 'Clarification', created_by_user_id: 3 }] }) });
const mounted = () => mount(ClinicalNoteSupervisorReview, { props: { noteId: 71, agencyId: 2 }, global: { stubs: { CosignReviewTimer: true } } });
const byText = (wrapper, label) => wrapper.findAll('button').find(button => button.text() === label);

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? review() : url.includes('service-locations') ? { items: [{ id: 5, name: 'Office', place_of_service: '11', is_active: 1 }] } : url.includes('/artifacts') ? { artifacts: { documents: [{ id: 2, title: 'Recorded screener' }] } } : { note: note() } }));
  api.post.mockResolvedValue({ data: { ok: true, cosignedAt: '2026-11-02T19:00:00Z' } });
});

describe('supervisor note review', () => {
  it('shows the hash-bound narrative, concise facts and ratings without authoring controls', async () => {
    const w = mounted(); await flushPromises();
    expect(w.text()).toContain('DEMO QA Client');
    expect(w.text()).toContain('Current signed narrative');
    expect(w.text()).not.toContain('Stale fetched text');
    expect(w.findAll('.content-section summary').map(node => node.text())).toEqual(['Subjective', 'Plan', 'Mental status · normal findings']);
    expect(w.find('[aria-label="Mental status findings"]').text()).toContain('Mood: abnormal — Anxious');
    expect(w.find('[aria-label="Mental status findings"]').text()).not.toContain('Appearance');
    expect(w.text()).not.toContain('Medications');
    expect(w.find('.rating-row').text()).toContain('Goal 1 · objective 1');
    expect(w.find('.rating-row summary').attributes('title')).toContain('Use a grounding strategy');
    for (const unwanted of ['Change tool', 'Generate Colorado note', 'Copy full note', 'Clinical Session ID', 'Agency:']) expect(w.text()).not.toContain(unwanted);
    expect(w.find('[data-testid="cosign"]').element.disabled).toBe(true);
    await w.find('[data-testid="supervisor-attestation"]').setValue(true);
    await w.find('[data-testid="cosign"]').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/cosign', { agencyId: 2, contentHash: 'reviewed-current-version', reviewSnapshotToken: 'metadata-version', reviewedAndApproved: true });
    expect(w.emitted('signed')).toHaveLength(1); w.unmount();
  });

  it('blocks approval for incomplete service details and preserves author signature', async () => {
    api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? review() : { note: { ...note(), startTime: '', locationLabel: '' } } }));
    const w = mounted(); await flushPromises();
    expect(w.text()).toContain('Author signed');
    expect(w.find('.missing-details').text()).toContain('location, start time');
    expect(w.find('[data-testid="supervisor-attestation"]').element.disabled).toBe(true);
    expect(w.find('[data-testid="cosign"]').element.disabled).toBe(true); w.unmount();
  });

  it('does not turn unanswered risk fields into a documented assessment', async () => {
    const emptyRiskNote = note();
    emptyRiskNote.structuredChart.riskAssessment = { items: { Suicide: { status: '', option: '', detail: '' }, Violence: { status: 'selected', option: '' } } };
    api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? review() : { note: emptyRiskNote } }));
    const w = mounted(); await flushPromises();
    expect(w.text()).not.toContain('Risk areas documented'); expect(w.text()).not.toContain('Risk assessment'); w.unmount();
  });

  it('requires a fresh attestation after a version conflict and never emits success', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'The note changed. Reload to review the current version.' } } } });
    const w = mounted(); await flushPromises();
    await w.find('[data-testid="supervisor-attestation"]').setValue(true); await w.find('[data-testid="cosign"]').trigger('click'); await flushPromises();
    expect(w.find('[role="alert"]').text()).toContain('The note changed');
    expect(w.find('[data-testid="supervisor-attestation"]').element.checked).toBe(false);
    expect(w.emitted('signed')).toBeUndefined(); w.unmount();
  });

  it('returns changes needed with an explicit message and exact review hash', async () => {
    api.post.mockResolvedValue({ data: { ok: true, reviewRequest: { id: 8, action: 'changes_needed', message: 'Please clarify the intervention.' } } });
    const w = mounted(); await flushPromises();
    await byText(w, 'Return / provide feedback').trigger('click');
    await w.find('[data-testid="feedback-message"]').setValue('Please clarify the intervention.');
    await w.find('.feedback-form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/supervisor-review', { agencyId: 2, contentHash: 'reviewed-current-version', reviewSnapshotToken: 'metadata-version', action: 'changes_needed', message: 'Please clarify the intervention.' });
    expect(w.emitted('returned')[0][0].action).toBe('changes_needed');
    expect(w.find('[data-testid="cosign"]').element.disabled).toBe(true); w.unmount();
  });

  it('distinguishes feedback with no required acknowledgement', async () => {
    const w = mounted(); await flushPromises();
    await byText(w, 'Return / provide feedback').trigger('click');
    await w.find('[data-testid="feedback-action"]').setValue('feedback');
    expect(w.find('.feedback-form').text()).toContain('no acknowledgement or new signature is required');
    await w.find('[data-testid="feedback-message"]').setValue('Clear description of client response.');
    await w.find('.feedback-form').trigger('submit'); await flushPromises();
    expect(w.emitted('returned')[0][0].action).toBe('feedback'); w.unmount();
  });

  it('records a reasoned signed service amendment then reloads before cosigning', async () => {
    const w = mounted(); await flushPromises();
    await byText(w, 'Service amendment').trigger('click'); await flushPromises();
    await w.find('[data-testid="duration"]').setValue('50');
    await w.find('[data-testid="end"]').setValue('10:50');
    await w.find('[data-testid="correction-reason"]').setValue('Verified against the encounter record.');
    await w.find('[data-testid="correction-attestation"]').setValue(true);
    await w.find('.amendment-form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/service-details', { agencyId: 2, contentHash: 'reviewed-current-version', reviewSnapshotToken: 'metadata-version', reason: 'Verified against the encounter record.', attested: true, serviceDetails: { durationMinutes: 50, locationLabel: 'Office', startTime: '10:00', endTime: '10:50', placeOfService: '11', serviceLocationId: 5 } });
    expect(api.get.mock.calls.filter(([url]) => url.includes('document-reviews'))).toHaveLength(2);
    expect(w.find('[data-testid="supervisor-attestation"]').element.checked).toBe(false);
    expect(w.text()).toContain('Amendment signed'); w.unmount();
  });

  it('requires an active mapped location and derives its POS instead of keeping the old address', async () => {
    const originalGet = api.get.getMockImplementation();
    api.get.mockImplementation((url, config) => url.includes('service-locations') ? Promise.resolve({ data: { items: [{ id: 5, name: 'Inactive office', place_of_service: '11', is_active: 0 }, { id: 6, name: 'DEMO QA School', place_of_service: '03', street_address: '100 Example Street', is_active: 1 }] } }) : originalGet(url, config));
    const w = mounted(); await flushPromises();
    await byText(w, 'Service amendment').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="location"]').element.value).toBe('');
    expect(w.find('[data-testid="location"]').text()).not.toContain('Inactive office');
    await w.find('[data-testid="correction-reason"]').setValue('Verified school encounter address.');
    await w.find('[data-testid="correction-attestation"]').setValue(true);
    expect(byText(w, 'Sign amendment').element.disabled).toBe(true);
    await w.find('[data-testid="location"]').setValue('6');
    expect(w.find('[data-testid="pos"]').element.value).toBe('03');
    expect(w.find('.amendment-form').text()).toContain('100 Example Street');
    expect(w.find('[data-testid="correction-attestation"]').element.checked).toBe(false);
    await w.find('[data-testid="correction-attestation"]').setValue(true);
    await w.find('.amendment-form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/service-details', expect.objectContaining({ serviceDetails: expect.objectContaining({ serviceLocationId: 6, locationLabel: 'DEMO QA School', placeOfService: '03' }) }));
    w.unmount();
  });

  it('cannot approve the old saved details while a service amendment is open', async () => {
    const w = mounted(); await flushPromises();
    await w.find('[data-testid="supervisor-attestation"]').setValue(true);
    await byText(w, 'Service amendment').trigger('click'); await flushPromises();
    await w.find('[data-testid="duration"]').setValue('50');
    expect(w.find('[data-testid="supervisor-attestation"]').element.checked).toBe(false);
    expect(w.find('[data-testid="supervisor-attestation"]').element.disabled).toBe(true);
    expect(w.find('[data-testid="cosign"]').element.disabled).toBe(true);
    expect(w.find('.review-footer').text()).toContain('Sign or cancel the service amendment');
    await w.find('[data-testid="cosign"]').trigger('click'); await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    await byText(w, 'Cancel amendment').trigger('click');
    expect(w.find('[data-testid="supervisor-attestation"]').element.disabled).toBe(false);
    expect(w.find('[data-testid="supervisor-attestation"]').element.checked).toBe(false); w.unmount();
  });

  it('requires sending or cancelling an unsent request before a fresh approval', async () => {
    const w = mounted(); await flushPromises();
    await w.find('[data-testid="supervisor-attestation"]').setValue(true);
    await byText(w, 'Return / provide feedback').trigger('click');
    await w.find('[data-testid="feedback-message"]').setValue('Clarify the service duration.');
    expect(w.find('[data-testid="supervisor-attestation"]').element.disabled).toBe(true);
    expect(w.find('[data-testid="supervisor-attestation"]').element.checked).toBe(false);
    expect(w.find('.review-footer').text()).toContain('Send or cancel your request');
    await byText(w, 'Cancel').trigger('click');
    expect(w.find('[data-testid="supervisor-attestation"]').element.disabled).toBe(false);
    expect(w.find('[data-testid="cosign"]').element.disabled).toBe(true); w.unmount();
  });

  it('does not present dismissed feedback as an open supervisor request', async () => {
    api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? review() : { note: { ...note(), reviewRequests: [{ id: 9, action: 'feedback', message: 'Previously read feedback', dismissedAt: '2026-11-03T01:00:00Z' }] } } }));
    const w = mounted(); await flushPromises();
    expect(w.find('.request-history').exists()).toBe(false); expect(w.text()).not.toContain('Previously read feedback'); w.unmount();
  });

  it('lists supporting materials with a read-only request', async () => {
    const w = mounted(); await flushPromises(); await byText(w, 'Supporting materials').trigger('click'); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/clinical-data/sessions/100/artifacts', { params: { includeDeleted: 'false' } });
    expect(w.find('[aria-label="Supporting materials"]').text()).toContain('Recorded screener');
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });

  it('does not show a late note response after the reviewer selects another note', async () => {
    let resolveFirst;
    api.get.mockImplementation(url => url.endsWith('/notes/71') ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve({ data: url.includes('document-reviews') ? review() : { note: { ...note(), id: 72, clientName: 'DEMO QA Next' } } }));
    const w = mounted(); await w.setProps({ noteId: 72 }); await flushPromises();
    resolveFirst({ data: { note: note() } }); await flushPromises();
    expect(w.find('h2').text()).toBe('DEMO QA Next'); expect(w.text()).toContain('Note #72'); w.unmount();
  });

  it('does not offer approval when the server says the current user cannot attest', async () => {
    api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? { ...review(), canCosign: false } : { note: note() } }));
    const w = mounted(); await flushPromises(); expect(w.find('[data-testid="cosign"]').exists()).toBe(false); expect(w.text()).toContain('Only the assigned responsible supervisor'); w.unmount();
  });

  it('permits clinical approval of nonbillable documents without inventing encounter details', async () => {
    api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? review() : { note: { ...note(), isBillable: false, startTime: '', endTime: '', durationMinutes: null, locationLabel: '' } } }));
    const w = mounted(); await flushPromises();
    expect(w.find('.missing-details').exists()).toBe(false);
    expect(byText(w, 'Service amendment')).toBeUndefined();
    expect(w.find('[data-testid="supervisor-attestation"]').element.disabled).toBe(false);
    await w.find('[data-testid="supervisor-attestation"]').setValue(true);
    expect(w.find('[data-testid="cosign"]').text()).toBe('Cosign & approve documentation');
    expect(w.find('[data-testid="cosign"]').element.disabled).toBe(false); w.unmount();
  });

  it('reloads once when note metadata changes between note fetch and authoritative review', async () => {
    let notes = 0;
    api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? { ...review(), reviewSnapshotToken: 'new-metadata' } : { note: { ...note(), reviewSnapshotToken: ++notes === 1 ? 'old-metadata' : 'new-metadata' } } }));
    const w = mounted(); await flushPromises();
    expect(notes).toBe(2); expect(w.find('[data-testid="supervisor-attestation"]').exists()).toBe(true); expect(w.find('[role="alert"]').exists()).toBe(false); w.unmount();
  });

  it('blocks review after repeated metadata mismatches instead of signing an inconsistent snapshot', async () => {
    api.get.mockImplementation(async url => ({ data: url.includes('document-reviews') ? { ...review(), reviewSnapshotToken: 'new-metadata' } : { note: note() } }));
    const w = mounted(); await flushPromises();
    expect(api.get.mock.calls.filter(([url]) => url.includes('document-reviews'))).toHaveLength(2);
    expect(w.find('[role="alert"]').text()).toContain('details changed while opening');
    expect(w.find('[data-testid="cosign"]').exists()).toBe(false); w.unmount();
  });
});
