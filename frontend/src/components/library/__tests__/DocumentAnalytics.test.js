import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import Panel from '../DocumentAnalyticsPanel.vue';
import { useDocumentAnalytics } from '../../../composables/useDocumentAnalytics';
const report = { summary: { opens: 3, readers: 2, activeSeconds: 75, questions: 1 }, documents: [{ documentKey: 'provider-guide', title: 'Provider’s Guide', opens: 3 }], people: [{ userId: 8, name: 'Sample Reader', opens: 2 }], questions: [{ name: 'Sample Reader', question: '<script>untrusted</script>', status: 'answered' }], activity: [], sections: [], links: [], surfaces: [], hasMore: {}, limitations: ['Time does not prove understanding.'], range: {}, collectionStartedAt: null };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('document analytics interface', () => {
  it('shows real report fields, escaped questions, and reader drilldown', async () => {
    const http = { get: vi.fn().mockResolvedValue({ data: report }) };
    const w = mount(Panel, { props: { agencyId: 2, http } }); await flushPromises();
    expect(w.text()).toContain('1m 15s');
    await w.findAll('nav button').find(b => b.text() === 'AI questions').trigger('click'); await flushPromises();
    expect(w.text()).toContain('<script>untrusted</script>'); expect(w.find('script').exists()).toBe(false);
    await w.findAll('nav button').find(b => b.text() === 'Readers').trigger('click'); await flushPromises();
    await w.findAll('button').find(b => b.text() === 'View activity').trigger('click'); await flushPromises();
    expect(http.get).toHaveBeenLastCalledWith('/document-analytics/report', expect.objectContaining({ params: expect.objectContaining({ agencyId: 2, userId: 8 }) })); w.unmount();
  });
  it('clears company data on access errors and ignores stale responses', async () => {
    let old; const http = { get: vi.fn().mockImplementationOnce(() => new Promise(resolve => { old = resolve; })).mockRejectedValue({ response: { data: { error: { message: 'Access denied' } } } }) };
    const w = mount(Panel, { props: { agencyId: 2, http } }); await w.setProps({ agencyId: 3 }); await flushPromises(); old({ data: report }); await flushPromises();
    expect(w.text()).toContain('Access denied'); expect(w.text()).not.toContain('Sample Reader'); expect(w.find('table').exists()).toBe(false); w.unmount();
  });
});
describe('reading telemetry', () => {
  it('pauses hidden/idle reading, tracks sections, and cleans up timers', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 500, top: 0, bottom: 500 });
    const http = { post: vi.fn().mockResolvedValue({ data: {} }) }; let analytics;
    const Host = defineComponent({ setup() { const root = ref(null); analytics = useDocumentAnalytics(() => ({ agencyId: 2, documentKey: 'provider-guide', versionId: 12 }), { http, root }); return { root }; }, template: '<div ref="root"><a href="/library?companyDocument=provider-guide">Guide</a></div>' });
    const w = mount(Host, { attachTo: document.body }); await flushPromises();
    analytics.section('welcome'); await flushPromises();
    expect(http.post.mock.calls.some(([, body]) => body.type === 'section' && body.sectionSlug === 'welcome')).toBe(true);
    await w.get('a').trigger('click'); await flushPromises(); expect(http.post.mock.calls.some(([, body]) => body.type === 'link')).toBe(true);
    vi.advanceTimersByTime(15000); await flushPromises();
    expect(http.post.mock.calls.filter(([, b]) => b.type === 'heartbeat').at(-1)[1].active).toBe(true);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 500, top: 10000, bottom: 10500 });
    vi.advanceTimersByTime(15000); await flushPromises();
    expect(http.post.mock.calls.filter(([, b]) => b.type === 'heartbeat').at(-1)[1].active).toBe(false);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 500, top: 0, bottom: 500 });
    vi.advanceTimersByTime(31000); await flushPromises();
    expect(http.post.mock.calls.filter(([, b]) => b.type === 'heartbeat').at(-1)[1].active).toBe(false);
    w.unmount(); await flushPromises(); const count = http.post.mock.calls.length; vi.advanceTimersByTime(30000); await flushPromises(); expect(http.post).toHaveBeenCalledTimes(count);
  });
  it('does not track unpublished previews', async () => {
    const http = { post: vi.fn() };
    const w = mount(defineComponent({ setup() { useDocumentAnalytics(() => ({ agencyId: 2, documentKey: 'provider-guide', versionId: 12, enabled: false }), { http }); return {}; }, template: '<div />' }));
    await flushPromises(); expect(http.post).not.toHaveBeenCalled(); w.unmount();
  });
});
