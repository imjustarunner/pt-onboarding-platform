// Local playback only: never opens a microphone or publishes audio to the call.
export function createWaitingRoomChime(onReady = () => {}) {
  let context, pending = false, disposed = false, lastPlayed = -Infinity;
  function playPending() {
    const ready = !disposed && context?.state === 'running';
    onReady(!!ready);
    if (!ready || !pending) return;
    pending = false;
    const now = context.currentTime;
    if (now - lastPlayed < 1) return; // Batch simultaneous guest/member arrivals.
    lastPlayed = now;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.setValueAtTime(880, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + 0.46);
  }
  function enable() {
    if (disposed) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { onReady(false); return; }
      if (!context) { context = new AudioContext(); context.onstatechange = playPending; }
      if (context.state === 'suspended') void context.resume().then(playPending).catch(() => onReady(false));
      playPending();
    } catch { onReady(false); }
  }
  return {
    enable,
    play() { pending = true; enable(); },
    cancelPending() { pending = false; },
    dispose() {
      disposed = true; pending = false;
      if (context) { context.onstatechange = null; void context.close().catch(() => {}); }
    }
  };
}
