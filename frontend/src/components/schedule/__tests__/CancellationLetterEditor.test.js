import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Editor from '../CancellationLetterEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }));
let wrapper;
const props = { baseUrl: '/availability/providers/7/day-cancellation', agencyId: 4, audience: 'client', label: 'Client email', message: { subject: 'Session update', text: 'I am still sick. See you next session!' } };
const button = label => wrapper.findAll('button').find(b => b.text() === label);
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => wrapper?.unmount());
it('replaces a draft with the returned text and uses the item’s actual agency', async () => {
  api.post.mockResolvedValue({ data: { text: 'I’m still unwell and need to cancel today. I look forward to our next session.' } });
  wrapper = mount(Editor, { props }); await button('Warmer').trigger('click'); await flushPromises();
  expect(wrapper.emitted('update:text')).toEqual([[expect.stringContaining('I’m still unwell')]]);
  expect(api.post).toHaveBeenCalledWith(props.baseUrl + '/rewrite', { agencyId: 4, audience: 'client', text: props.message.text, tone: 'warmer' }, { skipGlobalLoading: true });
});
it.each([{ text: {} }, { text: '[object Object]' }, {}])('keeps the user’s wording when a rewrite response is malformed %j', async data => {
  api.post.mockResolvedValue({ data }); wrapper = mount(Editor, { props });
  await button('Warmer').trigger('click'); await flushPromises();
  expect(wrapper.emitted('update:text')).toBeUndefined(); expect(wrapper.get('textarea').element.value).toBe(props.message.text);
  expect(wrapper.get('[role="alert"]').text()).toContain('wording has been kept');
});
it('previews the latest draft in a sandbox without sending or canceling anything', async () => {
  api.post.mockResolvedValue({ data: { html: '<p>Preview draft</p><script>alert(1)</script><img src="https://tracking.example/pixel"><a href="https://example.test/pay">Example button</a>' } });
  wrapper = mount(Editor, { props }); await button('Preview HTML email').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(1); expect(api.post.mock.calls[0][0]).toBe(props.baseUrl + '/email-preview');
  const iframe = wrapper.get('iframe'); expect(iframe.attributes('sandbox')).toBe('');
  expect(iframe.attributes('srcdoc')).toContain('Preview draft'); expect(iframe.attributes('srcdoc')).not.toContain('<script>');
  expect(iframe.attributes('srcdoc')).not.toContain('tracking.example'); expect(iframe.attributes('srcdoc')).not.toContain('href=');
  await wrapper.setProps({ message: { ...props.message, text: 'Edited after the preview' } });
  expect(wrapper.find('iframe').exists()).toBe(false); expect(button('Refresh HTML preview')).toBeTruthy();
});
it('does not overwrite newer manual edits when an earlier rewrite returns', async () => {
  let finish; api.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  wrapper = mount(Editor, { props }); await button('Warmer').trigger('click');
  await wrapper.setProps({ message: { ...props.message, text: 'My latest draft' } });
  finish({ data: { text: 'An older rewrite' } }); await flushPromises(); expect(wrapper.emitted('update:text')).toBeUndefined();
});
it('allows a read-only HTML preview after final review without offering rewrite controls', async () => {
  wrapper = mount(Editor, { props: { ...props, readOnly: true } });
  expect(wrapper.find('textarea').exists()).toBe(false); expect(button('Warmer')).toBeUndefined(); expect(button('Preview HTML email')).toBeTruthy();
});

it('refreshes the preview when its actor-owned review changes and passes only that reference',async()=>{
 api.post.mockResolvedValue({data:{html:'<p>Preview</p>'}});wrapper=mount(Editor,{props});
 await button('Preview HTML email').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith(props.baseUrl+'/email-preview',expect.not.objectContaining({school:expect.anything()}),expect.anything());
 await wrapper.setProps({reviewContext:{reviewToken:'review-token',date:'2026-11-24',itemKey:'school:3'}});expect(wrapper.find('iframe').exists()).toBe(false);
 await button('Refresh HTML preview').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith(props.baseUrl+'/email-preview',expect.objectContaining({reviewToken:'review-token',date:'2026-11-24',itemKey:'school:3'}),expect.anything());
});
