import { shallowMount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HireDocumentPreview from '../HireDocumentPreview.vue';

vi.mock('../../documents/PDFPreview.vue', () => ({ default: { name: 'PDFPreview', template: '<div />' } }));
vi.mock('../../documents/PDFDocumentFillEditor.vue', () => ({ default: { name: 'PDFDocumentFillEditor', template: '<div />' } }));

let wrapper;
const pdfResponse = () => ({ data: new Blob(['fixture'], { type: 'application/pdf' }) });
function mountPreview(get, props = {}) {
  wrapper = shallowMount(HireDocumentPreview, { props: { http: { get }, url: '/fixture/preview', ...props } });
  return wrapper;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('hire document preview recovery', () => {
  it('stops waiting for a hung request, cancels it, and permits a fresh retry', async () => {
    let resolveOld;
    const get = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(pdfResponse());
    mountPreview(get);
    const firstSignal = get.mock.calls[0][1].signal;
    await vi.advanceTimersByTimeAsync(90000);
    expect(wrapper.find('[role="alert"]').text()).toContain('taking longer than expected');
    expect(firstSignal.aborted).toBe(true);
    expect(wrapper.emitted('ready').at(-1)).toEqual([false]);
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1].signal.aborted).toBe(false);
    wrapper.findComponent({ name: 'PDFPreview' }).vm.$emit('loaded');
    await flushPromises();
    resolveOld(pdfResponse());
    await flushPromises();
    await vi.advanceTimersByTimeAsync(90000);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('ready').at(-1)).toEqual([true]);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('offers recovery and the full PDF when the browser renderer never becomes ready', async () => {
    mountPreview(vi.fn().mockResolvedValue(pdfResponse()));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(90000);
    expect(wrapper.find('[role="alert"]').text()).toContain('taking longer than expected');
    expect(wrapper.find('a').attributes('href')).toBe('blob:fixture');
    expect(wrapper.emitted('ready').at(-1)).toEqual([false]);
  });

  it.each([false, true])('clears the deadline when the PDF is ready (editable=%s)', async editable => {
    mountPreview(vi.fn().mockResolvedValue(pdfResponse()), { editable });
    await flushPromises();
    wrapper.findComponent({ name: editable ? 'PDFDocumentFillEditor' : 'PDFPreview' }).vm.$emit(editable ? 'ready' : 'loaded', true);
    await vi.advanceTimersByTimeAsync(90000);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('ready').at(-1)).toEqual([true]);
  });

  it('aborts the old request on a document change and ignores its late response', async () => {
    let resolveOld;
    const get = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(pdfResponse());
    mountPreview(get);
    const firstSignal = get.mock.calls[0][1].signal;
    await wrapper.setProps({ url: '/fixture/other-preview' });
    await flushPromises();
    resolveOld(pdfResponse());
    await flushPromises();
    expect(firstSignal.aborted).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work when the preview closes', async () => {
    const get = vi.fn(() => new Promise(() => {}));
    mountPreview(get);
    wrapper.unmount();
    expect(get.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    wrapper = undefined;
  });
});
