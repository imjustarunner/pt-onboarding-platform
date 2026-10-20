import { isBachelorsCredentialText } from './credentialNormalization.js';
import { isStudentIntern } from './studentIntern.js';

export function isProviderUpdateLicenseExempt(user = {}) {
  // A degree or student placement is not a clinical license. Preserve the
  // requirement when the profile also names an actual license/candidate credential.
  const credential = String(user.credential || '');
  if (/\b(?:LPC|LPCC|LCSW|LSW|SWC|LMFT|MFTC|LMFTC|LMHC|LCPC|LAC|LPSY|LP|RN|APRN|NP|MD|DO)\b/i.test(credential)) return false;
  return isBachelorsCredentialText(credential) || isStudentIntern(user);
}
