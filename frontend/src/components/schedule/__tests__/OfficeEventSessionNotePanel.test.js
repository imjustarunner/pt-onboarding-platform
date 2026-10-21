import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import Panel from '../OfficeEventSessionNotePanel.vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), push: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: mocks }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }), useRoute: () => ({ params: { organizationSlug: 'itsco' } }) }));
vi.mock('../../clinicalWorkspace/ClinicalWorkspaceFrame.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('../../clinical/NoteAidObjectiveRatings.vue', () => ({ default: { template: '<div />' } }));
const wrappers = [];
async function open(props = {}) {
  const wrapper = shallowMount(Panel, { props: { agencyId: 2, clientId: 17, clinicalSessionId: 101, officeEventId: 201, dateOfService: '2026-10-21', serviceCode: '90837', practiceCategory: 'mental_health', ...props }, global: { renderStubDefaultSlot: true } });
  wrappers.push(wrapper); await flushPromises(); return wrapper;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: { drafts: [], ratings: [] } });
  mocks.post.mockImplementation(async path => path === '/clinical-notes/drafts' ? { data: { draft: { id: 55 } } } : { data: {} });
  mocks.patch.mockResolvedValue({ data: {} }); mocks.push.mockResolvedValue(undefined);
});
afterEach(async () => { wrappers.splice(0).forEach(w => w.unmount()); await flushPromises(); vi.useRealTimers(); });
describe('scheduled quick notes and Note Workspace handoff', () => {
  it('does not create a draft or confirm attendance just by opening', async () => {
    const w = await open(); await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.post).not.toHaveBeenCalled(); expect(w.text()).toContain('Opening this panel alone does not confirm attendance');
  });
  it('autosaves authored source text with exact session context and opens that draft in the tenant workspace', async () => {
    const w = await open(); await w.find('textarea').setValue('Client practiced coping skills and described progress.'); await vi.advanceTimersByTimeAsync(700);
    expect(mocks.post).toHaveBeenCalledWith('/clinical-notes/drafts', expect.objectContaining({ agencyId: 2, clientId: 17, clinicalSessionId: 101, officeEventId: 201, inputText: 'Client practiced coping skills and described progress.', attendanceIntent: 'authored_session_draft', outputJson: { meta: { quickNote: true } } }), expect.anything());
    await w.find('.oesn-open-aid').trigger('click'); await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ path: '/itsco/note-aid', query: expect.objectContaining({ draftId: '55', agencyId: '2', clientId: '17', clinicalSessionId: '101', officeEventId: '201', launchIntent: 'progress_note' }) });
    expect(mocks.post.mock.calls.filter(c => c[0] === '/clinical-notes/drafts')).toHaveLength(1);
  });
  it('does not reuse a different appointment on the same day or another client draft', async () => {
    mocks.get.mockResolvedValue({ data: { drafts: [
      { id: 91, client_id: 17, clinical_session_id: 99, office_event_id: 199, date_of_service: '2026-10-21', input_text: 'wrong session' },
      { id: 92, client_id: 88, clinical_session_id: 101, office_event_id: 201, input_text: 'wrong client' }
    ] } });
    const w = await open(); expect(w.find('textarea').element.value).toBe('');
    await w.find('.oesn-open-aid').trigger('click'); await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/clinical-notes/drafts', expect.not.objectContaining({ attendanceIntent: expect.anything() }), expect.anything());
  });
  it('loads an existing draft without re-saving or confirming attendance', async () => {
    mocks.get.mockResolvedValue({ data: { drafts: [{ id: 91, client_id: 17, clinical_session_id: 101, input_text: 'Existing source text' }] } });
    const w = await open(); expect(w.find('.oesn-redacted').exists()).toBe(true); await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.post.mock.calls.filter(c => c[0] === '/clinical-notes/drafts')).toHaveLength(0); expect(mocks.patch).not.toHaveBeenCalled();
    await w.find('.oesn-open-aid').trigger('click'); await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ draftId: '91' }) }));
  });
  it('flushes pending input to the old session before switching without mixing clients', async () => {
    const w = await open(); await w.find('textarea').setValue('Session one draft'); await w.setProps({ clinicalSessionId: 102, officeEventId: 202, clientId: 18 }); await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/clinical-notes/drafts', expect.objectContaining({ clinicalSessionId: 101, clientId: 17, inputText: 'Session one draft' }), expect.anything());
    expect(w.find('textarea').element.value).toBe(''); await w.find('textarea').setValue('Session two draft'); await vi.advanceTimersByTimeAsync(700);
    expect(mocks.post).toHaveBeenCalledWith('/clinical-notes/drafts', expect.objectContaining({ clinicalSessionId: 102, clientId: 18, inputText: 'Session two draft' }), expect.anything());
  });
  it('keeps the draft visible and does not navigate when saving fails', async () => {
    const w = await open(); mocks.post.mockRejectedValue(new Error('Offline')); await w.find('textarea').setValue('Keep this unsaved note');
    await w.find('.oesn-open-aid').trigger('click'); await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled(); expect(w.find('textarea').element.value).toBe('Keep this unsaved note'); expect(w.find('.oesn-error').exists()).toBe(true);
  });
  it('serializes a pending autosave and navigation so only one draft is created', async () => {
    let resolve; mocks.post.mockImplementation(path => path === '/clinical-notes/drafts' ? new Promise(r => { resolve = r; }) : Promise.resolve({ data: {} }));
    const w = await open(); await w.find('textarea').setValue('Concurrent save source'); await vi.advanceTimersByTimeAsync(700); await w.find('.oesn-open-aid').trigger('click');
    resolve({ data: { draft: { id: 76 } } }); await flushPromises();
    expect(mocks.post.mock.calls.filter(c => c[0] === '/clinical-notes/drafts')).toHaveLength(1);
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ draftId: '76' }) }));
  });
  it('preserves generated note sections while editing the source used for generation', async () => {
    const output = { sections: { Assessment: 'Reviewed assessment' }, meta: { toolId: 'clinical_psychotherapy_note' } };
    mocks.get.mockResolvedValue({ data: { drafts: [{ id: 91, client_id: 17, clinical_session_id: 101, input_text: 'Existing source text', output_json: JSON.stringify(output) }] } });
    const w = await open();
    // The adjacent clinical tab shares this model even while the note panel is redacted.
    await w.setProps({ inputText: 'Updated session source' });
    await vi.advanceTimersByTimeAsync(700);
    expect(mocks.patch).toHaveBeenCalledWith('/clinical-notes/drafts/91', expect.objectContaining({ inputText: 'Updated session source', outputJson: { ...output, meta: { ...output.meta, quickNote: true } }, attendanceIntent: 'authored_session_draft' }), expect.anything());
  });
  it('passes the same saved source and linked session to generation', async () => {
    const w = await open(); await w.find('textarea').setValue('Session details for the draft');
    await w.find('.oesn-generate').trigger('click'); await flushPromises();
    const request = mocks.post.mock.calls.find(c => c[0] === '/clinical-notes/generate');
    expect(request[1].get('inputText')).toBe('Session details for the draft');
    expect(request[1].get('draftId')).toBe('55');
    expect(request[1].get('clinicalSessionId')).toBe('101');
    expect(request[1].get('clientId')).toBe('17');
  });
  it('allows the schedule to await the pending save and keeps it open on failure', async () => {
    const w = await open(); await w.find('textarea').setValue('Do not discard on close');
    mocks.post.mockRejectedValue(new Error('Offline'));
    await expect(w.vm.savePendingDraft()).rejects.toThrow('Offline');
    expect(w.find('textarea').element.value).toBe('Do not discard on close');
  });
  it('does not overwrite new-session input with a late old-session response', async () => {
    let resolveOld;
    mocks.get.mockImplementation((path, options) => path === '/clinical-notes/recent' && options.params.clientIds === 17
      ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ data: { drafts: [], ratings: [] } }));
    const w = await open(); await w.setProps({ clinicalSessionId: 102, officeEventId: 202, clientId: 18 }); await flushPromises();
    await w.find('textarea').setValue('Second client note');
    resolveOld({ data: { drafts: [{ id: 91, client_id: 17, clinical_session_id: 101, input_text: 'First client source' }] } }); await flushPromises();
    expect(w.find('textarea').element.value).toBe('Second client note');
  });

  it.each([
    [{ needsReview: true, message: 'Confirm attendance after the scheduled session has ended.' }, 'Confirm attendance after the scheduled session has ended.'],
    [{ collection: { needsReview: true, reason: 'late_attendance' } }, 'held for billing review instead of charging on a different day']
  ])('shows a saved draft separately from attendance or collection needing review', async (attendance, message) => {
    const w = await open();
    mocks.post.mockResolvedValue({ data: { draft: { id: 55 }, attendance } });
    await w.find('textarea').setValue('Saved clinical session details');
    await vi.advanceTimersByTimeAsync(700);
    expect(w.text()).toContain('Draft saved.');
    expect(w.text()).toContain(message);
    expect(w.find('textarea').element.value).toBe('Saved clinical session details');
  });

});
