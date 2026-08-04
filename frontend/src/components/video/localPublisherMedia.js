/**
 * A publisher preview must never render its own audio locally. If a browser or
 * SDK-created media node loses its muted flag while it is reparented, the mic
 * can recapture that playback and create an escalating delayed echo loop.
 */
export function silenceLocalPublisherMedia(root) {
  if (!root) return 0;
  const media = [];
  if (typeof root.matches === 'function' && root.matches('video, audio')) media.push(root);
  if (typeof root.querySelectorAll === 'function') {
    media.push(...root.querySelectorAll('video, audio'));
  }
  const unique = [...new Set(media)];
  for (const element of unique) {
    try { element.muted = true; } catch { /* ignore */ }
    try { element.defaultMuted = true; } catch { /* ignore */ }
    try { element.volume = 0; } catch { /* ignore */ }
    try { element.setAttribute?.('muted', ''); } catch { /* ignore */ }
    try { element.setAttribute?.('playsinline', ''); } catch { /* ignore */ }
  }
  return unique.length;
}

/**
 * Add the first microphone track to an already-published muted publisher.
 * Vonage supports replacing the audio source directly; rebuilding the whole
 * publisher also destroys the live camera, which is unreliable on iPad.
 */
export async function attachPublisherAudioSource(publisher, audioSource) {
  const track = audioSource?.track || null;
  if (!publisher || typeof publisher.setAudioSource !== 'function') {
    throw new Error('This video publisher cannot attach a microphone without restarting the camera.');
  }
  if (!track) throw new Error('No microphone track was available.');
  try {
    await publisher.setAudioSource(track);
    return audioSource;
  } catch (error) {
    for (const mediaTrack of audioSource?.stream?.getTracks?.() || []) {
      try { mediaTrack.stop(); } catch { /* ignore */ }
    }
    throw error;
  }
}
