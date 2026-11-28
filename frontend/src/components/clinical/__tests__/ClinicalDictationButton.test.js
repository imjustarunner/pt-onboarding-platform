import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ClinicalDictationButton from '../ClinicalDictationButton.vue';
import { meetingAudioWav } from '../../../utils/meetingAudio';

vi.mock('../../../utils/meetingAudio', () => ({ meetingAudioWav: vi.fn() }));

const stopTrack = vi.fn();
const getUserMedia = vi.fn();
let originalMediaDevices;

class TestRecorder {
  static isTypeSupported(type) { return type === 'audio/mp4'; }
  mimeType = 'audio/mp4';
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable({ data: new Blob(['synthetic voice'], { type: this.mimeType }) });
    this.onstop();
  }
}

beforeEach(() => {
  originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal('MediaRecorder', TestRecorder);
  meetingAudioWav.mockResolvedValue(new Blob(['synthetic waveform'], { type: 'audio/wav' }));
});

afterEach(() => {
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else delete navigator.mediaDevices;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('converts native audio to WAV and appends the reviewed text only after approval', async () => {
  const post = vi.fn().mockResolvedValue({ data: { text: 'Draft dictation.' } });
  const wrapper = mount(ClinicalDictationButton, { props: {
    agencyId: 2, transport: { post }, endpoint: '/dictation', modelValue: 'Existing note.'
  } });
  await wrapper.get('button').trigger('click');
  await flushPromises();
  await wrapper.findAll('button').find(button => button.text() === 'Stop dictation').trigger('click');
  await flushPromises();

  const [endpoint, body] = post.mock.calls[0];
  expect(endpoint).toBe('/dictation');
  expect(body.get('agencyId')).toBe('2');
  expect(body.get('audio').type).toBe('audio/wav');
  expect(stopTrack).toHaveBeenCalled();
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  await wrapper.get('textarea').setValue('Reviewed dictation.');
  await wrapper.findAll('button').find(button => button.text() === 'Add to note').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([['Existing note.\n\nReviewed dictation.']]);
  wrapper.unmount();
});

it('discards capture from the old workspace without sending any audio', async () => {
  const post = vi.fn();
  const wrapper = mount(ClinicalDictationButton, { props: { agencyId: 2, transport: { post } } });
  await wrapper.get('button').trigger('click');
  await flushPromises();
  await wrapper.setProps({ agencyId: 6 });
  await flushPromises();
  expect(post).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalled();
  wrapper.unmount();
});
