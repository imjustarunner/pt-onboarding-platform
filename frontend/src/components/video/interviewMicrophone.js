import { nativeAudioConstraints } from './nativeAudioCapture';

function stopTracks(stream) {
  for (const track of stream?.getTracks() || []) track.stop();
}

// getUserMedia has no abort signal. Give the request its own same-origin
// document so Leave can discard the browser context that owns the prompt.
export function openInterviewMicrophone({ deviceId, autoGainControl, noiseReduction } = {}) {
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');
  frame.title = 'Interview microphone';
  document.body.appendChild(frame);

  let stopped = false;
  let stream;
  function stop() {
    if (stopped) return;
    stopped = true;
    frame.remove();
    stopTracks(stream);
    stream = null;
  }

  async function acquire() {
    try {
      const devices = frame.contentWindow?.navigator.mediaDevices;
      if (!devices?.getUserMedia) throw new Error('Microphone capture is unavailable in this browser.');
      const audio = nativeAudioConstraints(devices, { autoGainControl, noiseReduction });
      if (deviceId && deviceId !== 'default') audio.deviceId = { exact: deviceId };
      const acquired = await devices.getUserMedia({ audio, video: false });
      if (stopped) {
        stopTracks(acquired);
        throw new DOMException('Microphone capture canceled.', 'AbortError');
      }
      stream = acquired;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('No live microphone track was returned.');
      return track;
    } catch (error) {
      stop();
      throw error;
    }
  }

  return { track: acquire(), stop };
}
