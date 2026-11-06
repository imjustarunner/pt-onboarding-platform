import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClinicalNoteSupervisorReview from '../ClinicalNoteSupervisorReview.vue';
import api from '../../../services/api.js';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const note = () => ({ id: 71, agencyId: 2, reviewSnapshotToken: 'metadata-version', clientName: 'DEMO QA Client', providerSignedAt: '2026-11-02T16:00:00Z', providerSignedByUserId: 9, providerSigner: { id: 9, name: 'DEMO QA Author', credentials: 'LSW' }, dateOfService: '2026-11-01', serviceCode: 'H0002', durationMinutes: 45, locationLabel: 'Office', startTime: '10:00', endTime: '10:45', placeOfService: '11', serviceLocationId: 5, clinicalSessionId: 100, structuredChart: { participants: 'Client only', patientPresent:true, mentalStatusExam: { domains: { Appearance: { status: 'normal' }, Mood: { status: 'abnormal', detail: 'Anxious' } } }, medications: { noneCurrently: true } }, outputJson: { sections: { Subjective: 'Stale fetched text' } }, objectiveRatings: [{ id: 1, goalIndex: 1, objectiveIndex: 1, scaleStart: 3, scalePrevious: 4, scaleValue: 5, scaleTarget: 8, objectiveText: 'Use a grounding strategy', disposition: 'rated' }] });
const review = () => ({ reviewSnapshotToken: 'metadata-version', contentHash: 'reviewed-current-version', canCosign: true, content: JSON.stringify({ note: { sections: { Subjective: 'Current signed narrative', Objective: '', Plan: 'Practice the agreed strategy.' } }, addenda: [{ id: 4, body: 'A signed correction', entry_kind: 'correction', entry_reason: 'Clarification', created_by_user_id: 3 }] }) });
const versionStub = { name: 'ClinicalNoteVersionHistory', emits: ['loaded', 'changed', 'editing'], template: '<section>Immutable version history</section>', mounted() { this.$emit('loaded', { pendingRevisionId: null }); } };
const mounted = () => mount(ClinicalNoteSupervisorReview, { props: { noteId: 71, agencyId: 2 }, global: { stubs: { CosignReviewTimer: true, ClinicalNoteVersionHistory: versionStub } } });
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
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/cosign', { agencyId: 2, contentHash: 'reviewed-current-version', reviewSnapshotToken: 'metadata-version', reviewedAndApproved: true }, {skipGlobalLoading:true});
    expect(w.emitted('signed')).toHaveLength(1); w.unmount();
  });

  it('requires passing server evidence and an explicit attestation for Quick Sign', async () => {
    const originalGet=api.get.getMockImplementation();
    api.get.mockImplementation(async (url,config)=>url.includes('/medical-billing/notes/') ? {data:{note:{...note(),narrivaReview:{id:29,status:'passed',quickSignEligible:true,checks:[]}}}} : originalGet(url,config));
    const w=mounted();await flushPromises();
    expect(w.get('[data-testid="quick-sign"]').element.disabled).toBe(true);
    await w.get('[data-testid="supervisor-attestation"]').setValue(true);
    await w.get('[data-testid="quick-sign"]').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/cosign',expect.objectContaining({quickSign:true,narrivaReviewId:29,contentHash:'reviewed-current-version',reviewSnapshotToken:'metadata-version',reviewedAndApproved:true}),{skipGlobalLoading:true});
    expect(w.emitted('signed')).toHaveLength(1);w.unmount();
  });

  it('hides Quick Sign after bypass and discards evidence when the version changes', async () => {
    const originalGet=api.get.getMockImplementation();
    api.get.mockImplementation(async (url,config)=>url.includes('/medical-billing/notes/') ? {data:{note:{...note(),narrivaReview:{id:29,status:'bypassed',quickSignEligible:false,checks:[]}}}} : originalGet(url,config));
    const w=mounted();await flushPromises();
    expect(w.find('[data-testid="quick-sign"]').exists()).toBe(false);
    w.findComponent({name:'ClinicalNoteVersionHistory'}).vm.$emit('changed',{action:'edit',revision:{id:13,status:'draft'}});await flushPromises();
    expect(w.find('.narriva-compliance').exists()).toBe(false);w.unmount();
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
  it('binds original supervisor approval to the attached-entry manifest from the reviewed snapshot',async()=>{
    const get=api.get.getMockImplementation();api.get.mockImplementation((url,config)=>url.includes('document-reviews')?Promise.resolve({data:{...review(),revisionSummary:{effectiveRevision:{entryManifestHash:'DEMO-QA-reviewed-entry-manifest'}}}}):get(url,config));
    const w=mounted();await flushPromises();await w.get('[data-testid="supervisor-attestation"]').setValue(true);await w.get('[data-testid="cosign"]').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/cosign',expect.objectContaining({expectedEntryManifestHash:'DEMO-QA-reviewed-entry-manifest'}),{skipGlobalLoading:true});w.unmount();
  });

  it('returns changes needed with an explicit message and exact review hash', async () => {
    api.post.mockResolvedValue({ data: { ok: true, reviewRequest: { id: 8, action: 'changes_needed', message: 'Please clarify the intervention.' } } });
    const w = mounted(); await flushPromises();
    await byText(w, 'Return / provide feedback').trigger('click');
    await w.find('[data-testid="feedback-message"]').setValue('Please clarify the intervention.');
    await w.find('.feedback-form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/supervisor-review', { agencyId: 2, contentHash: 'reviewed-current-version', reviewSnapshotToken: 'metadata-version', action: 'changes_needed', message: 'Please clarify the intervention.' }, {skipGlobalLoading:true});
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

  it('completes a supervisor amendment from the immutable editor with the existing queue signed event', async () => {
    const w = mounted(); await flushPromises();
    const history = w.findComponent({ name: 'ClinicalNoteVersionHistory' });
    history.vm.$emit('changed', { noteId: 71, agencyId: 2, action: 'cosign', revision: { id: 11, origin: 'supervisor', status: 'approved' } }); await flushPromises();
    expect(w.emitted('signed')[0][0]).toMatchObject({ noteId: 71, action: 'cosign', revision: { status: 'approved' } });
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });

  it('does not approve the old saved version while a linked amendment is pending or being edited', async () => {
    const w = mounted(); await flushPromises();
    await w.get('[data-testid="supervisor-attestation"]').setValue(true);
    const history = w.findComponent({ name: 'ClinicalNoteVersionHistory' });
    history.vm.$emit('editing', true); await flushPromises();
    expect(w.find('.review-footer').exists()).toBe(false);
    expect(w.find('[data-testid="cosign"]').exists()).toBe(false);
    history.vm.$emit('loaded', { pendingRevisionId: 11 }); await flushPromises();
    expect(w.find('[data-testid="cosign"]').exists()).toBe(false);
    expect(w.find('.review-footer').exists()).toBe(false); w.unmount();
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
    expect(api.get).toHaveBeenCalledWith('/clinical-data/sessions/100/artifacts', { params: { includeDeleted: 'false' }, skipGlobalLoading: true });
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

describe('stable supervisor interaction and pending amendment revisions',()=>{
 it('keeps the checkbox and note loaded through harmless parent prop refreshes',async()=>{
  const w=mounted();await flushPromises();
  await w.get('[data-testid="supervisor-attestation"]').setValue(true);
  const calls=api.get.mock.calls.length;
  await w.setProps({noteId:'71',agencyId:'2',providerId:9,clientName:'DEMO QA updated label'});await flushPromises();
  expect(api.get.mock.calls).toHaveLength(calls);
  expect(w.get('[data-testid="supervisor-attestation"]').element.checked).toBe(true);
  expect(w.get('[data-testid="cosign"]').element.disabled).toBe(false);
  w.unmount();
 });
 it('preserves historical pending service details and routes signing through immutable versions',async()=>{
  const original=api.get.getMockImplementation();
  const pending={durationMinutes:10,startTime:'10:00',endTime:'10:10',locationLabel:'DEMO QA virtual setting',placeOfService:'10',serviceLocationId:null,participants:'Guardian: DEMO QA',patientPresent:false};
  api.get.mockImplementation(async(url,config)=>url.includes('/notes/')?{data:{note:{...note(),pendingServiceDetails:pending}}}:original(url,config));
  const w=mounted();await flushPromises();
  expect(w.text()).toContain('DEMO QA virtual setting');
  expect(w.text()).toContain('historical service amendment');
  expect(byText(w,'Service amendment')).toBeUndefined();
  expect(w.find('.amendment-form').exists()).toBe(false);w.unmount();
 });
});
