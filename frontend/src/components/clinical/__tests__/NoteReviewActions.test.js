import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import NoteReviewActions from '../NoteReviewActions.vue';
let wrapper;
const item = { clinicalNoteId: 81, agencyId: 7, narriva: { quickSignEligible: true } };
const payload = (id = 81, text = 'Reviewed a practiced coping skill.') => ({ data: { insights: { noteId: id, sourceRevision: { id: 12 }, quickLook: { sections: [{ key: 'interventions', label: 'Interventions', text }], artifacts: [{ id: 2, title: 'Session worksheet', type: 'worksheet' }] }, treatmentHistory: { status: 'available', sessions: [] } } } });
const start = (props = {}) => { wrapper = mount(NoteReviewActions, { props: { item, loadInsights: vi.fn().mockResolvedValue(payload()), ...props }, attachTo: document.body }); return wrapper; };
beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('My Work note review actions', () => {
  it('does not fetch or disclose note content until an explicit preview interaction', async () => {
    const loader = vi.fn().mockResolvedValue(payload()); start({ loadInsights: loader }); await flushPromises();
    expect(loader).not.toHaveBeenCalled(); expect(document.querySelector('[role="dialog"]')).toBeNull();
    await wrapper.get('.nra-summary').trigger('click'); await flushPromises();
    expect(loader).toHaveBeenCalledExactlyOnceWith({ noteId: 81, agencyId: 7 });
    expect(document.body.textContent).toContain('Reviewed a practiced coping skill.');
    expect(document.body.textContent).toContain('Session worksheet');
    expect(document.body.textContent).toContain('Saved revision 12');
  });
  it('provides focus and tap access and Escape returns focus without reopening the preview', async () => {
    start(); wrapper.get('.nra-summary').element.focus(); await flushPromises();
    expect(document.querySelector('[aria-label="Session quick look"]')).not.toBeNull();
    await wrapper.get('.nra-summary').trigger('click'); await flushPromises();
    expect(document.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(wrapper.get('.nra-summary').element);
  });
  it('supports a delayed mouse hover and dismisses when pointer leaves the preview', async () => {
    vi.useFakeTimers(); const loader = vi.fn().mockResolvedValue(payload()); start({ loadInsights: loader });
    await wrapper.get('.nra-summary').trigger('pointerenter', { pointerType: 'mouse' });
    expect(loader).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(181); await flushPromises();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await wrapper.get('.nra-summary').trigger('pointerleave'); await vi.advanceTimersByTimeAsync(181); await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('discards a previous client or device response and reauthorizes on the next opening', async () => {
    let resolveOld; const loader = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(payload(82, 'Current note content'));
    start({ loadInsights: loader, accessKey: 'device-a' }); await wrapper.get('.nra-summary').trigger('click');
    await wrapper.setProps({ item: { clinicalNoteId: 82, agencyId: 8 }, accessKey: 'device-b' });
    resolveOld(payload(81, 'OLD CLIENT CANARY')); await flushPromises();
    expect(document.body.textContent).not.toContain('OLD CLIENT CANARY');
    await wrapper.get('.nra-summary').trigger('click'); await flushPromises();
    expect(document.body.textContent).toContain('Current note content');
    expect(loader).toHaveBeenLastCalledWith({ noteId: 82, agencyId: 8 });
  });
  it('does not retain an old preview across closing, and rejects an unexpected note response', async () => {
    const loader = vi.fn().mockResolvedValueOnce(payload()).mockResolvedValueOnce(payload(99, 'WRONG NOTE CANARY'));
    start({ loadInsights: loader }); await wrapper.get('.nra-summary').trigger('click'); await flushPromises();
    document.querySelector('[aria-label="Close review details"]').click(); await flushPromises();
    await wrapper.get('.nra-summary').trigger('click'); await flushPromises();
    expect(loader).toHaveBeenCalledTimes(2); expect(document.body.textContent).not.toContain('WRONG NOTE CANARY');
    expect(document.querySelector('[role="alert"]').textContent).toContain('could not be loaded');
  });
  it('keeps Quick Sign behind server eligibility and routes both actions to the existing review flow', async () => {
    start({ allowQuickSign: true }); await wrapper.get('.nra-quick-sign').trigger('click');
    expect(wrapper.emitted('quick-sign')[0][0]).toEqual(item);
    await wrapper.get('.nra-open').trigger('click'); expect(wrapper.emitted('open-note')[0][0]).toEqual(item);
    await wrapper.setProps({ item: { ...item, clinicalRevisionId: 90 } });
    expect(wrapper.find('.nra-quick-sign').exists()).toBe(false); expect(wrapper.find('.nra-summary').exists()).toBe(false);
    await wrapper.setProps({ item: { ...item, narriva: { quickSignEligible: false } } });
    expect(wrapper.find('.nra-quick-sign').exists()).toBe(false);
  });
  it('does not invent a saved note identifier for a draft or fetch an unavailable workspace', async () => {
    const loader = vi.fn(); start({ item: { id: 81, draftId: 81, agencyId: 7 }, loadInsights: loader });
    expect(wrapper.find('.nra-summary').exists()).toBe(false); expect(wrapper.find('.nra-history').exists()).toBe(false);
    await wrapper.setProps({ item, unavailableReason: 'Open note to view in its agency.' });
    await wrapper.get('.nra-history').trigger('click'); await flushPromises();
    expect(loader).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('Open note to view in its agency.');
  });
  it('rejects an unexpected agency even if the note ID matches', async () => {
    const response = payload(81, 'WRONG AGENCY CANARY'); response.data.insights.agencyId = 99;
    start({ loadInsights: vi.fn().mockResolvedValue(response) }); await wrapper.get('.nra-summary').trigger('click'); await flushPromises();
    expect(document.body.textContent).not.toContain('WRONG AGENCY CANARY'); expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('renders hostile saved text as text rather than markup', async () => {
    start({ loadInsights: vi.fn().mockResolvedValue(payload(81, '<img src=x onerror=alert(1)>')) });
    await wrapper.get('.nra-summary').trigger('click'); await flushPromises();
    expect(document.querySelector('.nra-sections img')).toBeNull(); expect(document.body.textContent).toContain('<img src=x');
  });
});
