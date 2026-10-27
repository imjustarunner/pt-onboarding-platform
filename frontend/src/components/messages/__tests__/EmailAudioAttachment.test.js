import { afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Audio from '../EmailAudioAttachment.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });
it('loads protected recordings only on request and revokes audio on a conversation change', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:recording'); URL.revokeObjectURL = vi.fn();
  api.get.mockResolvedValue({ data: new Blob(['recording']) });
  wrapper = mount(Audio, { props: { conversationId: 8, file: { id: 3, filename: 'Voicemail.mp3', content_type: 'application/octet-stream' } } });
  expect(api.get).not.toHaveBeenCalled();
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/communications/conversations/8/attachments/3', expect.objectContaining({ responseType:'blob' }));
  expect(wrapper.find('audio').attributes('src')).toBe('blob:recording');
  await wrapper.setProps({ conversationId:9 });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording'); expect(wrapper.find('audio').exists()).toBe(false);
});
it('uses client-record attachment authorization and displays retrieval errors', async () => {
  api.get.mockRejectedValue(new Error('denied'));
  wrapper = mount(Audio, { props: { conversationId:8, file:{id:3,filename:'Voicemail.wav',downloadPath:'/clients/2/communications/conversations/8/attachments/3'} } });
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(api.get.mock.calls.at(-1)[0]).toContain('/clients/2/'); expect(wrapper.find('[role=alert]').text()).toContain('Could not load');
});
