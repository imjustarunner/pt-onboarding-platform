/**
 * Biometric authentication helper for Capacitor (iOS Face ID / Touch ID).
 *
 * Flow:
 *  - First login: password → success → saveToken(token, user)
 *  - Subsequent opens: hasSavedToken() → true → authenticate() → loadToken()
 */
import { Capacitor } from '@capacitor/core';

// Lazy-load native plugins so the web build never crashes
let _biometric = null;
let _preferences = null;

const getBiometric = async () => {
  if (_biometric) return _biometric;
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  _biometric = BiometricAuth;
  return _biometric;
};

const getPreferences = async () => {
  if (_preferences) return _preferences;
  const { Preferences } = await import('@capacitor/preferences');
  _preferences = Preferences;
  return _preferences;
};

const BIOMETRIC_TOKEN_KEY = 'biometric_auth_token';
const BIOMETRIC_USER_KEY  = 'biometric_auth_user';

/** Returns true only when running in Capacitor native context */
export const isNativePlatform = () => Capacitor.isNativePlatform();

/**
 * Check if the device supports biometrics AND the user has a saved token.
 * Returns { available: bool, biometryType: string | null }
 */
export const checkBiometricAvailability = async () => {
  if (!isNativePlatform()) return { available: false, biometryType: null };
  try {
    const Bio = await getBiometric();
    const info = await Bio.checkBiometry();
    if (!info.isAvailable) return { available: false, biometryType: null };
    return { available: true, biometryType: info.biometryType || 'biometric' };
  } catch {
    return { available: false, biometryType: null };
  }
};

/** Returns true if there's a saved biometric token in Preferences */
export const hasSavedToken = async () => {
  if (!isNativePlatform()) return false;
  try {
    const Pref = await getPreferences();
    const { value } = await Pref.get({ key: BIOMETRIC_TOKEN_KEY });
    return !!value;
  } catch {
    return false;
  }
};

/**
 * Prompt the user for biometrics. Returns { success, token, user } on success,
 * or { success: false, error } on failure / cancel.
 */
export const authenticateWithBiometrics = async (reason = 'Sign in to Summit Stats') => {
  if (!isNativePlatform()) return { success: false, error: 'Not a native platform' };
  try {
    const Bio  = await getBiometric();
    const Pref = await getPreferences();

    await Bio.authenticate({ reason, cancelTitle: 'Use Password' });

    // Authentication passed — retrieve stored credentials
    const [tokenRes, userRes] = await Promise.all([
      Pref.get({ key: BIOMETRIC_TOKEN_KEY }),
      Pref.get({ key: BIOMETRIC_USER_KEY }),
    ]);
    const token = tokenRes.value || null;
    const user  = userRes.value ? JSON.parse(userRes.value) : null;
    if (!token) return { success: false, error: 'No stored token found' };
    return { success: true, token, user };
  } catch (err) {
    // User cancelled or biometry failed — fall back to password
    const msg = err?.message || String(err);
    return { success: false, error: msg };
  }
};

/**
 * Persist auth token + user after a successful password login so biometrics
 * can unlock it on the next open.
 */
export const saveBiometricToken = async (token, user) => {
  if (!isNativePlatform() || !token) return;
  try {
    const Pref = await getPreferences();
    await Promise.all([
      Pref.set({ key: BIOMETRIC_TOKEN_KEY, value: String(token) }),
      Pref.set({ key: BIOMETRIC_USER_KEY,  value: JSON.stringify(user || {}) }),
    ]);
  } catch { /* ignore */ }
};

/** Clear stored biometric credentials (e.g. on logout) */
export const clearBiometricToken = async () => {
  if (!isNativePlatform()) return;
  try {
    const Pref = await getPreferences();
    await Promise.all([
      Pref.remove({ key: BIOMETRIC_TOKEN_KEY }),
      Pref.remove({ key: BIOMETRIC_USER_KEY }),
    ]);
  } catch { /* ignore */ }
};
