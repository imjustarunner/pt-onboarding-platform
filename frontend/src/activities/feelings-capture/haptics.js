/**
 * Optional haptic feedback for Feelings Capture.
 * Vibration is never required; callers must respect an explicit user toggle
 * that defaults to off (spec §24.7).
 */

/**
 * @param {boolean} enabled - User preference (default off)
 * @param {number|number[]} [pattern=12] - Vibration pattern in ms
 * @returns {boolean} Whether vibration was attempted
 */
export function maybeVibrate(enabled, pattern = 12) {
  if (!enabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    return !!navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/**
 * Soft double-tap feedback for capture (still optional).
 */
export function maybeCaptureHaptic(enabled) {
  return maybeVibrate(enabled, [10, 40, 10]);
}
