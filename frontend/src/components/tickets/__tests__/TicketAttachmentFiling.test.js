import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
import Panel from '../TicketAttachmentFiling.vue';
let wrapper;
const ticket = { id: 10, client_id: 30, client_full_name: 'Synthetic Client' };
const attachment = { id: 20, file_name: 'registration.pdf', mime_type: 'application/pdf', file_size: 16 * 1024 * 1024 };
const button = label => wrapper.findAll('button').find(b => b.text() === label);
const render = props => wrapper = mount(Panel, { props: { ticket: { ...ticket }, attachments: [{ ...attachment }], canFile: true, ...props } });
beforeEach(() => { vi.resetAllMocks(); api.post.mockResolvedValue({ data: { documentId: 99, alreadyAdded: false } }); });
afterEach(() => wrapper?.unmount());
describe('ticket attachment quick filing', () => {
  it('adds the original 16 MB attachment by ID without downloading or reuploading it', async () => {
    render(); expect(wrapper.text()).toContain('Synthetic Client'); expect(wrapper.text()).toContain('16.0 MB');
    await button('Add to client').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/support-tickets/10/attachments/20/add-to-client', { clientId: 30 }, { skipGlobalLoading: true });
    expect(api.get).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('File added to the client’s documents.');
    expect(button('Add to client')).toBeUndefined();
  });
  it('requires selecting a client before filing an unmatched email', async () => {
    render({ ticket: { id: 10 } }); expect(button('Add to client').attributes('disabled')).toBeDefined();
    await button('Choose client').trigger('click');
    api.get.mockResolvedValue({ data: { clients: [{ clientId: 30, fullName: 'Synthetic Client' }] } });
    await wrapper.find('input').setValue('Synthetic'); await wrapper.find('form').trigger('submit'); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/support-tickets/10/client-search', expect.objectContaining({ params: { q: 'Synthetic' } }));
    await button('Link this client').trigger('click'); expect(wrapper.emitted('link-client')[0][0]).toMatchObject({ clientId: 30 });
    expect(api.post).not.toHaveBeenCalled();
    await wrapper.setProps({ ticket }); expect(button('Add to client').attributes('disabled')).toBeUndefined();
  });
  it('shows existing additions after reloading the ticket', () => {
    render({ attachments: [{ ...attachment, client_document_id: 99, client_document_client_id: 30 }] });
    expect(wrapper.text()).toContain('Added to client'); expect(button('Add to client')).toBeUndefined();
  });
  it('does not show another linked client’s document as already added', () => {
    render({ attachments: [{ ...attachment, client_document_id: 99, client_document_client_id: 31 }] });
    expect(button('Add to client')).toBeDefined();
  });
  it('does not claim success if filing fails', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'The linked client changed.' } } } });
    render(); await button('Add to client').trigger('click'); await flushPromises();
    expect(wrapper.find('[role=alert]').text()).toBe('The linked client changed.'); expect(wrapper.find('[role=status]').exists()).toBe(false);
  });
  it('blocks oversized attachments before submitting', async () => {
    render({ attachments: [{ ...attachment, file_size: 26 * 1024 * 1024 }] });
    await button('Add to client').trigger('click'); expect(api.post).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('25 MB or smaller');
  });
  it('keeps opening attachments available without filing permission', async () => {
    render({ canFile: false }); expect(button('Add to client')).toBeUndefined();
    await button('registration.pdf').trigger('click'); expect(wrapper.emitted('open')[0][0]).toMatchObject({ id: 20 });
  });
  it('does not offer unsupported files for the client document collection', () => {
    render({ attachments: [{ ...attachment, mime_type: 'text/html', file_name: 'message.html' }] });
    expect(button('Add to client')).toBeUndefined();
  });
});
