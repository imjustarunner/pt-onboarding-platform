export function nativeAudioConstraints(mediaDevices = globalThis?.navigator?.mediaDevices) {
  // autoGainControl OFF: AGC is what makes laptop mics "amplify the room" in
  // open-speaker meetings when Apple Voice Isolation is unavailable. Keep AEC/NS.
  const constraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false
  };
  try {
    const supported = mediaDevices?.getSupportedConstraints?.() || {};
    if (supported.voiceIsolation) constraints.voiceIsolation = true;
  } catch { /* use broadly-supported native constraints */ }
  return constraints;
}

function readTrackSettings(track) {
  try {
    return track?.getSettings?.() || {};
  } catch {
    return {};
  }
}

function voiceIsolationEnabled(settings = {}) {
  const vi = settings.voiceIsolation;
  if (vi === true) return true;
  const raw = String(vi ?? '').toLowerCase();
  return !!raw && raw !== 'off' && raw !== 'false' && raw !== '0';
}

/**
 * Ask the browser to enable Voice Isolation / AEC / NS on an already-live
 * microphone track (e.g. the one Vonage created). Does not replace the track.
 * Intentionally keeps autoGainControl disabled.
 */
export async function enhancePublishedAudioTrack(
  track,
  mediaDevices = globalThis?.navigator?.mediaDevices
) {
  if (!track || typeof track.applyConstraints !== 'function') {
    return {
      applied: false,
      voiceIsolation: false,
      constraints: null,
      settings: readTrackSettings(track)
    };
  }

  const constraints = nativeAudioConstraints(mediaDevices);
  const before = readTrackSettings(track);
  // Chrome on macOS often exposes voiceIsolation in getSettings() even when
  // getSupportedConstraints() omits it. Request it whenever the key exists.
  if (!('voiceIsolation' in constraints) && ('voiceIsolation' in before)) {
    constraints.voiceIsolation = true;
  }

  let applied = false;
  try {
    await track.applyConstraints(constraints);
    applied = true;
  } catch {
    // Some engines reject voiceIsolation on the first pass; retry core processing.
    const fallback = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false
    };
    try {
      await track.applyConstraints(fallback);
      applied = true;
    } catch { /* keep original capture constraints */ }
  }

  let settings = readTrackSettings(track);
  // Chromium sometimes accepts Voice Isolation only via the advanced form.
  // Always restate AEC/NS/AGC so an advanced-only call cannot leave AGC on.
  if (!voiceIsolationEnabled(settings) && ('voiceIsolation' in constraints || 'voiceIsolation' in before)) {
    try {
      await track.applyConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        advanced: [{ voiceIsolation: true }]
      });
      applied = true;
      settings = readTrackSettings(track);
    } catch { /* advanced Voice Isolation unsupported */ }
  }

  return {
    applied,
    voiceIsolation: voiceIsolationEnabled(settings),
    constraints,
    settings
  };
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
  // native echo/noise processing and Voice Isolation where the browser exposes it.
  await enhancePublishedAudioTrack(track, mediaDevices);
  return { stream, track, constraints };
}
