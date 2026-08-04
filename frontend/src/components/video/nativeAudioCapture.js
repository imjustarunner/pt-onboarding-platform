export function nativeAudioConstraints(mediaDevices = globalThis?.navigator?.mediaDevices) {
  const constraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };
  try {
    const supported = mediaDevices?.getSupportedConstraints?.() || {};
    if (supported.voiceIsolation) constraints.voiceIsolation = true;
  } catch { /* use broadly-supported native constraints */ }
  return constraints;
}

export async function acquireNativeAudioSource(mediaDevices = globalThis?.navigator?.mediaDevices) {
  if (!mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture is not supported in this browser.');
  }
  const constraints = nativeAudioConstraints(mediaDevices);
  const stream = await mediaDevices.getUserMedia({ audio: constraints, video: false });
  const track = stream?.getAudioTracks?.()?.[0] || null;
  if (!track) {
    for (const item of stream?.getTracks?.() || []) {
      try { item.stop(); } catch { /* ignore */ }
    }
    throw new Error('No microphone audio track was returned.');
  }
  // Chrome may resolve the default input only after capture begins. Applying
  // constraints to the concrete track ensures this exact published track has
  // native echo/noise/AGC and Voice Isolation where the browser exposes it.
  try { await track.applyConstraints?.(constraints); } catch { /* initial capture constraints still apply */ }
  return { stream, track, constraints };
}
