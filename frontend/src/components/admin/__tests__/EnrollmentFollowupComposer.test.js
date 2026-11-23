import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
import Dialog from '../ClientTerminationDialog.vue';
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async url => ({ data: url.endsWith('termination-providers') ? { providers: [] } : { from: 'schools@itsco.health', replyTo: 'schools@itsco.health', schoolName: 'Example School', agencyName: 'ITSCO', recipients: ['family@example.com'] } }));
  api.post.mockImplementation(async url => ({ data: url.endsWith('/preview') ? { html: '<html><body>Branded preview</body></html>' } : { sent: true, clientId: 51 } }));
});
afterEach(() => wrapper?.unmount());
async function open() {
  wrapper = mount(Dialog, { props: { clientId: 51, clientName: 'Example Client', agencyId: 2 }, global: { stubs: { Teleport: true } } });
  await flushPromises();
  await wrapper.get('.termination-email-toggle input').setValue(true);
  await flushPromises();
}
it('builds an editable email from selected reasons and sends from schools@ with optional termination details', async () => {
  await open();
  expect(wrapper.text()).toContain('From: schools@itsco.health');
  expect(wrapper.get('#followup-recipient').element.value).toBe('family@example.com');
  await wrapper.get('input[value="insurance"]').setValue(true);
  await wrapper.get('input[value="tricare"]').setValue(true);
  await wrapper.get('input[value="grant"]').setValue(true);
  expect(wrapper.get('#followup-message').element.value).toContain('with ITSCO at Example School');
  expect(wrapper.get('#followup-message').element.value).toContain('TRICARE');
  expect(wrapper.get('#followup-message').element.value).toContain('MH4Kidz');
  await wrapper.get('#followup-message').setValue('Rachel reviewed and edited this email.');
  await wrapper.get('[role="dialog"]').trigger('submit');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clients/51/enrollment-followup', expect.objectContaining({
    request_key: expect.any(String), disposition: 'inactive', termination_date: null, termination_last_provider_id: null,
    email: { to: 'family@example.com', subject: expect.stringContaining('Example School'), text: 'Rachel reviewed and edited this email.' }, reasons: ['insurance', 'tricare', 'grant']
  }), { headers: { 'X-Agency-Id': '2' } });
  expect(wrapper.emitted('saved')[0][0]).toMatchObject({ clientId: 51, disposition: 'inactive', emailed: true });
});
it('keeps manual edits when another checkbox is selected', async () => {
  await open();
  await wrapper.get('#followup-message').setValue('Keep these edits.');
  await wrapper.get('input[value="paperwork"]').setValue(true);
  expect(wrapper.get('#followup-message').element.value).toBe('Keep these edits.');
  const generate = wrapper.findAll('button').find(button => button.text() === 'Update draft from checked items');
  await generate.trigger('click');
  expect(wrapper.get('#followup-message').element.value).toContain('missing paperwork');
});
it('keeps school waitlist and inactive choices consistent', async () => {
  await open();
  await wrapper.get('input[value="school_waitlist"]').setValue(true);
  expect(wrapper.get('#followup-disposition').element.value).toBe('waitlist');
  expect(wrapper.get('#followup-disposition option[value="inactive"]').element.disabled).toBe(true);
  expect(wrapper.get('#followup-message').element.value).toContain('remain on the school waitlist');
  expect(wrapper.get('.termination-submit').text()).toBe('Send email + keep on waitlist');
});
it('previews the edited email in a sandboxed frame before sending', async () => {
  await open();
  await wrapper.get('#followup-message').setValue('Edited preview body.');
  await wrapper.findAll('button').find(button => button.text() === 'Preview branded email').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clients/51/enrollment-followup/preview', { text: 'Edited preview body.' }, { headers: { 'X-Agency-Id': '2' } });
  expect(wrapper.get('iframe').attributes('sandbox')).toBe('');
  expect(wrapper.get('iframe').attributes('srcdoc')).toContain('Branded preview');
  expect(wrapper.emitted('saved')).toBeUndefined();
});
it('retries the same accepted email request without allowing edits or a new send key', async () => {
  await open();
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Email sent; retry completion.', followupSent: true } } } });
  await wrapper.get('[role="dialog"]').trigger('submit');
  await flushPromises();
  const first = api.post.mock.calls[0][1];
  expect(wrapper.get('.termination-submit').text()).toBe('Finish status change');
  expect(wrapper.get('.followup-composer fieldset').element.disabled).toBe(true);
  await wrapper.get('[role="dialog"]').trigger('submit');
  await flushPromises();
  expect(api.post.mock.calls[1][1]).toEqual(first);
});
it('blocks another send when delivery needs review', async () => {
  await open();
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Delivery needs review.', deliveryReview: true } } } });
  await wrapper.get('[role="dialog"]').trigger('submit');
  await flushPromises();
  expect(wrapper.get('.termination-submit').element.disabled).toBe(true);
  await wrapper.get('[role="dialog"]').trigger('submit');
  expect(api.post).toHaveBeenCalledOnce();
});
it('resumes an already-sent follow-up after closing and reopening the form', async () => {
  const pending = { requestKey: 'original_request_123456', state: 'sent', reviewed: {
    to: 'family@example.com', subject: 'Original reviewed subject', text: 'Original reviewed message', reasons: ['paperwork'], disposition: 'inactive',
    details: { termination_reason: 'Missing paperwork', termination_effective_date: null, termination_last_provider_id: null }
  } };
  const get = api.get.getMockImplementation();
  api.get.mockImplementation(async url => {
    const result = await get(url);
    if (url.endsWith('/enrollment-followup')) result.data.pendingFollowup = pending;
    return result;
  });
  await open();
  expect(wrapper.get('.termination-submit').text()).toBe('Finish status change');
  expect(wrapper.get('#followup-message').element.value).toBe('Original reviewed message');
  await wrapper.get('[role="dialog"]').trigger('submit');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clients/51/enrollment-followup', expect.objectContaining({ request_key: 'original_request_123456', termination_reason: 'Missing paperwork', email: expect.objectContaining({ subject: 'Original reviewed subject', text: 'Original reviewed message' }) }), expect.any(Object));
});
