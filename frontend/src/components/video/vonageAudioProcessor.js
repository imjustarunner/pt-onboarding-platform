/**
 * Vonage "advancedNoiseSuppression" loads a TensorFlow Lite WASM model
 * (DtlnTransformer / TfLiteXNNPackDelegate). On iPad/Safari that work:
 *   - delays Session.publish past the SDK timeout
 *   - blocks mute/unmute while applyAudioFilter hangs
 *   - can crash WebKit (Awesnap)
 *
 * Browser AEC/NS + Apple Voice Isolation stay on via nativeAudioCapture.js.
 */

export function isConstrainedVideoDevice(nav = globalThis?.navigator) {
  if (!nav) return false;
  const ua = String(nav.userAgent || '');
  const platform = String(nav.platform || '');
  if (/iPad|iPhone|iPod/i.test(ua) || /iPad|iPhone|iPod/i.test(platform)) return true;
  // iPadOS 13+ reports as MacIntel but has touch points.
  if (platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1) return true;
  if (String(nav.vendor || '').includes('Apple') && Number(nav.maxTouchPoints || 0) > 0) return true;
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Firefox|Android/i.test(ua);
  return isSafari;
}

export function shouldUseVonageAdvancedNoiseSuppression(OTApi, nav = globalThis?.navigator) {
  // Never auto-enable. The TfLite WASM filter (DtlnTransformer) still crashes
  // Chrome (Aw Snap) and Safari on real meetings, even on desktop.
  void OTApi;
  void nav;
  return false;
}

export function isPublishTimeoutError(err) {
  const name = String(err?.name || '');
  const msg = String(err?.message || err || '');
  return name === 'OT_TIMEOUT'
    || /could not publish in a reasonable amount of time/i.test(msg)
    || /OT_TIMEOUT/i.test(msg);
}
