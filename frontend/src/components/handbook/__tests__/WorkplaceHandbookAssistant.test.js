import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Assistant from '../WorkplaceHandbookAssistant.vue';
import Book from '../WorkplaceHandbookBook.vue';
import Reader from '../WorkplaceHandbookReader.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from '../../../services/api';
const response = { status: 'answered', version: { id: 5, number: 2 }, paragraphs: [{ text: 'The allowance is 12 minutes per direct service hour.', citations: [{ slug: 'indirect-time', title: 'Indirect time', path: 'Compensation → Indirect time', quote: 'Twelve minutes are included for each direct service hour.' }] }] };
const handbook = { version: { id: 5, version_number: 2 }, sections: [{ slug: 'welcome', title: 'Welcome', content_status: 'ready', body_html: '<p>Welcome.</p>' }, { slug: 'indirect-time', title: 'Indirect time', content_status: 'ready', body_html: '<p>Twelve minutes are included for each direct service hour.</p>' }] };
async function ask(w, question = 'How does indirect time work?') { await w.get('textarea').setValue(question); await w.get('form').trigger('submit'); await flushPromises(); }
describe('handbook Q&A', () => {
  it('answers with expandable evidence and links to the exact handbook section', async () => {
    const callback = vi.fn().mockResolvedValue(response);
    const w = mount(Book, { props: { handbook, answerQuestion: callback } });
    await w.vm.showAssistant();
    const assistant = w.getComponent(Assistant);
    expect(w.get('.handbook-assistant').element.open).toBe(true);
    await ask(assistant);
    expect(callback).toHaveBeenCalledWith({ question: 'How does indirect time work?', history: [], expectedVersionId: 5 }, { signal: expect.any(AbortSignal) });
    expect(w.get('.handbook-answer').text()).toContain('12 minutes');
    expect(w.get('.answer-source blockquote').text()).toContain('Twelve minutes');
    await w.get('.answer-policy-links a').trigger('click');
    expect(w.get('.book-page').attributes('id')).toBe('handbook-indirect-time');
    w.unmount();
  });
  it('passes previous questions, never previous model answers, with a follow-up', async () => {
    const callback = vi.fn().mockResolvedValue(response);
    const w = mount(Assistant, { props: { ask: callback, version: handbook.version } });
    await ask(w); await ask(w, 'What if extra work is required?');
    expect(callback.mock.calls[1][0]).toEqual({ question: 'What if extra work is required?', history: ['How does indirect time work?'], expectedVersionId: 5 });
    expect(w.findAll('.assistant-turn')).toHaveLength(2); w.unmount();
  });
  it('renders model output as plain text without running HTML', async () => {
    const callback = vi.fn().mockResolvedValue({ ...response, paragraphs: [{ ...response.paragraphs[0], text: '<img src=x onerror=steal()> Unsafe markup stays text.' }] });
    const w = mount(Assistant, { props: { ask: callback } });
    await ask(w); expect(w.find('.handbook-answer img').exists()).toBe(false); expect(w.text()).toContain('<img src=x'); w.unmount();
  });
  it('asks for missing context without presenting an invented answer', async () => {
    const w = mount(Assistant, { props: { ask: vi.fn().mockResolvedValue({ status: 'clarification', paragraphs: [], clarification: 'Which role applies to you?' }) } });
    await ask(w); expect(w.get('.clarifying-question').text()).toContain('Which role'); expect(w.find('.answer-policy-links').exists()).toBe(false); w.unmount();
  });
  it('displays unavailable answers without inventing a response and permits retry', async () => {
    const callback = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response);
    const w = mount(Assistant, { props: { ask: callback } });
    await ask(w); expect(w.find('.handbook-answer').exists()).toBe(false); expect(w.get('[role=alert]').text()).toContain('temporarily unavailable');
    await w.get('.answer-error button').trigger('click'); await flushPromises(); expect(w.findAll('.assistant-turn')).toHaveLength(1); expect(w.get('.handbook-answer').text()).toContain('12 minutes'); w.unmount();
  });
  it('requests a reload when the published version changed', async () => {
    const w = mount(Assistant, { props: { ask: vi.fn().mockRejectedValue({ response: { status: 409, data: { error: { message: 'The handbook changed. Reload it.' } } } }) } });
    await ask(w); await w.get('.answer-error button').trigger('click'); expect(w.emitted('reload')).toHaveLength(1); w.unmount();
  });
  it('cancels and ignores an old response after clearing the conversation', async () => {
    let resolve;
    const callback = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; }));
    const w = mount(Assistant, { props: { ask: callback } });
    await ask(w); await w.get('.conversation-actions button').trigger('click');
    expect(callback.mock.calls[0][1].signal.aborted).toBe(true); resolve(response); await flushPromises(); expect(w.find('.assistant-turn').exists()).toBe(false); w.unmount();
  });
  it('clears the conversation when the displayed version changes', async () => {
    const w = mount(Assistant, { props: { ask: vi.fn().mockResolvedValue(response), version: handbook.version } });
    await ask(w); await w.setProps({ version: { id: 6 } }); expect(w.find('.assistant-turn').exists()).toBe(false); w.unmount();
  });
  it('routes employee invitation questions only through the recipient endpoint', async () => {
    api.get.mockResolvedValue({ data: { handbook, entries: [] } }); api.post.mockResolvedValue({ data: response });
    const w = mount(Reader, { props: { accessMode: 'token', token: 'example/token', agencyId: 99 } });
    await flushPromises(); await w.findAll('.reader-tabs button').find(b => b.text().includes('Ask the handbook')).trigger('click');
    await ask(w.getComponent(Assistant));
    expect(api.post).toHaveBeenCalledWith('/public/provider-update/example%2Ftoken/handbook/answer', { question: 'How does indirect time work?', history: [], expectedVersionId: 5 }, expect.objectContaining({ timeout: 240000 }));
    w.unmount();
  });
});
